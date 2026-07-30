/**
 * การสร้างรหัสอ้างอิงต่างๆ
 *
 * UUID ที่สร้างจากเครื่องคือหัวใจของการซิงก์ที่ไม่พัง — ส่งซ้ำกี่ครั้ง
 * เซิร์ฟเวอร์ก็ยึด UUID เดิมเป็นตัวตัดสิน จึงไม่เกิดบิลซ้ำ (ดูหัวข้อ 04)
 */

/**
 * สร้าง UUID v4
 *
 * ใช้ crypto.randomUUID() เป็นหลัก แต่มีทางสำรองเพราะเบราว์เซอร์เปิดให้ใช้
 * เฉพาะบน secure context (https หรือ localhost) เท่านั้น — ตอน dev
 * ที่เปิดหน้าเว็บจากไอพีในวงแลนเพื่อทดสอบบนแท็บเล็ตจริง จะไม่ใช่ secure context
 */
export function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  // ตั้งบิตให้เป็น version 4 และ variant 10x ตาม RFC 4122
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return (
    `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-` +
    `${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
  );
}

/**
 * ช่วงเลขบิลที่จองไว้ให้เครื่องหนึ่งเครื่อง
 *
 * เครื่องที่ 1 ได้ 1001–2000, เครื่องที่ 2 ได้ 2001–3000 ไล่ไปเรื่อยๆ
 * ทำแบบนี้เพื่อให้ร้านที่มี 2 เครื่องออฟไลน์พร้อมกันหลายวันแล้วเลขบิลไม่ชนกัน
 */
export interface OrderNoRange {
  /** เลขแรกที่ใช้ได้ (รวม) */
  start: number;
  /** เลขสุดท้ายที่ใช้ได้ (รวม) */
  end: number;
  /** เลขถัดไปที่จะออก */
  next: number;
}

export const ORDER_NO_BLOCK_SIZE = 1000;
const ORDER_NO_FIRST = 1001;

/** สร้างช่วงเลขบิลของเครื่องลำดับที่ n (เริ่มนับจาก 1) */
export function allocateOrderNoRange(deviceIndex: number): OrderNoRange {
  if (!Number.isInteger(deviceIndex) || deviceIndex < 1) {
    throw new Error(`ลำดับเครื่องต้องเป็นจำนวนเต็มตั้งแต่ 1 ได้รับ: ${deviceIndex}`);
  }
  const start = ORDER_NO_FIRST + (deviceIndex - 1) * ORDER_NO_BLOCK_SIZE;
  return { start, end: start + ORDER_NO_BLOCK_SIZE - 1, next: start };
}

/**
 * ดึงเลขบิลถัดไปจากช่วง คืนช่วงที่อัปเดตแล้วมาด้วย (ไม่แก้ของเดิม)
 *
 * เมื่อใช้เลขจนหมดช่วงจะโยน error ตั้งใจให้ดังไว้ก่อน — ที่ 1,000 บิล
 * ต่อเครื่องนี่คือหลายเดือนของร้านเล็ก ถ้าชนแปลว่ามีอะไรผิดปกติจริง
 * และการเงียบแล้ววนกลับไปใช้เลขซ้ำจะเสียหายกว่ามาก
 */
export function takeOrderNo(range: OrderNoRange): { orderNo: number; range: OrderNoRange } {
  if (range.next > range.end) {
    throw new Error(
      `เลขบิลในช่วง ${range.start}–${range.end} ถูกใช้หมดแล้ว ต้องจองช่วงใหม่จากเซิร์ฟเวอร์`,
    );
  }
  return { orderNo: range.next, range: { ...range, next: range.next + 1 } };
}

/** จำนวนเลขบิลที่ยังเหลือใช้ในช่วง — ใช้เตือนล่วงหน้าก่อนหมด */
export function remainingOrderNos(range: OrderNoRange): number {
  return Math.max(0, range.end - range.next + 1);
}
