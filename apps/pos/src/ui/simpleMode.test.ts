import { describe, expect, it } from 'vitest';
import {
  canOpen,
  canToggleSimple,
  homeDestinations,
  loadSimpleMode,
  navScreens,
  resolveScreen,
  saveSimpleMode,
  sellFeatures,
  type Screen,
} from './simpleMode.js';

const ALL_SCREENS: Screen[] = [
  'home', 'sell', 'menu', 'staff', 'dashboard', 'printer', 'tables', 'stock', 'orders', 'shop', 'tableqr',
];

function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('homeDestinations — การ์ดหน้าแรกทุกใบ', () => {
  it('โหมดเต็ม เจ้าของ: เห็นครบทุกเมนู (ไม่เปลี่ยนพฤติกรรมเดิม)', () => {
    expect(homeDestinations({ simple: false, role: 'owner', tablesEnabled: true })).toEqual([
      'sell', 'dashboard', 'orders', 'tables', 'menu', 'staff', 'stock', 'shop', 'printer',
    ]);
  });

  it('โหมดเต็ม พนักงาน: ไม่เห็นพนักงาน/สต๊อก/ตั้งค่าร้าน', () => {
    const d = homeDestinations({ simple: false, role: 'staff', tablesEnabled: true });
    expect(d).not.toContain('staff');
    expect(d).not.toContain('stock');
    expect(d).not.toContain('shop');
    expect(d).toEqual(['sell', 'dashboard', 'orders', 'tables', 'menu', 'printer']);
  });

  it('โหมดง่าย (เจ้าของ/พนักงานเห็นเหมือนกัน): เหลือแต่งานประจำวัน', () => {
    for (const role of ['owner', 'staff']) {
      expect(homeDestinations({ simple: true, role, tablesEnabled: true })).toEqual([
        'sell', 'dashboard', 'orders', 'tables', 'menu', 'printer',
      ]);
    }
  });

  it('ไม่เปิดผังโต๊ะ: ไม่มีการ์ดโต๊ะในทุกโหมด/ทุกบทบาท', () => {
    for (const simple of [true, false]) {
      for (const role of ['owner', 'staff']) {
        expect(homeDestinations({ simple, role, tablesEnabled: false })).not.toContain('tables');
      }
    }
  });

  it('หน้าขายอยู่เป็นใบแรกเสมอ', () => {
    for (const simple of [true, false]) {
      expect(homeDestinations({ simple, role: 'staff', tablesEnabled: false })[0]).toBe('sell');
    }
  });
});

describe('navScreens — แถบนำทางล่าง', () => {
  it('โหมดเต็ม: ขาย โต๊ะ แดชบอร์ด เมนู', () => {
    expect(navScreens({ simple: false, tablesEnabled: true })).toEqual(['sell', 'tables', 'dashboard', 'menu']);
    expect(navScreens({ simple: false, tablesEnabled: false })).toEqual(['sell', 'dashboard', 'menu']);
  });

  it('โหมดง่าย: ขาย โต๊ะ บิล แดชบอร์ด', () => {
    expect(navScreens({ simple: true, tablesEnabled: true })).toEqual(['sell', 'tables', 'orders', 'dashboard']);
    expect(navScreens({ simple: true, tablesEnabled: false })).toEqual(['sell', 'orders', 'dashboard']);
  });

  it('ทุกปุ่มในแถบล่างเปิดได้จริงในโหมดนั้น', () => {
    for (const simple of [true, false]) {
      for (const tablesEnabled of [true, false]) {
        for (const s of navScreens({ simple, tablesEnabled })) {
          expect(canOpen(s, { simple, role: 'staff', tablesEnabled })).toBe(true);
        }
      }
    }
  });
});

