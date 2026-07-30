import type { Category, MenuItem, Order, OutboxItem } from '@prakaipos/shared';
import Dexie, { type EntityTable } from 'dexie';

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

export class PosDatabase extends Dexie {
  /** เมนูที่ดึงลงมาแคชไว้ ใช้ตอนออฟไลน์ */
  menuItems!: EntityTable<MenuItem, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  /** บิลทั้งหมดของเครื่องนี้ อ้างด้วย clientUuid ไม่ใช่ id ของเซิร์ฟเวอร์ */
  orders!: EntityTable<Order, 'clientUuid'>;
  /** คิวงานที่ยังส่งขึ้นคลาวด์ไม่สำเร็จ */
  outbox!: EntityTable<OutboxItem, 'seq'>;
  settings!: EntityTable<KeyValue, 'key'>;

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
