/**
 * คำสั่ง ESC/POS ระดับล่าง — แปลงข้อความ/รูปแบบเป็นไบต์ที่เครื่องพิมพ์ใบเสร็จเข้าใจ
 *
 * อ้างอิงชุดคำสั่งมาตรฐาน ESC/POS ที่เครื่องพิมพ์ 58/80mm ราคาถูกส่วนใหญ่รองรับ
 * (Xprinter, Gprinter, no-brand จากจีน) ไม่ได้ผูกกับยี่ห้อใดยี่ห้อหนึ่ง
 *
 * เรื่องภาษาไทย: ส่งเป็น UTF-8 ตรงๆ เพราะเครื่องพิมพ์ Bluetooth รุ่นใหม่ที่ขาย
 * ในไทยส่วนใหญ่รองรับ UTF-8 อยู่แล้ว (ต่างจากรุ่นเก่าที่ต้องสลับ codepage เป็น TIS-620)
 * ถ้าเจอเครื่องที่พิมพ์ไทยเพี้ยน ต้องมาเพิ่ม "เลือก codepage" ตรงนี้ทีหลัง
 * หลังทดสอบกับเครื่องจริงตามหัวข้อ 05 ของเอกสารออกแบบ — ยังไม่เดาล่วงหน้า
 */

const ESC = 0x1b;
const GS = 0x1d;

export const CMD = {
  init: new Uint8Array([ESC, 0x40]),
  alignLeft: new Uint8Array([ESC, 0x61, 0]),
  alignCenter: new Uint8Array([ESC, 0x61, 1]),
  alignRight: new Uint8Array([ESC, 0x61, 2]),
  boldOn: new Uint8Array([ESC, 0x45, 1]),
  boldOff: new Uint8Array([ESC, 0x45, 0]),
  sizeNormal: new Uint8Array([GS, 0x21, 0x00]),
  /** ตัวโตขึ้นสองเท่าทั้งกว้างและสูง — ใช้กับชื่อร้าน/หัวเรื่อง */
  sizeDouble: new Uint8Array([GS, 0x21, 0x11]),
  /** ตัดกระดาษแบบเต็ม — รองรับกว้างขวางกว่าตัดครึ่ง */
  cutFull: new Uint8Array([GS, 0x56, 0x00]),
} as const;

const LF = new Uint8Array([0x0a]);

export function textBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** หนึ่งบรรทัดข้อความ ปิดท้ายด้วยขึ้นบรรทัดใหม่เสมอ */
export function line(s = ''): Uint8Array {
  return concatBytes([textBytes(s), LF]);
}

/** เส้นคั่นเต็มความกว้างกระดาษ */
export function divider(charsPerLine: number): Uint8Array {
  return line('-'.repeat(charsPerLine));
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/**
 * ตัดข้อความเป็นบรรทัดยาวไม่เกิน `charsPerLine` ตัวอักษร (นับตัวอักษร ไม่ใช่ไบต์)
 *
 * ตัดคำแบบง่ายที่สุด — แบ่งตามช่องว่างถ้าเป็นไปได้ ไม่งั้นตัดกลางคำ
 * เพียงพอสำหรับใบเสร็จที่ต้องอ่านออก ไม่ต้องสวยระดับพิมพ์หนังสือ
 */
export function wrapText(s: string, charsPerLine: number): string[] {
  if (s.length <= charsPerLine) return [s];
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length > charsPerLine) {
      if (cur) lines.push(cur);
      cur = w.length > charsPerLine ? w.slice(0, charsPerLine) : w;
    } else {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** จัดสองข้อความให้ชิดซ้าย-ขวาในบรรทัดเดียว เช่น "ยอดรวม" ... "120.00" */
export function twoColumn(left: string, right: string, charsPerLine: number): string {
  const space = charsPerLine - left.length - right.length;
  if (space <= 0) return `${left} ${right}`;
  return `${left}${' '.repeat(space)}${right}`;
}
