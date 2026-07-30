/**
 * แฮช PIN สำหรับตรวจสอบในเครื่องตอนไม่มีเน็ต
 *
 * ## ทำไมต้องมี
 *
 * หน้าขายต้องใช้งานได้ตอนเน็ตหลุดสนิท ซึ่งแปลว่าตอนพนักงานกด PIN
 * เราถามเซิร์ฟเวอร์ไม่ได้ จึงต้องมีอะไรบางอย่างในเครื่องไว้เทียบ
 *
 * ## ขอบเขตของการป้องกัน — ต้องเข้าใจให้ตรงกัน
 *
 * PIN 4 หลักมีความเป็นไปได้แค่ 10,000 แบบ ใครที่ถือแท็บเล็ตอยู่ในมือ
 * และเปิด devtools เป็น ย่อมงัดออกได้ในที่สุด ไม่ว่าจะแฮชหนักแค่ไหน
 *
 * **PIN จึงไม่ใช่เครื่องกันขโมยแท็บเล็ต** แต่มีไว้เพื่อ:
 *
 * - บอกว่าบิลใบไหนใครเป็นคนขาย (ใช้ตอนยอดเงินไม่ตรงตอนปิดร้าน)
 * - กันพนักงานหยิบเครื่องคนอื่นมากดเล่นโดยไม่ตั้งใจ
 * - กันลูกค้าที่เดินผ่านหน้าเคาน์เตอร์แล้วแตะจอ
 *
 * สิ่งที่กันการงัดจริงคือการจำกัดจำนวนครั้งที่กดผิด (ดู attempts.ts)
 * ไม่ใช่ความหนักของการแฮช
 */

/**
 * จำนวนรอบของ PBKDF2
 *
 * ตามคำแนะนำของ OWASP สำหรับ PBKDF2-SHA256 การเพิ่มรอบไม่ได้ทำให้
 * PIN 4 หลักปลอดภัยขึ้นอย่างมีนัยสำคัญ แต่ทำให้การไล่เดาทั้ง 10,000 แบบ
 * ใช้เวลาเป็นนาทีแทนที่จะเป็นเสี้ยววินาที ซึ่งพอให้กลไกจำกัดจำนวนครั้ง
 * ทำงานทัน
 */
const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

export interface StoredPin {
  /** เกลือแบบสุ่มต่อคน เก็บเป็น base64 */
  salt: string;
  /** ผลลัพธ์ PBKDF2 เก็บเป็น base64 */
  hash: string;
  /** เก็บไว้ด้วยเพื่อให้ขึ้นจำนวนรอบในอนาคตได้โดยไม่ทำให้ของเดิมใช้ไม่ได้ */
  iterations: number;
}

function requireSubtle(): SubtleCrypto {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // เกิดตอนเปิดหน้าเว็บผ่าน http จากไอพีในวงแลน ซึ่งเบราว์เซอร์ไม่ถือว่าปลอดภัย
    // ตอนใช้งานจริงเป็น https จึงไม่เจอ แต่ตอน dev บนแท็บเล็ตจริงจะเจอ
    throw new Error(
      'เบราว์เซอร์นี้ใช้การเข้ารหัสไม่ได้ — ต้องเปิดผ่าน https หรือ localhost เท่านั้น',
    );
  }
  return crypto.subtle;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(
  pin: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const subtle = requireSubtle();
  const key = await subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** สร้างแฮชใหม่พร้อมเกลือสุ่ม — เรียกตอนพนักงานเข้าระบบสำเร็จครั้งแรกตอนมีเน็ต */
export async function hashPin(pin: string): Promise<StoredPin> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(pin, salt, ITERATIONS);
  return {
    salt: toBase64(salt),
    hash: toBase64(hash),
    iterations: ITERATIONS,
  };
}

/**
 * เทียบ PIN ที่กรอกกับที่เก็บไว้
 *
 * เทียบแบบใช้เวลาคงที่ ไม่หยุดทันทีที่เจอไบต์แรกที่ต่างกัน
 * เพราะการหยุดเร็วทำให้เดาทีละไบต์ได้จากการจับเวลา
 */
export async function verifyPin(pin: string, stored: StoredPin): Promise<boolean> {
  const expected = fromBase64(stored.hash);
  const actual = await derive(pin, fromBase64(stored.salt), stored.iterations);

  if (expected.length !== actual.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= (expected[i] ?? 0) ^ (actual[i] ?? 0);
  }
  return diff === 0;
}

/**
 * ตรวจรูปแบบ PIN ก่อนรับเข้าระบบ
 *
 * 4–8 หลัก ตัวเลขล้วน — ยาวกว่านี้พนักงานจะจำไม่ได้แล้วไปเขียนแปะไว้ที่จอ
 * ซึ่งแย่กว่า PIN สั้น
 */
export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

/** PIN ที่เดาง่ายเกินไป — เตือนตอนตั้ง ไม่ได้ห้าม */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1*$/.test(pin)) return true; // 1111, 0000

  // เรียงขึ้นหรือลงติดกัน เช่น 1234, 4321
  const digits = [...pin].map(Number);
  const ascending = digits.every((d, i) => i === 0 || d === (digits[i - 1] ?? 0) + 1);
  const descending = digits.every((d, i) => i === 0 || d === (digits[i - 1] ?? 0) - 1);
  return ascending || descending;
}
