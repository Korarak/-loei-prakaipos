import { describe, expect, it } from 'vitest';
import {
  bahtToSatang,
  calcChange,
  formatBaht,
  formatSatang,
  parseBahtInput,
  satangToBaht,
  sumLines,
} from './money.js';

describe('การแปลงหน่วยเงิน', () => {
  it('แปลงบาทเป็นสตางค์แบบปัดถูกต้อง', () => {
    expect(bahtToSatang(120.5)).toBe(12050);
    expect(bahtToSatang(0.1)).toBe(10);
    // 1.005 * 100 = 100.49999... ในเลขทศนิยม ถ้าไม่ล้างขยะก่อนจะปัดลงเป็น 100
    expect(bahtToSatang(1.005)).toBe(101);
    // 8.115 * 100 = 811.4999... เคสเดียวกัน
    expect(bahtToSatang(8.115)).toBe(812);
  });

  it('ปฏิเสธค่าที่ไม่ใช่ตัวเลข', () => {
    expect(() => bahtToSatang(Number.NaN)).toThrow();
    expect(() => bahtToSatang(Number.POSITIVE_INFINITY)).toThrow();
  });

  it('แปลงสตางค์กลับเป็นบาท', () => {
    expect(satangToBaht(12050)).toBe(120.5);
  });
});

describe('parseBahtInput', () => {
  it('อ่านค่าที่ผู้ใช้พิมพ์ได้ตรงทุกครั้ง ไม่ผ่านเลขทศนิยม', () => {
    expect(parseBahtInput('120.50')).toBe(12050);
    expect(parseBahtInput('120.5')).toBe(12050);
    expect(parseBahtInput('120')).toBe(12000);
    expect(parseBahtInput('0.05')).toBe(5);
    expect(parseBahtInput('1.005'.slice(0, 4))).toBe(100); // "1.00"
  });

  it('ยอมรับช่องว่างและตัวคั่นหลักพัน', () => {
    expect(parseBahtInput('  1,250.75  ')).toBe(125075);
  });

  it('รองรับค่าติดลบสำหรับส่วนลด', () => {
    expect(parseBahtInput('-50.25')).toBe(-5025);
  });

  it('ยอมให้พิมพ์ค้างระหว่างทางได้ เช่น "120."', () => {
    expect(parseBahtInput('120.')).toBe(12000);
    expect(parseBahtInput('.5')).toBe(50);
  });

  it('คืน null เมื่อรูปแบบผิด แทนการเดาค่า', () => {
    expect(parseBahtInput('')).toBeNull();
    expect(parseBahtInput('   ')).toBeNull();
    expect(parseBahtInput('abc')).toBeNull();
    expect(parseBahtInput('12.345')).toBeNull(); // ทศนิยมเกิน 2 ตำแหน่ง
    expect(parseBahtInput('1.2.3')).toBeNull();
  });
});

describe('formatSatang', () => {
  it('แสดงทศนิยม 2 ตำแหน่งเสมอ', () => {
    expect(formatSatang(12050)).toBe('120.50');
    expect(formatSatang(10000)).toBe('100.00');
    expect(formatSatang(5)).toBe('0.05');
    expect(formatSatang(0)).toBe('0.00');
  });

  it('ใส่ตัวคั่นหลักพัน', () => {
    expect(formatSatang(1234567)).toBe('12,345.67');
  });

  it('จัดการค่าติดลบ (เช่น ส่วนลดหรือการคืนเงิน)', () => {
    expect(formatSatang(-12050)).toBe('-120.50');
    expect(formatSatang(-5)).toBe('-0.05');
  });

  it('formatBaht เติมสัญลักษณ์บาท', () => {
    expect(formatBaht(12050)).toBe('฿120.50');
  });
});

describe('sumLines', () => {
  it('รวมยอดหลายรายการที่มีจำนวนมากกว่า 1', () => {
    expect(
      sumLines([
        { unitPrice: 12000, qty: 2 },
        { unitPrice: 4500, qty: 1 },
      ]),
    ).toBe(28500);
  });

  it('บิลว่างได้ 0', () => {
    expect(sumLines([])).toBe(0);
  });

  it('รวมยอดเป็นจำนวนเต็มเสมอ ไม่มีเศษทศนิยมสะสม', () => {
    // 0.10 บาท 30 รายการ — ถ้าเก็บเป็นบาทจะได้ 3.0000000000000004
    const lines = Array.from({ length: 30 }, () => ({ unitPrice: 10, qty: 1 }));
    expect(sumLines(lines)).toBe(300);
  });
});

describe('calcChange', () => {
  it('คำนวณเงินทอนปกติ', () => {
    expect(calcChange(12050, 20000)).toBe(7950);
  });

  it('จ่ายพอดีไม่มีทอน', () => {
    expect(calcChange(12050, 12050)).toBe(0);
  });

  it('รับเงินมาไม่พอ ไม่คืนค่าติดลบ', () => {
    expect(calcChange(12050, 10000)).toBe(0);
  });
});
