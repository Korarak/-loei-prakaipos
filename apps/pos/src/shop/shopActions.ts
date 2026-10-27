import { normalizePromptPayId, type QrOrderMode } from '@prakaipos/shared';
import { pb } from '../sync/pb.js';
import { refreshShopSettings, type ShopSettings } from './shopSettings.js';

/**
 * แก้ค่าตั้งร้าน — เฉพาะเจ้าของร้าน ต้องมีเน็ต
 *
 * ฝั่งเซิร์ฟเวอร์ shops.updateRule จำกัดไว้ที่ role=owner อยู่แล้ว และ
 * shop_plan_guard.pb.js กันไม่ให้แก้แผนสมาชิกผ่านทางนี้ หน้าจอจึงส่งไปเฉพาะ
 * ฟิลด์ที่ปลอดภัยเหล่านี้เท่านั้น
 */

export const MAX_TABLES = 200;

export interface ShopSettingsInput {
  promptpayId: string;
  tablesEnabled: boolean;
  tableCount: number;
  qrOrderMode: QrOrderMode;
}

/** ตรวจค่าที่กรอก คืนข้อความผิดพลาด หรือ null ถ้าผ่าน */
export function validateShopSettings(input: ShopSettingsInput): string | null {
  const id = input.promptpayId.trim();
  if (id) {
    try {
      normalizePromptPayId(id);
    } catch (err) {
      return err instanceof Error ? err.message : 'เลขพร้อมเพย์ไม่ถูกต้อง';
    }
  }
  if (!Number.isInteger(input.tableCount) || input.tableCount < 0 || input.tableCount > MAX_TABLES) {
    return `จำนวนโต๊ะต้องเป็นเลข 0-${MAX_TABLES}`;
  }
  if (input.tablesEnabled && input.tableCount === 0) {
    return 'เปิดใช้ผังโต๊ะแล้ว ต้องใส่จำนวนโต๊ะอย่างน้อย 1';
  }
  return null;
}

export async function saveShopSettings(
  shopId: string,
  input: ShopSettingsInput,
): Promise<ShopSettings | null> {
  if (!navigator.onLine) throw new Error('การบันทึกการตั้งค่าร้านต้องต่ออินเทอร์เน็ตก่อน');

  const invalid = validateShopSettings(input);
  if (invalid) throw new Error(invalid);

  await pb.collection('shops').update(shopId, {
    promptpay_id: input.promptpayId.trim(),
    tables_enabled: input.tablesEnabled,
    table_count: input.tableCount,
    qr_order_mode: input.qrOrderMode,
  });
  return refreshShopSettings(shopId);
}
