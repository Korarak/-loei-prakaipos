import type { QrOrderMode } from '@prakaipos/shared';
import { getSetting, setSetting } from '../db/db.js';
import { pb } from '../sync/pb.js';

/**
 * ค่าตั้งของร้านที่แคชไว้ในเครื่อง
 *
 * ต้องแคชเพราะหน้ารับเงินต้องสร้าง QR พร้อมเพย์ได้ตอนเน็ตหลุด
 * และเลขพร้อมเพย์ไม่ได้อยู่ในเส้นทางสาธารณะ (/api/public/shop/:code)
 * โดยตั้งใจ — เส้นทางนั้นมีไว้ให้หน้าลูกค้าที่ไม่ได้ล็อกอินใช้
 * จึงคืนเฉพาะฟิลด์ที่ลูกค้าต้องใช้จริง
 *
 * ที่นี่พนักงานล็อกอินแล้ว จึงอ่านเรกคอร์ดร้านเต็มได้ตามกฎสิทธิ์
 */

const KEY_SHOP = 'shop.settings';

export interface ShopSettings {
  id: string;
  code: string;
  name: string;
  /** ว่างได้ — ร้านที่ยังไม่ตั้ง จะรับได้แค่เงินสด */
  promptpayId: string;
  qrOrderMode: QrOrderMode;
  tablesEnabled: boolean;
  fetchedAt: string;
}

interface ShopRecord {
  id: string;
  code: string;
  name: string;
  promptpay_id: string;
  qr_order_mode: QrOrderMode;
  tables_enabled: boolean;
}

export async function getShopSettings(): Promise<ShopSettings | null> {
  return getSetting<ShopSettings | null>(KEY_SHOP, null);
}

/**
 * ดึงค่าตั้งร้านจากเซิร์ฟเวอร์มาเก็บไว้
 *
 * @returns ค่าที่แคชไว้เดิมถ้าดึงใหม่ไม่สำเร็จ — ไม่โยน error
 * เพราะการเปิดหน้าขายต้องไม่พังเพราะเน็ตไม่ดี
 */
export async function refreshShopSettings(
  shopId: string,
  now: Date = new Date(),
): Promise<ShopSettings | null> {
  const cached = await getShopSettings();

  if (!navigator.onLine) return cached;

  try {
    const record = await pb.collection('shops').getOne<ShopRecord>(shopId);
    const settings: ShopSettings = {
      id: record.id,
      code: record.code,
      name: record.name,
      promptpayId: record.promptpay_id ?? '',
      qrOrderMode: record.qr_order_mode,
      tablesEnabled: record.tables_enabled,
      fetchedAt: now.toISOString(),
    };
    await setSetting(KEY_SHOP, settings);
    return settings;
  } catch {
    return cached;
  }
}

export async function clearShopSettings(): Promise<void> {
  await setSetting(KEY_SHOP, null);
}
