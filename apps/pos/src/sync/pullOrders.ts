import type { Order, OrderLine } from '@prakaipos/shared';
import { db, getSetting, setSetting } from '../db/db.js';
import { pb } from './pb.js';

/**
 * ดึงบิลของร้าน "ทุกเครื่อง" ลงมาเก็บในเครื่องนี้
 *
 * เดิม `db.orders` มีแต่บิลที่เครื่องนี้ขายเอง (เขียนตรงใน checkout.ts ตอนปิดบิล)
 * ร้านที่มี 2 เครื่องขึ้นไปจะเห็นหน้าบิลย้อนหลัง (OrdersScreen) ไม่ครบ ฟังก์ชันนี้
 * เติมส่วนที่ขาด — ขอเฉพาะที่ `updated` ใหม่กว่าครั้งก่อน เหมือน pullMenu.ts
 * (เหตุผลที่ใช้ค่า updated จากเซิร์ฟเวอร์เป็น cursor แทนเวลาเครื่องตัวเอง ดู
 * คอมเมนต์ใน pullMenu.ts)
 *
 * **ต่างจาก pullMenu ตรงที่ไม่ต้องกวาดทั้งหมดเป็นระยะเพื่อลบของที่หายไป** —
 * บิลลบไม่ได้ที่ฝั่งเซิร์ฟเวอร์ (`deleteRule: null`) มีแต่เปลี่ยนสถานะเป็น void
 * ดึงแบบ "เฉพาะที่เปลี่ยน" อย่างเดียวก็พอ ไม่ต้องมี full sweep
 *
 * **บิลที่ยกเลิกแล้วในเครื่อง (void) ไม่ยอมให้ของที่ดึงมาทับกลับเป็นสถานะเดิม**
 * เพราะระหว่างที่คิวส่งอัปเดต void ยังไม่ถึงเซิร์ฟเวอร์ ถ้าดึงมาทับบิลนั้นจะ
 * "ฟื้น" ชั่วคราวจนกว่าคิวจะส่งสำเร็จ — void เป็นสถานะปลายทาง เปลี่ยนกลับไม่ได้
 * อยู่แล้วตามกติกาเดิมของ voidOrder ใน checkout.ts
 */

const KEY_CURSOR = 'sync.orders.cursor';

interface OrderRecord {
  id: string;
  client_uuid: string;
  shop: string;
  order_no: number;
  channel: Order['channel'];
  status: Order['status'];
  table_no: string;
  lines: OrderLine[] | null;
  subtotal: number;
  discount: number;
  total: number;
  payment: Order['payment'];
  staff: string;
  created: string;
  updated: string;
}

function toOrder(r: OrderRecord): Order {
  return {
    clientUuid: r.client_uuid,
    id: r.id,
    shopId: r.shop,
    orderNo: r.order_no,
    channel: r.channel,
    status: r.status,
    tableNo: r.table_no,
    // ไม่เคยถูกส่งขึ้นเซิร์ฟเวอร์เลย (ดู toServerPayload ใน checkout.ts) —
    // บิลที่ดึงจากเครื่องอื่นจึงว่างช่องนี้เสมอ เหมือนกับบิลที่เครื่องนี้
    // สร้างเองแล้วซิงก์ขึ้นไปแล้วดึงกลับมา
    tableSessionId: '',
    lines: r.lines ?? [],
    subtotal: r.subtotal,
    discount: r.discount,
    total: r.total,
    payment: r.payment,
    staffId: r.staff,
    createdAt: r.created,
    updatedAt: r.updated,
  };
}

function maxUpdated(records: readonly { updated: string }[], current: string): string {
  return records.reduce((max, r) => (r.updated > max ? r.updated : max), current);
}

export interface PullOrdersResult {
  pulled: number;
  /** จำนวนที่ข้ามเพราะในเครื่องยกเลิก (void) ไปแล้ว — void เปลี่ยนกลับไม่ได้ */
  skippedVoid: number;
}

/**
 * ดึงบิลของร้านลงเครื่อง
 *
 * โยน error ถ้าติดต่อเซิร์ฟเวอร์ไม่ได้ — ผู้เรียกตัดสินใจเองว่าจะเงียบไว้
 * (หน้าบิลย้อนหลังยังอ่านบิลที่เครื่องนี้มีอยู่ได้ตามปกติ) หรือจะแจ้งผู้ใช้
 */
export async function pullOrders(shopId: string): Promise<PullOrdersResult> {
  const cursor = await getSetting<string>(KEY_CURSOR, '');
  const changedOnly = cursor ? ` && updated > "${cursor}"` : '';

  const records = await pb.collection('orders').getFullList<OrderRecord>({
    filter: `shop="${shopId}"${changedOnly}`,
    sort: 'updated',
  });

  let skippedVoid = 0;
  const toWrite: Order[] = [];
  for (const r of records) {
    const local = await db.orders.get(r.client_uuid);
    if (local?.status === 'void' && r.status !== 'void') {
      skippedVoid++;
      continue;
    }
    toWrite.push(toOrder(r));
  }

  if (toWrite.length) await db.orders.bulkPut(toWrite);

  const next = maxUpdated(records, cursor);
  if (next !== cursor) await setSetting(KEY_CURSOR, next);

  return { pulled: toWrite.length, skippedVoid };
}

/** ล้าง cursor เพื่อให้รอบถัดไปดึงบิลทั้งหมดใหม่ — ใช้ตอนเปลี่ยนร้านหรือแก้ปัญหา */
export async function resetOrdersCursor(): Promise<void> {
  await setSetting(KEY_CURSOR, '');
}
