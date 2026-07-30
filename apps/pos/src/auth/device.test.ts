import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db.js';
import {
  buildDevice,
  clearDevice,
  getDevice,
  saveDevice,
  takeNextOrderNo,
} from './device.js';

const NOW = new Date('2026-07-31T05:00:00.000Z');

const input = {
  shopId: 'shop-a',
  shopCode: 'krua-nong',
  shopName: 'ครัวน้อง',
  deviceIndex: 1,
  deviceName: 'แท็บเล็ตหน้าร้าน',
};

beforeEach(async () => {
  await db.settings.clear();
});

describe('buildDevice', () => {
  it('จองช่วงเลขบิลตามลำดับเครื่อง', () => {
    expect(buildDevice(input, NOW).orderNoRange).toEqual({
      start: 1001,
      end: 2000,
      next: 1001,
    });
  });

  it('เครื่องที่สองได้ช่วงที่ไม่ทับกับเครื่องแรก', () => {
    const a = buildDevice({ ...input, deviceIndex: 1 }, NOW);
    const b = buildDevice({ ...input, deviceIndex: 2 }, NOW);

    expect(a.orderNoRange.end).toBeLessThan(b.orderNoRange.start);
  });

  it('สร้าง deviceUuid ให้ไม่ซ้ำกัน', () => {
    expect(buildDevice(input, NOW).deviceUuid).not.toBe(
      buildDevice(input, NOW).deviceUuid,
    );
  });
});

describe('การบันทึกข้อมูลเครื่อง', () => {
  it('ยังไม่ตั้งค่า คืน null', async () => {
    expect(await getDevice()).toBeNull();
  });

  it('บันทึกแล้วอ่านกลับได้', async () => {
    await saveDevice(buildDevice(input, NOW));
    const device = await getDevice();

    expect(device?.shopCode).toBe('krua-nong');
    expect(device?.shopName).toBe('ครัวน้อง');
  });

  it('clearDevice ถอดเครื่องออกจากร้าน', async () => {
    await saveDevice(buildDevice(input, NOW));
    await clearDevice();

    expect(await getDevice()).toBeNull();
  });
});

describe('takeNextOrderNo', () => {
  beforeEach(async () => {
    await saveDevice(buildDevice(input, NOW));
  });

  it('ออกเลขเรียงต่อกัน', async () => {
    expect(await takeNextOrderNo()).toBe(1001);
    expect(await takeNextOrderNo()).toBe(1002);
    expect(await takeNextOrderNo()).toBe(1003);
  });

  it('บันทึกความคืบหน้าลงเครื่องทันที ไม่รอให้บิลเสร็จ', async () => {
    await takeNextOrderNo();

    // จำลองแอปดับแล้วเปิดใหม่: อ่านจากฐานข้อมูลใหม่
    // ต้องไม่ออกเลข 1001 ซ้ำ มิฉะนั้นเซิร์ฟเวอร์จะปฏิเสธและคิวส่งจะตัน
    expect((await getDevice())?.orderNoRange.next).toBe(1002);
    expect(await takeNextOrderNo()).toBe(1002);
  });

  it('เครื่องยังไม่ได้ตั้งค่า แจ้ง error ชัดเจน', async () => {
    await clearDevice();
    await expect(takeNextOrderNo()).rejects.toThrow('ยังไม่ได้ตั้งค่า');
  });

  it('ใช้เลขจนหมดช่วงแล้วแจ้งให้ต่อเน็ตขอช่วงใหม่', async () => {
    const device = buildDevice(input, NOW);
    await saveDevice({
      ...device,
      orderNoRange: { start: 1001, end: 2000, next: 2000 },
    });

    expect(await takeNextOrderNo()).toBe(2000);
    await expect(takeNextOrderNo()).rejects.toThrow('ถูกใช้หมดแล้ว');
  });
});
