/**
 * ประเภทของหมวดเมนู — อาหาร / เครื่องดื่ม
 *
 * แหล่งความจริงเดียวของแนวคิดนี้ทั้งระบบ ทั้ง POS หน้าลูกค้า และหลังบ้าน
 * เดิมค่าพวกนี้ (ป้ายภาษาไทย, ไอคอน, ลำดับ, ค่า fallback) กระจายเป็น literal
 * อยู่หลายไฟล์จนเริ่มไม่ตรงกัน — ย้ายมารวมที่นี่ที่เดียว
 *
 * ยึดที่ระดับ "หมวด" ไม่ใช่ "เมนูรายตัว" (ดูเหตุผลใน types.ts `Category`)
 */

export const MENU_KINDS = ['food', 'drink'] as const;

export type MenuKind = (typeof MENU_KINDS)[number];

/** ร้านเก่าก่อนมีฟิลด์นี้ และแถวที่ยังไม่ถูก backfill ถือเป็นอาหาร */
export const DEFAULT_MENU_KIND: MenuKind = 'food';

/** ป้ายกำกับที่แสดงให้ผู้ใช้เห็น */
export const MENU_KIND_LABEL: Record<MenuKind, string> = {
  food: 'อาหาร',
  drink: 'เครื่องดื่ม',
};

/** ลำดับการแสดงผล — อาหารขึ้นก่อนเครื่องดื่มเสมอ (คนสั่งข้าวก่อนแล้วค่อยเลือกน้ำ) */
export const MENU_KIND_ORDER: Record<MenuKind, number> = {
  food: 0,
  drink: 1,
};

/** แปลงค่าที่ไม่แน่นอน (จากเซิร์ฟเวอร์/IndexedDB/ฟอร์ม) ให้เป็น MenuKind ที่ใช้ได้เสมอ */
export function normalizeMenuKind(value: unknown): MenuKind {
  return (MENU_KINDS as readonly string[]).includes(value as string)
    ? (value as MenuKind)
    : DEFAULT_MENU_KIND;
}

/** ใช้กับ Array.prototype.sort — เรียงอาหารก่อนเครื่องดื่ม (เสถียร ลำดับเดิมภายในกลุ่มไม่เพี้ยน) */
export function compareMenuKind(a: MenuKind, b: MenuKind): number {
  return MENU_KIND_ORDER[a] - MENU_KIND_ORDER[b];
}
