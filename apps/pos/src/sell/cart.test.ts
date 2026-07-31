import type { MenuItem } from '@prakaipos/shared';
import { describe, expect, it } from 'vitest';
import {
  addItem,
  emptyCart,
  isEmpty,
  itemCount,
  reconcileDiscount,
  removeLine,
  setDiscount,
  setNote,
  setQty,
  subtotal,
  total,
} from './cart.js';

function menu(id: string, name: string, price: number): MenuItem {
  return {
    id,
    shopId: 'shop-a',
    categoryId: 'c1',
    name,
    price,
    imageUrl: '',
    soldOut: false,
    sortOrder: 0,
    active: true,
    updatedAt: '2026-07-31 09:00:00.000Z',
  };
}

const kungFried = menu('m1', 'ข้าวผัดกุ้ง', 12000);
const iceTea = menu('m2', 'ชาเย็น', 3000);

describe('addItem', () => {
  it('เพิ่มรายการใหม่พร้อมเก็บชื่อและราคา ณ เวลาที่กด', () => {
    const cart = addItem(emptyCart, kungFried);

    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]?.nameSnapshot).toBe('ข้าวผัดกุ้ง');
    expect(cart.lines[0]?.unitPrice).toBe(12000);
    expect(cart.lines[0]?.qty).toBe(1);
  });

  it('เก็บราคาไว้ในบรรทัด ไม่อ้างไปที่เมนู — ราคาที่แก้ทีหลังต้องไม่ย้อนหลัง', () => {
    const cart = addItem(emptyCart, kungFried);
    const raised = { ...kungFried, price: 15000 };
    const cart2 = addItem(cart, raised);

    // ราคาใหม่ไม่ทำให้บรรทัดเดิมเปลี่ยน — แต่รวมจำนวนเพราะเป็นเมนูเดียวกัน
    expect(cart2.lines[0]?.unitPrice).toBe(12000);
  });

  it('กดเมนูเดิมซ้ำแล้วรวมจำนวน ไม่เพิ่มบรรทัด', () => {
    const cart = addItem(addItem(emptyCart, kungFried), kungFried);

    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]?.qty).toBe(2);
  });

  it('หมายเหตุต่างกันต้องแยกบรรทัด — ครัวทำคนละแบบ', () => {
    let cart = addItem(emptyCart, kungFried, 1, 'เผ็ดน้อย');
    cart = addItem(cart, kungFried, 1, 'เผ็ดมาก');

    expect(cart.lines).toHaveLength(2);
  });

  it('ทุกบรรทัดมี UUID ของตัวเองที่ไม่ซ้ำกัน', () => {
    let cart = addItem(emptyCart, kungFried);
    cart = addItem(cart, iceTea);

    const ids = cart.lines.map((l) => l.clientUuid);
    expect(new Set(ids).size).toBe(2);
  });

  it('เพิ่มทีละหลายชิ้นได้', () => {
    expect(addItem(emptyCart, kungFried, 3).lines[0]?.qty).toBe(3);
  });

  it('จำนวนไม่เป็นบวกก็ไม่ทำอะไร', () => {
    expect(addItem(emptyCart, kungFried, 0)).toBe(emptyCart);
    expect(addItem(emptyCart, kungFried, -2)).toBe(emptyCart);
  });

  it('ไม่แก้ตะกร้าเดิม', () => {
    const before = addItem(emptyCart, kungFried);
    addItem(before, iceTea);

    expect(before.lines).toHaveLength(1);
  });
});

describe('setQty และการลบ', () => {
  it('เปลี่ยนจำนวนได้', () => {
    const cart = addItem(emptyCart, kungFried);
    const uuid = cart.lines[0]?.clientUuid ?? '';

    expect(setQty(cart, uuid, 5).lines[0]?.qty).toBe(5);
  });

  it('ลดถึง 0 แล้วรายการหายไป', () => {
    const cart = addItem(emptyCart, kungFried);
    const uuid = cart.lines[0]?.clientUuid ?? '';

    expect(setQty(cart, uuid, 0).lines).toHaveLength(0);
  });

  it('uuid ที่ไม่มีอยู่ไม่ทำให้พัง', () => {
    const cart = addItem(emptyCart, kungFried);

    expect(setQty(cart, 'ไม่มี', 5).lines).toHaveLength(1);
    expect(removeLine(cart, 'ไม่มี').lines).toHaveLength(1);
  });

  it('ลบเฉพาะบรรทัดที่ระบุ', () => {
    let cart = addItem(emptyCart, kungFried);
    cart = addItem(cart, iceTea);
    const first = cart.lines[0]?.clientUuid ?? '';

    const after = removeLine(cart, first);
    expect(after.lines).toHaveLength(1);
    expect(after.lines[0]?.nameSnapshot).toBe('ชาเย็น');
  });
});