describe('canOpen / resolveScreen — ทุกหน้า × ทุกโหมด × ทุกบทบาท', () => {
  it('home เปิดได้เสมอ', () => {
    for (const simple of [true, false]) {
      expect(canOpen('home', { simple, role: 'staff', tablesEnabled: false })).toBe(true);
    }
  });

  it('โหมดง่าย: staff/stock/shop/tableqr ถูกซ่อน แม้เป็นเจ้าของ และเด้งกลับหน้าแรก', () => {
    for (const s of ['staff', 'stock', 'shop', 'tableqr'] as Screen[]) {
      const o = { simple: true, role: 'owner', tablesEnabled: true };
      expect(canOpen(s, o)).toBe(false);
      expect(resolveScreen(s, o)).toBe('home');
    }
  });

  it('โหมดเต็ม เจ้าของ: เปิดได้ทุกหน้า (tableqr ผ่านสิทธิ์เดียวกับ shop)', () => {
    for (const s of ALL_SCREENS) {
      expect(canOpen(s, { simple: false, role: 'owner', tablesEnabled: true })).toBe(true);
    }
  });

  it('โหมดเต็ม พนักงาน: เปิดหน้าของเจ้าของไม่ได้', () => {
    for (const s of ['staff', 'stock', 'shop', 'tableqr'] as Screen[]) {
      expect(canOpen(s, { simple: false, role: 'staff', tablesEnabled: true })).toBe(false);
    }
  });

  it('หน้าใช้งานประจำวัน เปิดได้ทั้งสองโหมด', () => {
    for (const simple of [true, false]) {
      for (const s of ['sell', 'dashboard', 'orders', 'menu', 'printer'] as Screen[]) {
        expect(canOpen(s, { simple, role: 'staff', tablesEnabled: false })).toBe(true);
      }
    }
  });

  it('ผังโต๊ะ: ปิดอยู่ในตั้งค่าร้านก็เปิดไม่ได้ทุกโหมด', () => {
    for (const simple of [true, false]) {
      expect(canOpen('tables', { simple, role: 'owner', tablesEnabled: false })).toBe(false);
    }
  });

  it('resolveScreen คืนหน้าเดิมเมื่อเปิดได้', () => {
    expect(resolveScreen('orders', { simple: true, role: 'staff', tablesEnabled: false })).toBe('orders');
  });
});

describe('canToggleSimple', () => {
  it('ใครก็เปิดโหมดง่ายได้', () => {
    expect(canToggleSimple('staff', false)).toBe(true);
    expect(canToggleSimple('owner', false)).toBe(true);
  });
  it('ปิดโหมดง่ายได้เฉพาะเจ้าของ', () => {
    expect(canToggleSimple('owner', true)).toBe(true);
    expect(canToggleSimple('staff', true)).toBe(false);
  });
});

describe('sellFeatures — หน้าขาย', () => {
  it('โหมดเต็มเปิดครบ', () => {
    expect(sellFeatures(false)).toEqual({ splitBill: true, discount: true, unitPrice: true });
  });
  it('โหมดง่ายซ่อนแยกบิล ส่วนลด ราคาต่อหน่วย', () => {
    expect(sellFeatures(true)).toEqual({ splitBill: false, discount: false, unitPrice: false });
  });
});

describe('เก็บค่าโหมดง่ายต่อเครื่อง', () => {
  it('ค่าเริ่มต้นคือปิด', () => {
    expect(loadSimpleMode(fakeStorage())).toBe(false);
  });
  it('เปิด → โหลดกลับได้ → ปิดแล้วหาย', () => {
    const st = fakeStorage();
    saveSimpleMode(true, st);
    expect(loadSimpleMode(st)).toBe(true);
    saveSimpleMode(false, st);
    expect(loadSimpleMode(st)).toBe(false);
  });
  it('storage ใช้ไม่ได้ (Safari โหมดส่วนตัว) ก็ไม่พัง', () => {
    const broken = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    };
    expect(loadSimpleMode(broken)).toBe(false);
    expect(() => saveSimpleMode(true, broken)).not.toThrow();
    expect(loadSimpleMode(undefined)).toBe(false);
  });
});
