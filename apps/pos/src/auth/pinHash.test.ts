import { describe, expect, it } from 'vitest';
import { hashPin, isValidPinFormat, isWeakPin, verifyPin } from './pinHash.js';

/**
 * PBKDF2 ที่ 210,000 รอบใช้เวลาราว 100–200 ms ต่อครั้ง
 * เทสต์ในไฟล์นี้จึงช้ากว่าไฟล์อื่นโดยธรรมชาติ — เป็นเรื่องปกติ ไม่ใช่บั๊ก
 */

describe('hashPin และ verifyPin', () => {
  it('PIN ที่ถูกต้องผ่านการตรวจ', async () => {
    const stored = await hashPin('1379');
    expect(await verifyPin('1379', stored)).toBe(true);
  });

  it('PIN ที่ผิดไม่ผ่าน', async () => {
    const stored = await hashPin('1379');
    expect(await verifyPin('1380', stored)).toBe(false);
    expect(await verifyPin('', stored)).toBe(false);
    expect(await verifyPin('13790', stored)).toBe(false);
  });

  it('เกลือสุ่มใหม่ทุกครั้ง — PIN เดียวกันได้แฮชคนละค่า', async () => {
    const a = await hashPin('1379');
    const b = await hashPin('1379');

    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    // แต่ทั้งคู่ต้องตรวจผ่านด้วย PIN เดิม
    expect(await verifyPin('1379', a)).toBe(true);
    expect(await verifyPin('1379', b)).toBe(true);
  });

  it('เก็บจำนวนรอบไว้ด้วย เพื่อให้ขึ้นจำนวนรอบในอนาคตได้', async () => {
    const stored = await hashPin('1379');
    expect(stored.iterations).toBeGreaterThanOrEqual(210_000);
  });

  it('ตรวจด้วยจำนวนรอบที่บันทึกไว้ ไม่ใช่ค่าปัจจุบัน', async () => {
    // จำลองแฮชเก่าที่สร้างตอนใช้จำนวนรอบน้อยกว่า — ต้องยังใช้ได้
    const stored = await hashPin('1379');
    const forged = { ...stored, iterations: stored.iterations + 1 };
    // เปลี่ยนจำนวนรอบแล้วผลต้องไม่ตรง ยืนยันว่าใช้ค่าจากเรกคอร์ดจริง
    expect(await verifyPin('1379', forged)).toBe(false);
  });

  it('รองรับ PIN ยาวกว่า 4 หลัก', async () => {
    const stored = await hashPin('84213756');
    expect(await verifyPin('84213756', stored)).toBe(true);
    expect(await verifyPin('84213755', stored)).toBe(false);
  });
});

describe('isValidPinFormat', () => {
  it('รับตัวเลข 4–8 หลัก', () => {
    expect(isValidPinFormat('1379')).toBe(true);
    expect(isValidPinFormat('84213756')).toBe(true);
  });

  it('ปฏิเสธที่สั้นหรือยาวเกินไป', () => {
    expect(isValidPinFormat('137')).toBe(false);
    expect(isValidPinFormat('842137561')).toBe(false);
    expect(isValidPinFormat('')).toBe(false);
  });

  it('ปฏิเสธที่ไม่ใช่ตัวเลขล้วน', () => {
    expect(isValidPinFormat('13a9')).toBe(false);
    expect(isValidPinFormat('13 9')).toBe(false);
    expect(isValidPinFormat('๑๓๗๙')).toBe(false);
  });
});

describe('isWeakPin', () => {
  it('จับเลขซ้ำทั้งหมด', () => {
    expect(isWeakPin('1111')).toBe(true);
    expect(isWeakPin('0000')).toBe(true);
  });

  it('จับเลขเรียงขึ้นและเรียงลง', () => {
    expect(isWeakPin('1234')).toBe(true);
    expect(isWeakPin('4321')).toBe(true);
    expect(isWeakPin('5678')).toBe(true);
  });

  it('ไม่เตือน PIN ที่กระจายดี', () => {
    expect(isWeakPin('1379')).toBe(false);
    expect(isWeakPin('8024')).toBe(false);
    expect(isWeakPin('2580')).toBe(false);
  });
});