describe('setNote', () => {
  it('ใส่หมายเหตุให้บรรทัดที่ระบุ', () => {
    const cart = addItem(emptyCart, kungFried);
    const uuid = cart.lines[0]?.clientUuid ?? '';

    expect(setNote(cart, uuid, 'ไม่ใส่ผักชี').lines[0]?.note).toBe('ไม่ใส่ผักชี');
  });
});

describe('การคิดยอด', () => {
  it('ยอดรวมคูณจำนวนถูกต้อง', () => {
    let cart = addItem(emptyCart, kungFried, 2); // 240.00
    cart = addItem(cart, iceTea, 3); // 90.00

    expect(subtotal(cart)).toBe(33000);
    expect(total(cart)).toBe(33000);
  });

  it('ตะกร้าว่างได้ 0', () => {
    expect(subtotal(emptyCart)).toBe(0);
    expect(total(emptyCart)).toBe(0);
    expect(isEmpty(emptyCart)).toBe(true);
  });

  it('itemCount นับจำนวนชิ้นรวม ไม่ใช่จำนวนบรรทัด', () => {
    let cart = addItem(emptyCart, kungFried, 2);
    cart = addItem(cart, iceTea, 3);

    expect(cart.lines).toHaveLength(2);
    expect(itemCount(cart)).toBe(5);
  });

  it('ยอดเป็นจำนวนเต็มเสมอ ไม่มีเศษทศนิยมสะสม', () => {
    // เมนูราคา 0.10 บาท 30 ชิ้น — ถ้าคิดเป็นบาทจะได้ 3.0000000000000004
    const cheap = menu('m9', 'ถุงพลาสติก', 10);
    const cart = addItem(emptyCart, cheap, 30);

    expect(subtotal(cart)).toBe(300);
    expect(Number.isInteger(subtotal(cart))).toBe(true);
  });
});

describe('ส่วนลด', () => {
  it('หักออกจากยอดรวม', () => {
    const cart = setDiscount(addItem(emptyCart, kungFried), 2000);

    expect(subtotal(cart)).toBe(12000);
    expect(total(cart)).toBe(10000);
  });

  it('ส่วนลดเกินยอดรวมถูกจำกัดไว้ที่ยอดรวม — บิลติดลบไม่มีความหมาย', () => {
    const cart = setDiscount(addItem(emptyCart, iceTea), 999999);

    expect(cart.discount).toBe(3000);
    expect(total(cart)).toBe(0);
  });

  it('ส่วนลดติดลบถือเป็น 0', () => {
    expect(setDiscount(addItem(emptyCart, kungFried), -500).discount).toBe(0);
  });

  it('ส่วนลดเท่ากับยอดพอดี = แจกฟรี ยอดสุทธิ 0', () => {
    const cart = setDiscount(addItem(emptyCart, iceTea), 3000);
    expect(total(cart)).toBe(0);
  });
});

describe('reconcileDiscount', () => {
  it('ลดส่วนลดลงเมื่อเอาของออกจนยอดต่ำกว่าส่วนลด', () => {
    // เคสจริง: ตั้งส่วนลด 50 บาทบนบิล 240 บาท แล้วลูกค้าขอเอาของออก
    let cart = addItem(emptyCart, kungFried, 2);
    cart = setDiscount(cart, 5000);
    cart = setQty(cart, cart.lines[0]?.clientUuid ?? '', 0);

    expect(cart.discount).toBe(5000);
    expect(subtotal(cart)).toBe(0);

    const fixed = reconcileDiscount(cart);
    expect(fixed.discount).toBe(0);
    expect(total(fixed)).toBe(0);
  });

  it('ไม่แตะส่วนลดที่ยังไม่เกินยอด', () => {
    const cart = setDiscount(addItem(emptyCart, kungFried), 2000);
    expect(reconcileDiscount(cart)).toBe(cart);
  });
});
