import type { Satang, SelectedModifier } from '@prakaipos/shared';
import { modifiersKey } from '@prakaipos/shared';

/**
 * ตะกร้าของลูกค้า เก็บใน localStorage
 *
 * ทำไมต้องเก็บ: ลูกค้ามักสลับไปตอบแชทกลางคันแล้วกลับมา ถ้าตะกร้าหาย
 * เขาจะเลิกสั่งผ่าน QR แล้วเรียกพนักงานแทน ซึ่งทำให้จุดขายหลักของเราไร้ความหมาย
 * (เอกสารออกแบบหัวข้อ 07)
 *
 * แยกตะกร้าตามโต๊ะ เพราะลูกค้าคนเดียวอาจสแกนหลายโต๊ะในร้านเดียวกัน
 * และของที่ค้างจากโต๊ะก่อนต้องไม่โผล่มาปนกัน
 */

export interface CartLine {
  menuItemId: string;
  name: string;
  unitPrice: Satang;
  qty: number;
  note: string;
  /** เก็บไว้แสดงผลในตะกร้าเท่านั้น — ราคาสุดท้ายเซิร์ฟเวอร์คิดเองจาก modifierOptionIds เสมอ */
  modifiers: SelectedModifier[];
  /** id ของตัวเลือกที่เลือกจริง — ส่งไปให้เซิร์ฟเวอร์ตรวจและคิดราคาใหม่ตอนสั่ง (ดู submitOrder.ts) */
  modifierOptionIds: string[];
}

const PREFIX = 'prakaipos.cart';

function keyFor(shopCode: string, tableNo: string): string {
  return `${PREFIX}.${shopCode}.${tableNo}`;
}

export function loadCart(shopCode: string, tableNo: string): CartLine[] {
  try {
    const raw = localStorage.getItem(keyFor(shopCode, tableNo));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // กรองทิ้งรายการที่รูปแบบไม่ตรง — ข้อมูลใน localStorage อาจเป็นของเวอร์ชันเก่า
    // หรือถูกแก้ด้วยมือ ปล่อยผ่านแล้วหน้าจอจะพังตอน render
    return parsed
      .filter(isCartLine)
      .map((l) => ({ ...l, modifiers: l.modifiers ?? [], modifierOptionIds: l.modifierOptionIds ?? [] }));
  } catch {
    // JSON เสีย หรือ localStorage ถูกปิด (โหมดส่วนตัวของ Safari)
    // ทั้งสองกรณีให้เริ่มตะกร้าใหม่ ดีกว่าหน้าขาวทั้งหน้า
    return [];
  }
}

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== 'object' || value === null) return false;
  const l = value as Record<string, unknown>;
  return (
    typeof l.menuItemId === 'string' &&
    typeof l.name === 'string' &&
    typeof l.unitPrice === 'number' &&
    Number.isInteger(l.unitPrice) &&
    typeof l.qty === 'number' &&
    Number.isInteger(l.qty) &&
    l.qty > 0 &&
    typeof l.note === 'string' &&
    // ตะกร้าเก่าก่อนมีตัวเลือกไม่มีฟิลด์นี้ — ถือว่าไม่มีตัวเลือกแทนที่จะทิ้งทั้งบรรทัด
    (l.modifiers === undefined || Array.isArray(l.modifiers)) &&
    (l.modifierOptionIds === undefined || Array.isArray(l.modifierOptionIds))
  );
}

export function saveCart(shopCode: string, tableNo: string, lines: CartLine[]): void {
  try {
    localStorage.setItem(keyFor(shopCode, tableNo), JSON.stringify(lines));
  } catch {
    // พื้นที่เต็มหรือถูกปิดใช้งาน — ยอมให้ตะกร้าไม่ถูกเก็บ
    // ดีกว่าทำให้ปุ่ม "เพิ่มลงตะกร้า" กดไม่ได้
  }
}

export function clearCart(shopCode: string, tableNo: string): void {
  try {
    localStorage.removeItem(keyFor(shopCode, tableNo));
  } catch {
    /* ไม่ต้องทำอะไร */
  }
}

/**
 * เพิ่มของลงตะกร้า
 *
 * รายการเดียวกันที่ "หมายเหตุและตัวเลือกที่เลือกตรงกันทุกอย่าง" จะรวมจำนวนเข้าด้วยกัน
 * แต่ถ้าต่างกัน (หมายเหตุ หรือ ตัวเลือกเช่นเผ็ดน้อย vs เผ็ดมาก) ต้องแยกบรรทัด
 * เพราะครัวต้องทำคนละแบบ
 */
export function addLine(lines: CartLine[], incoming: CartLine): CartLine[] {
  const idx = lines.findIndex(
    (l) =>
      l.menuItemId === incoming.menuItemId &&
      l.note === incoming.note &&
      modifiersKey(l.modifiers) === modifiersKey(incoming.modifiers),
  );
  if (idx === -1) return [...lines, incoming];

  return lines.map((l, i) => (i === idx ? { ...l, qty: l.qty + incoming.qty } : l));
}

/** ปรับจำนวน — ลดจนถึง 0 แล้วรายการหายไปจากตะกร้า */
export function setQty(lines: CartLine[], index: number, qty: number): CartLine[] {
  if (index < 0 || index >= lines.length) return lines;
  if (qty <= 0) return lines.filter((_, i) => i !== index);
  return lines.map((l, i) => (i === index ? { ...l, qty } : l));
}

export function cartTotal(lines: readonly CartLine[]): Satang {
  return lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
}

export function cartCount(lines: readonly CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.qty, 0);
}
