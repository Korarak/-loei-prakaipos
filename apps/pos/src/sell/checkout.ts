import type { Order, Payment, PaymentMethod, Satang } from '@prakaipos/shared';
import { calcChange, newUuid } from '@prakaipos/shared';
import { takeNextOrderNo } from '../auth/device.js';
import { db } from '../db/db.js';
import { enqueue } from '../db/outbox.js';
import { subtotal, total, type CartState } from './cart.js';

/**
 * ปิดบิลและบันทึกการขาย
 *
 * นี่คือจุดที่เงินจริงถูกบันทึก ลำดับจึงสำคัญมาก:
 *
 *   1. ขอเลขบิล (บันทึกความคืบหน้าลงเครื่องทันที)
 *   2. เขียนบิลลง IndexedDB
 *   3. เข้าคิวรอส่งขึ้นคลาวด์
 *
 * ข้อ 2 ต้องสำเร็จก่อนหน้าจอจะบอกว่า "ปิดบิลแล้ว" ส่วนข้อ 3 ล้มเหลวได้
 * โดยไม่กระทบการขาย เพราะคิวจะลองใหม่เอง
 *
 * **ไม่เรียกเซิร์ฟเวอร์ตรงเลย** แม้จะมีเน็ตอยู่ก็ตาม เพื่อให้เส้นทางการขาย
 * มีเส้นทางเดียวเสมอ ถ้าแยกเส้นทางตอนมีเน็ตจะเกิดบั๊กที่โผล่เฉพาะตอนเน็ตดี
 * ซึ่งเป็นบั๊กที่หายากที่สุดเวลาลูกค้าแจ้ง
 */

export interface CheckoutInput {
  shopId: string;
  staffId: string;
  cart: CartState;
  method: PaymentMethod;
  /**
   * เงินที่รับมาจริง (เงินสด) — อาจมากกว่ายอดบิลแล้วทอน
   * พร้อมเพย์ให้ส่งเท่ากับยอดบิลพอดี
   */
  received: Satang;
  /** เลขโต๊ะ — ว่างได้สำหรับร้านตามสั่ง */
  tableNo?: string;
  /** รอบนั่งที่บิลนี้มาจาก QR order — ว่างได้สำหรับบิลที่พนักงานคีย์เอง */
  tableSessionId?: string;
}

export interface CheckoutResult {
  order: Order;
  change: Satang;
}

/** แปลงบิลเป็นรูปแบบที่ PocketBase รับ */
export function toServerPayload(order: Order): Record<string, unknown> {
  return {
    client_uuid: order.clientUuid,
    shop: order.shopId,
    order_no: order.orderNo,
    channel: order.channel,
    status: order.status,
    table_no: order.tableNo,
    lines: order.lines,
    subtotal: order.subtotal,
    discount: order.discount,
    total: order.total,
    payment: order.payment,
    staff: order.staffId,
  };
}

export async function checkout(
  input: CheckoutInput,
  now: Date = new Date(),
): Promise<CheckoutResult> {
  const { shopId, staffId, cart, method, received, tableNo = '', tableSessionId = '' } = input;

  if (cart.lines.length === 0) {
    throw new Error('บิลว่าง ยังปิดไม่ได้');
  }

  const due = total(cart);

  // เงินสดที่รับมาต้องไม่น้อยกว่ายอดบิล — ถ้าน้อยกว่าแปลว่ายังจ่ายไม่ครบ
  // ปล่อยผ่านไปแล้วยอดสิ้นวันจะไม่ตรงและหาสาเหตุยากมาก
  if (received < due) {
    throw new Error(
      `รับเงินมา ${(received / 100).toFixed(2)} บาท น้อยกว่ายอดบิล ${(due / 100).toFixed(2)} บาท`,
    );
  }

  // ขอเลขบิลก่อนเขียนอะไร — ถ้าช่วงเลขหมดจะได้ล้มตั้งแต่ยังไม่บันทึกอะไรเลย
  const orderNo = await takeNextOrderNo();

  const payment: Payment = {
    method,
    amount: received,
    change: method === 'cash' ? calcChange(due, received) : 0,
    paidAt: now.toISOString(),
  };

  const order: Order = {
    clientUuid: newUuid(),
    shopId,
    orderNo,
    channel: 'pos',
    status: 'paid',
    tableNo,
    tableSessionId,
    lines: cart.lines,
    subtotal: subtotal(cart),
    discount: cart.discount,
    total: due,
    payment,
    staffId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  // เขียนลงเครื่องก่อน — ต้องสำเร็จก่อนหน้าจอจะบอกว่าปิดบิลแล้ว
  await db.orders.put(order);

  // เข้าคิว — ล้มเหลวได้โดยไม่กระทบการขาย คิวจะลองใหม่เอง
  await enqueue({
    collection: 'orders',
    op: 'create',
    clientUuid: order.clientUuid,
    payload: toServerPayload(order),
  });

  return { order, change: payment.change };
}

/**
 * ยกเลิกบิลที่ปิดไปแล้ว
 *
 * ไม่ลบทิ้ง เปลี่ยนสถานะเป็น void เพื่อให้ตรวจสอบย้อนหลังได้ว่า
 * ใครยกเลิกอะไรเมื่อไร — ร้านที่เงินหายมักเริ่มสืบจากตรงนี้
 */
export async function voidOrder(clientUuid: string, now: Date = new Date()): Promise<void> {
  const order = await db.orders.get(clientUuid);
  if (!order) throw new Error('ไม่พบบิลนี้ในเครื่อง');
  if (order.status === 'void') return;

  const updatedAt = now.toISOString();
  await db.orders.update(clientUuid, { status: 'void', updatedAt });

  await enqueue({
    collection: 'orders',
    op: 'update',
    clientUuid,
    payload: { status: 'void' },
  });
}

/** บิลของวันนี้ เรียงใหม่สุดขึ้นก่อน — ใช้กับหน้ารายการบิลและรายงาน */
export async function ordersOfDay(shopId: string, day: Date): Promise<Order[]> {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const all = await db.orders.where('shopId').equals(shopId).toArray();
  return all
    .filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= start.getTime() && t < end.getTime();
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
