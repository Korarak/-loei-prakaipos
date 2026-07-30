import type { Category, MenuItem, Order, OutboxItem, StaffRole } from '@prakaipos/shared';
import Dexie, { type EntityTable } from 'dexie';
import type { StoredPin } from '../auth/pinHash.js';

/**
 * ฐานข้อมูลในเครื่องของแท็บเล็ตหน้าร้าน
 *
 * นี่คือ "แหล่งความจริง" ระหว่างที่เน็ตหลุด ทุกการกระทำเขียนลงที่นี่ก่อนเสมอ
 * แล้วค่อยส่งขึ้นคลาวด์ทีหลัง หน้าจอจึงตอบสนองเร็วตลอดไม่ว่าเน็ตจะเป็นอย่างไร
 * (เอกสารออกแบบหัวข้อ 04)
 */

/** ค่าตั้งต่างๆ ของเครื่องนี้ เก็บเป็น key-value เพื่อไม่ต้องเพิ่มตารางบ่อย */
export interface KeyValue {
  key: string;
  value: unknown;
}

/**
 * ข้อมูลพนักงานที่เก็บไว้ในเครื่องเพื่อให้เข้าระบบตอนออฟไลน์ได้
 *
 * บันทึกตอนพนักงานคนนั้นเข้าระบบสำเร็จ "ครั้งแรกตอนมีเน็ต" หลังจากนั้น
 * เขาเข้าระบบตอนเน็ตหลุดได้ตลอด — พนักงานใหม่ต้องเข้าครั้งแรกตอนมีเน็ต
 * ซึ่งอธิบายให้ร้านเข้าใจได้ง่าย
 */
export interface StaffCredential {
  staffId: string;
  shopId: string;
  username: string;
  displayName: string;
  role: StaffRole;
  /** แฮชของ PIN สำหรับเทียบในเครื่อง — ไม่ใช่รหัสผ่านที่ใช้คุยกับเซิร์ฟเวอร์ */
  pin: StoredPin;
  /** จำนวนครั้งที่กด PIN ผิดติดกัน รีเซ็ตเมื่อเข้าสำเร็จ */
  failedAttempts: number;
  /** ห้ามลองใหม่จนกว่าจะถึงเวลานี้ — ว่างแปลว่าลองได้เลย */
  lockedUntil: string | null;
  lastLoginAt: string;
}

export class PosDatabase extends Dexie {
  /** เมนูที่ดึงลงมาแคชไว้ ใช้ตอนออฟไลน์ */
  menuItems!: EntityTable<MenuItem, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  /** บิลทั้งหมดของเครื่องนี้ อ้างด้วย clientUuid ไม่ใช่ id ของเซิร์ฟเวอร์ */
  orders!: EntityTable<Order, 'clientUuid'>;
  /** คิวงานที่ยังส่งขึ้นคลาวด์ไม่สำเร็จ */
  outbox!: EntityTable<OutboxItem, 'seq'>;
  settings!: EntityTable<KeyValue, 'key'>;
  /** พนักงานที่เคยเข้าระบบบนเครื่องนี้ ใช้ตรวจ PIN ตอนออฟไลน์ */
  credentials!: EntityTable<StaffCredential, 'staffId'>;

  constructor(name = 'prakaipos') {
    super(name);

    this.version(1).stores({
      // ดัชนีที่ประกาศไว้คือคอลัมน์ที่ query ได้เร็ว ไม่ใช่ทั้งหมดของ object
      categories: 'id, shopId, sortOrder',
      menuItems: 'id, shopId, categoryId, sortOrder, updatedAt',
      // ดัชนี status+createdAt ใช้กับหน้ารายงานรายวันและรายการบิลที่ยังเปิดอยู่
      orders: 'clientUuid, id, shopId, orderNo, status, createdAt, [status+createdAt]',
      // seq เป็น auto-increment เพื่อรักษาลำดับการส่ง — ห้ามส่งข้ามลำดับ
      // เพราะบิลต้องถูกสร้างก่อนที่จะมีการอัปเดตบิลนั้น
      outbox: '++seq, clientUuid, nextAttemptAt',
      settings: 'key',
    });

    // เพิ่มตารางข้อมูลเข้าระบบ — ไม่แตะโครงเดิม ข้อมูลที่มีอยู่จึงไม่หาย
    this.version(2).stores({
      credentials: 'staffId, shopId, username',
    });
  }
}

export const db = new PosDatabase();

// ── ค่าตั้งของเครื่อง ────────────────────────────────────────

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

/**
 * ขอให้เบราว์เซอร์ "ปักหมุด" ข้อมูลไว้ ไม่ล้างทิ้งเมื่อพื้นที่ใกล้เต็ม
 *
 * สำคัญมากบน iOS — Safari ล้างข้อมูลเว็บที่ไม่ได้เปิดนานได้เอง
 * ซึ่งจะทำให้บิลที่ยังไม่ได้ซิงก์หายไปทั้งหมด (เอกสารออกแบบหัวข้อ 12)
 *
 * @returns true ถ้าเบราว์เซอร์รับปาก · false ถ้าปฏิเสธหรือไม่รองรับ
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
