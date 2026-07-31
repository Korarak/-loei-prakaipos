import type { MenuItem, OrderLine, Satang } from '@prakaipos/shared';
import { newUuid, sumLines } from '@prakaipos/shared';

/**
 * ตะกร้าของหน้าขาย
 *
 * เขียนเป็นฟังก์ชันล้วน (รับเข้า–คืนออก ไม่แก้ของเดิม) เพื่อให้ทดสอบได้
 * โดยไม่ต้องเปิดหน้าจอ ตรรกะการคิดเงินคือส่วนที่พลาดแล้วเสียหายเป็นเงินจริง
 * จึงต้องแยกออกมาจาก React ให้ชัด
 *
 * รายการในตะกร้าเก็บ **ชื่อและราคา ณ เวลาที่กด** ไม่ใช่อ้างไปที่เมนู
 * เพราะเจ้าของร้านอาจแก้ราคาระหว่างที่บิลยังเปิดอยู่ แล้วยอดที่ลูกค้าเห็น
 * ตอนกดสั่งกับตอนจ่ายจะไม่ตรงกัน
 */

export interface CartState {
  lines: OrderLine[];
  /** ส่วนลดท้ายบิล หน่วยสตางค์ */
  discount: Satang;
}

export const emptyCart: CartState = { lines: [], discount: 0 };

/**
 * เพิ่มเมนูลงตะกร้า
 *
 * รายการเดียวกันที่หมายเหตุตรงกันจะรวมจำนวน แต่ถ้าหมายเหตุต่างกัน
 * ต้องแยกบรรทัด เพราะครัวต้องทำคนละแบบ
 */
export function addItem(
  cart: CartState,
  item: MenuItem,
  qty = 1,
  note = '',
): CartState {
  if (qty <= 0) return cart;

  const idx = cart.lines.findIndex(
    (l) => l.menuItemId === item.id && l.note === note,
  );

  if (idx >= 0) {
    return {
      ...cart,
      lines: cart.lines.map((l, i) => (i === idx ? { ...l, qty: l.qty + qty } : l)),
    };
  }

  const line: OrderLine = {
    clientUuid: newUuid(),
    menuItemId: item.id,
    nameSnapshot: item.name,
    unitPrice: item.price,
    qty,
    note,
    orderedBy: '',
  };

  return { ...cart, lines: [...cart.lines, line] };
}

/** ปรับจำนวน — ลดถึง 0 แล้วรายการหายจากตะกร้า */
export function setQty(cart: CartState, lineUuid: string, qty: number): CartState {
  if (qty <= 0) {
    return { ...cart, lines: cart.lines.filter((l) => l.clientUuid !== lineUuid) };
  }
  return {
    ...cart,
    lines: cart.lines.map((l) => (l.clientUuid === lineUuid ? { ...l, qty } : l)),
  };
}

export function removeLine(cart: CartState, lineUuid: string): CartState {
  return { ...cart, lines: cart.lines.filter((l) => l.clientUuid !== lineUuid) };
}

export function setNote(cart: CartState, lineUuid: string, note: string): CartState {
  return {
    ...cart,
    lines: cart.lines.map((l) => (l.clientUuid === lineUuid ? { ...l, note } : l)),
  };
}

/**
 * ตั้งส่วนลดท้ายบิล
 *
 * จำกัดไม่ให้เกินยอดรวม — บิลติดลบไม่มีความหมายและจะทำให้รายงานเพี้ยน
 * ถ้าเจ้าของร้านอยากแจกฟรี ส่วนลดเท่ากับยอดรวมพอดีก็ได้ยอดสุทธิ 0
 */
export function setDiscount(cart: CartState, discount: Satang): CartState {
  const capped = Math.max(0, Math.min(Math.round(discount), subtotal(cart)));
  return { ...cart, discount: capped };
}

export function subtotal(cart: CartState): Satang {
  return sumLines(cart.lines);
}

/** ยอดที่ต้องจ่ายจริง ไม่ต่ำกว่า 0 */
export function total(cart: CartState): Satang {
  return Math.max(0, subtotal(cart) - cart.discount);
}

/** จำนวนชิ้นรวมทุกรายการ — ใช้แสดงบนปุ่มตะกร้า */
export function itemCount(cart: CartState): number {
  return cart.lines.reduce((sum, l) => sum + l.qty, 0);
}

export function isEmpty(cart: CartState): boolean {
  return cart.lines.length === 0;
}

/**
 * ปรับส่วนลดให้ไม่เกินยอดรวมหลังจากรายการเปลี่ยน
 *
 * เคสจริง: พนักงานตั้งส่วนลด 50 บาทบนบิล 200 บาท แล้วลูกค้าขอเอาของออก
 * จนเหลือ 30 บาท ถ้าไม่ปรับ ส่วนลดจะมากกว่ายอดและยอดสุทธิติดลบ
 */
export function reconcileDiscount(cart: CartState): CartState {
  return cart.discount > subtotal(cart) ? setDiscount(cart, subtotal(cart)) : cart;
}
