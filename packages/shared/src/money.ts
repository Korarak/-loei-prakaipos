import type { Satang } from './types.js';

/**
 * เงินทั้งระบบเป็นจำนวนเต็มหน่วยสตางค์
 * เหตุผล: 0.1 + 0.2 !== 0.3 ในเลขทศนิยม ถ้าเก็บเป็นบาทแล้วรวมบิลยาวๆ
 * ยอดจะเพี้ยนทีละสตางค์ ซึ่งเจ้าของร้านจับได้ตอนปิดยอดสิ้นวัน
 */

/**
 * 120.5 → 12050
 *
 * `baht * 100` ตรงๆ ใช้ไม่ได้ เพราะ 1.005 * 100 ได้ 100.49999999999999
 * แล้ว Math.round จะปัดลงเป็น 100 ทั้งที่ควรได้ 101
 * toFixed(4) ตัดขยะทศนิยมที่เกิดจาก float ทิ้งก่อน แล้วค่อยปัด
 *
 * ถ้าค่ามาจากช่องกรอกของผู้ใช้ ให้ใช้ parseBahtInput() แทน — แม่นกว่า
 * เพราะทำงานกับสตริงตรงๆ ไม่ผ่านเลขทศนิยมเลย
 */
export function bahtToSatang(baht: number): Satang {
  if (!Number.isFinite(baht)) {
    throw new Error(`จำนวนเงินไม่ถูกต้อง: ${baht}`);
  }
  return Math.round(Number((baht * 100).toFixed(4)));
}

/**
 * แปลงข้อความจากช่องกรอกเป็นสตางค์ โดยไม่ผ่านเลขทศนิยมเลย
 *
 * เจ้าของร้านพิมพ์ "120.50" ระบบต้องได้ 12050 เป๊ะทุกครั้ง
 * ทศนิยมเกิน 2 ตำแหน่งถือว่าผิด — ราคาอาหารไม่มีเศษต่ำกว่าสตางค์
 *
 * @returns null ถ้ารูปแบบไม่ถูกต้อง (ให้หน้าจอแสดงข้อความเตือนเอง)
 */
export function parseBahtInput(text: string): Satang | null {
  const trimmed = text.trim().replace(/,/g, '');
  const match = /^(-?)(\d*)(?:\.(\d{0,2}))?$/.exec(trimmed);
  if (!match) return null;

  const [, sign, whole = '', frac = ''] = match;
  if (whole === '' && frac === '') return null;

  const satang = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0') || '0');
  return sign === '-' ? -satang : satang;
}

/** 12050 → 120.5 */
export function satangToBaht(satang: Satang): number {
  return satang / 100;
}

/** 12050 → "120.50" */
export function formatSatang(satang: Satang): string {
  const negative = satang < 0;
  const abs = Math.abs(satang);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = whole.toLocaleString('en-US');
  return `${negative ? '-' : ''}${grouped}.${String(cents).padStart(2, '0')}`;
}

/** 12050 → "฿120.50" สำหรับแสดงบนหน้าจอ */
export function formatBaht(satang: Satang): string {
  return `฿${formatSatang(satang)}`;
}

/** ยอดรวมก่อนส่วนลดของรายการในบิล */
export function sumLines(lines: readonly { unitPrice: Satang; qty: number }[]): Satang {
  return lines.reduce((acc, l) => acc + l.unitPrice * l.qty, 0);
}

/**
 * เงินทอน — ไม่คืนค่าติดลบ
 * ถ้ารับเงินมาน้อยกว่ายอดบิล ถือว่ายังจ่ายไม่ครบ เงินทอนเป็น 0
 */
export function calcChange(total: Satang, received: Satang): Satang {
  return Math.max(0, received - total);
}
