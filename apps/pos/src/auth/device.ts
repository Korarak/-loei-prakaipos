import { allocateOrderNoRange, newUuid, type OrderNoRange } from '@prakaipos/shared';
import { getSetting, setSetting } from '../db/db.js';

/**
 * ข้อมูลประจำเครื่อง — ตั้งครั้งเดียวตอนติดตั้งที่ร้าน
 *
 * เครื่องหนึ่งเครื่องผูกกับร้านเดียว และถือช่วงเลขบิลของตัวเอง
 * ที่ไม่ทับกับเครื่องอื่นในร้านเดียวกัน จึงออฟไลน์พร้อมกันได้โดยเลขบิลไม่ชน
 */

const KEY_DEVICE = 'device';

export interface DeviceInfo {
  /** id ที่เครื่องสร้างเอง ใช้อ้างอิงเวลาดูว่าบิลมาจากเครื่องไหน */
  deviceUuid: string;
  shopId: string;
  shopCode: string;
  shopName: string;
  /** ลำดับเครื่องในร้าน — ตัวกำหนดช่วงเลขบิล */
  deviceIndex: number;
  deviceName: string;
  orderNoRange: OrderNoRange;
  registeredAt: string;
}

export async function getDevice(): Promise<DeviceInfo | null> {
  return getSetting<DeviceInfo | null>(KEY_DEVICE, null);
}

export async function saveDevice(info: DeviceInfo): Promise<void> {
  await setSetting(KEY_DEVICE, info);
}

/** ถอดเครื่องออกจากร้าน — ใช้ตอนย้ายเครื่องไปร้านอื่นหรือขายต่อ */
export async function clearDevice(): Promise<void> {
  await setSetting(KEY_DEVICE, null);
}

export interface RegisterDeviceInput {
  shopId: string;
  shopCode: string;
  shopName: string;
  deviceIndex: number;
  deviceName: string;
}

/**
 * สร้างข้อมูลเครื่องใหม่พร้อมช่วงเลขบิล
 *
 * ยังไม่บันทึกลงฐานข้อมูล — ผู้เรียกต้องยืนยันกับเซิร์ฟเวอร์ก่อนว่า
 * ลำดับเครื่องนี้ยังไม่มีใครใช้ แล้วจึงค่อยเรียก saveDevice()
 */
export function buildDevice(
  input: RegisterDeviceInput,
  now: Date = new Date(),
): DeviceInfo {
  return {
    deviceUuid: newUuid(),
    ...input,
    orderNoRange: allocateOrderNoRange(input.deviceIndex),
    registeredAt: now.toISOString(),
  };
}

/**
 * ดึงเลขบิลถัดไปแล้วบันทึกความคืบหน้าลงเครื่องทันที
 *
 * บันทึกก่อนใช้เสมอ — ถ้าแอปดับหลังออกเลขแต่ก่อนบันทึก
 * เลขเดิมจะถูกออกซ้ำแล้วเกิดบิลเลขซ้ำ ซึ่งเซิร์ฟเวอร์จะปฏิเสธ
 * และทำให้คิวส่งตัน ยอมเสียเลขไปหนึ่งเลขดีกว่ามาก
 */
export async function takeNextOrderNo(): Promise<number> {
  const device = await getDevice();
  if (!device) {
    throw new Error('เครื่องนี้ยังไม่ได้ตั้งค่ากับร้านใด');
  }

  const { next, end, start } = device.orderNoRange;
  if (next > end) {
    throw new Error(
      `เลขบิลในช่วง ${start}–${end} ถูกใช้หมดแล้ว ต้องต่ออินเทอร์เน็ตเพื่อขอช่วงใหม่`,
    );
  }

  await saveDevice({
    ...device,
    orderNoRange: { start, end, next: next + 1 },
  });

  return next;
}
