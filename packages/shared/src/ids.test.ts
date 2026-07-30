import { describe, expect, it } from 'vitest';
import {
  ORDER_NO_BLOCK_SIZE,
  allocateOrderNoRange,
  newUuid,
  remainingOrderNos,
  takeOrderNo,
} from './ids.js';

describe('newUuid', () => {
  it('คืนรูปแบบ UUID v4 ที่ถูกต้อง', () => {
    expect(newUuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('ไม่ซ้ำกันในการเรียกติดกันจำนวนมาก', () => {
    const set = new Set(Array.from({ length: 5000 }, newUuid));
    expect(set.size).toBe(5000);
  });
});

describe('การจองช่วงเลขบิล', () => {
  it('เครื่องที่ 1 ได้ 1001–2000 เครื่องที่ 2 ได้ 2001–3000', () => {
    expect(allocateOrderNoRange(1)).toEqual({ start: 1001, end: 2000, next: 1001 });
    expect(allocateOrderNoRange(2)).toEqual({ start: 2001, end: 3000, next: 2001 });
  });

  it('ช่วงของสองเครื่องไม่ทับกัน', () => {
    const a = allocateOrderNoRange(1);
    const b = allocateOrderNoRange(2);
    expect(a.end).toBeLessThan(b.start);
  });

  it('ปฏิเสธลำดับเครื่องที่ไม่ถูกต้อง', () => {
    expect(() => allocateOrderNoRange(0)).toThrow();
    expect(() => allocateOrderNoRange(-1)).toThrow();
    expect(() => allocateOrderNoRange(1.5)).toThrow();
  });
});

describe('takeOrderNo', () => {
  it('ออกเลขเรียงต่อกันโดยไม่แก้ช่วงเดิม', () => {
    const r0 = allocateOrderNoRange(1);
    const first = takeOrderNo(r0);
    const second = takeOrderNo(first.range);

    expect(first.orderNo).toBe(1001);
    expect(second.orderNo).toBe(1002);
    expect(r0.next).toBe(1001); // ของเดิมไม่ถูกแก้
  });

  it('ใช้ได้ครบทั้งช่วงพอดี แล้วจึงโยน error', () => {
    let range = allocateOrderNoRange(1);
    let last = 0;
    for (let i = 0; i < ORDER_NO_BLOCK_SIZE; i++) {
      const taken = takeOrderNo(range);
      last = taken.orderNo;
      range = taken.range;
    }

    expect(last).toBe(2000);
    expect(remainingOrderNos(range)).toBe(0);
    // ดังไว้ก่อน ดีกว่าเงียบแล้ววนไปใช้เลขซ้ำ
    expect(() => takeOrderNo(range)).toThrow();
  });

  it('remainingOrderNos ลดลงทีละหนึ่ง', () => {
    const r0 = allocateOrderNoRange(3);
    expect(remainingOrderNos(r0)).toBe(1000);
    expect(remainingOrderNos(takeOrderNo(r0).range)).toBe(999);
  });
});
