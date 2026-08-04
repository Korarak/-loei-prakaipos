import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addLine,
  cartCount,
  cartTotal,
  clearCart,
  loadCart,
  saveCart,
  setQty,
  type CartLine,
} from './cart.js';

function line(over: Partial<CartLine> = {}): CartLine {
  return {
    menuItemId: 'm1',
    name: 'ข้าวผัดกุ้ง',
    unitPrice: 12000,
    qty: 1,
    note: '',
    modifiers: [],
    modifierOptionIds: [],
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('addLine', () => {
  it('เพิ่มรายการใหม่ต่อท้าย', () => {
    const result = addLine([], line());
    expect(result).toHaveLength(1);
  });

  it('รายการเดียวกันหมายเหตุตรงกัน รวมจำนวนเข้าด้วยกัน', () => {
    const result = addLine([line({ qty: 2 })], line({ qty: 1 }));
    expect(result).toHaveLength(1);
    expect(result[0]?.qty).toBe(3);
  });

  it('รายการเดียวกันแต่หมายเหตุต่างกัน ต้องแยกบรรทัด — ครัวทำคนละแบบ', () => {
    const result = addLine([line({ note: 'เผ็ดน้อย' })], line({ note: 'เผ็ดมาก' }));
    expect(result).toHaveLength(2);
  });

  it('ไม่แก้อาร์เรย์เดิม', () => {
    const original = [line()];
    addLine(original, line({ menuItemId: 'm2' }));
    expect(original).toHaveLength(1);
  });

  it('ตัวเลือกต่างกันต้องแยกบรรทัดแม้หมายเหตุเหมือนกัน', () => {
    const result = addLine(
      [line({ modifiers: [{ groupName: 'ความเผ็ด', optionName: 'น้อย', priceDelta: 0 }] })],
      line({ modifiers: [{ groupName: 'ความเผ็ด', optionName: 'มาก', priceDelta: 0 }] }),
    );
    expect(result).toHaveLength(2);
  });

  it('ตัวเลือกชุดเดียวกัน (ไม่สนลำดับ) รวมจำนวนเข้าบรรทัดเดียว', () => {
    const result = addLine(
      [
        line({
          modifiers: [
            { groupName: 'ความเผ็ด', optionName: 'มาก', priceDelta: 0 },
            { groupName: 'เพิ่ม', optionName: 'ไข่ดาว', priceDelta: 1000 },
          ],
        }),
      ],
      line({
        modifiers: [
          { groupName: 'เพิ่ม', optionName: 'ไข่ดาว', priceDelta: 1000 },
          { groupName: 'ความเผ็ด', optionName: 'มาก', priceDelta: 0 },
        ],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.qty).toBe(2);
  });
});

describe('setQty', () => {
  it('เปลี่ยนจำนวนได้', () => {
    expect(setQty([line()], 0, 5)[0]?.qty).toBe(5);
  });

  it('ลดจนถึง 0 แล้วรายการหายไป', () => {
    expect(setQty([line()], 0, 0)).toHaveLength(0);
  });

  it('จำนวนติดลบก็ถือว่าลบรายการ', () => {
    expect(setQty([line()], 0, -3)).toHaveLength(0);
  });

  it('index นอกช่วงไม่ทำอะไร ไม่พัง', () => {
    const lines = [line()];
    expect(setQty(lines, 9, 5)).toEqual(lines);
    expect(setQty(lines, -1, 5)).toEqual(lines);
  });
});

describe('cartTotal และ cartCount', () => {
  it('รวมยอดหลายรายการ', () => {
    const lines = [line({ unitPrice: 12000, qty: 2 }), line({ menuItemId: 'm2', unitPrice: 3000, qty: 3 })];
    expect(cartTotal(lines)).toBe(33000);
    expect(cartCount(lines)).toBe(5);
  });

  it('ตะกร้าว่างได้ 0', () => {
    expect(cartTotal([])).toBe(0);
    expect(cartCount([])).toBe(0);
  });
});

describe('การเก็บลง localStorage', () => {
  it('บันทึกแล้วอ่านกลับได้ครบ', () => {
    saveCart('krua-nong', '5', [line({ qty: 2, note: 'ไม่ใส่ผักชี' })]);
    const loaded = loadCart('krua-nong', '5');

    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.qty).toBe(2);
    expect(loaded[0]?.note).toBe('ไม่ใส่ผักชี');
  });

  it('แยกตะกร้าตามโต๊ะ — ของโต๊ะก่อนต้องไม่ปนมา', () => {
    saveCart('krua-nong', '5', [line()]);
    expect(loadCart('krua-nong', '6')).toEqual([]);
  });

  it('แยกตะกร้าตามร้านด้วย', () => {
    saveCart('krua-nong', '5', [line()]);
    expect(loadCart('cafe-chiangkhan', '5')).toEqual([]);
  });

  it('ยังไม่เคยบันทึก คืนตะกร้าว่าง', () => {
    expect(loadCart('krua-nong', '1')).toEqual([]);
  });

  it('clearCart ล้างเฉพาะโต๊ะนั้น', () => {
    saveCart('krua-nong', '5', [line()]);
    saveCart('krua-nong', '6', [line()]);
    clearCart('krua-nong', '5');

    expect(loadCart('krua-nong', '5')).toEqual([]);
    expect(loadCart('krua-nong', '6')).toHaveLength(1);
  });
});

describe('ข้อมูลใน localStorage เสียหาย', () => {
  it('JSON พังแล้วเริ่มตะกร้าใหม่ ไม่ทำหน้าขาว', () => {
    localStorage.setItem('prakaipos.cart.krua-nong.5', '{ไม่ใช่ JSON');
    expect(loadCart('krua-nong', '5')).toEqual([]);
  });

  it('ข้อมูลเป็น JSON แต่ไม่ใช่อาร์เรย์ ก็เริ่มใหม่', () => {
    localStorage.setItem('prakaipos.cart.krua-nong.5', '{"qty":1}');
    expect(loadCart('krua-nong', '5')).toEqual([]);
  });

  it('กรองทิ้งเฉพาะรายการที่รูปแบบไม่ตรง เก็บรายการที่ใช้ได้ไว้', () => {
    localStorage.setItem(
      'prakaipos.cart.krua-nong.5',
      JSON.stringify([
        line(),
        { menuItemId: 'm2' }, // ขาดฟิลด์
        { ...line(), qty: 0 }, // จำนวนไม่ถูกต้อง
        { ...line(), unitPrice: 12.5 }, // ราคาต้องเป็นจำนวนเต็มสตางค์
        line({ menuItemId: 'm3' }),
      ]),
    );

    const loaded = loadCart('krua-nong', '5');
    expect(loaded.map((l) => l.menuItemId)).toEqual(['m1', 'm3']);
  });

  it('localStorage ถูกปิด (โหมดส่วนตัวของ Safari) ก็ยังใช้งานต่อได้', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(loadCart('krua-nong', '5')).toEqual([]);
    expect(() => saveCart('krua-nong', '5', [line()])).not.toThrow();
  });
});
