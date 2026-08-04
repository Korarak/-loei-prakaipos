import { describe, expect, it } from 'vitest';
import { concatBytes, divider, line, twoColumn, wrapText } from './escpos.js';

describe('textBytes / line', () => {
  it('เข้ารหัส UTF-8 และปิดท้ายด้วยขึ้นบรรทัดใหม่', () => {
    const bytes = line('ทดสอบ');
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toBe('ทดสอบ\n');
  });

  it('บรรทัดว่างมีแค่ตัวขึ้นบรรทัดใหม่', () => {
    expect(Array.from(line())).toEqual([0x0a]);
  });
});

describe('divider', () => {
  it('สร้างเส้นคั่นตามความกว้างที่กำหนด', () => {
    const decoded = new TextDecoder().decode(divider(10));
    expect(decoded).toBe('----------\n');
  });
});

describe('concatBytes', () => {
  it('ต่อไบต์หลายก้อนเรียงตามลำดับ', () => {
    const result = concatBytes([new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5])]);
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
  });

  it('รับ array ว่างได้', () => {
    expect(concatBytes([])).toEqual(new Uint8Array(0));
  });
});

describe('wrapText', () => {
  it('ไม่ตัดถ้าสั้นกว่าความกว้างที่กำหนด', () => {
    expect(wrapText('ข้าวผัด', 32)).toEqual(['ข้าวผัด']);
  });

  it('ตัดตามช่องว่างเมื่อยาวเกิน', () => {
    const result = wrapText('aaaa bbbb cccc dddd', 10);
    for (const l of result) expect(l.length).toBeLessThanOrEqual(10);
    expect(result.join(' ')).toBe('aaaa bbbb cccc dddd');
  });

  it('ตัดกลางคำถ้าคำเดียวยาวเกินความกว้างทั้งบรรทัด', () => {
    const result = wrapText('a'.repeat(20), 8);
    expect(result[0]?.length).toBe(8);
  });
});

describe('twoColumn', () => {
  it('เว้นช่องว่างให้ข้อความขวาชิดขอบ', () => {
    expect(twoColumn('ยอดรวม', '120.00', 20)).toBe(`ยอดรวม${' '.repeat(8)}120.00`);
  });

  it('ถ้าสองข้อความรวมกันยาวเกิน คั่นด้วยช่องว่างเดียว', () => {
    expect(twoColumn('a'.repeat(15), 'b'.repeat(10), 20)).toBe(`${'a'.repeat(15)} ${'b'.repeat(10)}`);
  });
});
