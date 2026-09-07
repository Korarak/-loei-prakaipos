import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getSetting } from '../db/db.js';
import { pb } from './pb.js';
import { pullMenu, readLocalMenu, resetMenuCursor } from './pullMenu.js';

const SHOP = 'shop-a';
const NOW = new Date('2026-07-31T10:00:00.000Z');

function cat(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    shop: SHOP,
    name: `หมวด ${id}`,
    sort_order: 0,
    active: true,
    updated: '2026-07-31 09:00:00.000Z',
    ...over,
  };
}

function item(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    shop: SHOP,
    category: 'c1',
    name: `เมนู ${id}`,
    price: 6000,
    image: '',
    sold_out: false,
    sort_order: 0,
    active: true,
    updated: '2026-07-31 09:00:00.000Z',
    collectionId: 'menu_items',
    ...over,
  };
}

/** จำลอง pb.collection(...).getFullList() และจดว่าถูกเรียกด้วย filter อะไร */
function mockLists(categories: unknown[], items: unknown[]) {
  const filters: Record<string, string> = {};
  vi.spyOn(pb, 'collection').mockImplementation(
    (name: string) =>
      ({
        getFullList: async (opts: { filter: string }) => {
          filters[name] = opts.filter;
          return name === 'categories' ? categories : items;
        },
      }) as never,
  );
  return filters;
}

beforeEach(async () => {
  await db.categories.clear();
  await db.menuItems.clear();
  await db.settings.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pullMenu — ดึงครั้งแรก', () => {
  it('เก็บหมวดและเมนูลงเครื่อง', async () => {
    mockLists([cat('c1'), cat('c2')], [item('m1'), item('m2'), item('m3')]);

    const result = await pullMenu(SHOP, { now: NOW });

    expect(result.categories).toBe(2);
    expect(result.items).toBe(3);
    expect(await db.categories.count()).toBe(2);
    expect(await db.menuItems.count()).toBe(3);
  });

  it('ครั้งแรกต้องกวาดทั้งหมด ไม่ใส่เงื่อนไขเวลา', async () => {
    const filters = mockLists([cat('c1')], [item('m1')]);

    const result = await pullMenu(SHOP, { now: NOW });

    expect(result.fullSweep).toBe(true);
    expect(filters.categories).toBe(`shop="${SHOP}"`);
    expect(filters.categories).not.toContain('updated');
  });

  it('แปลงฟิลด์ให้ตรงกับรูปแบบที่แอปใช้', async () => {
    mockLists(
      [cat('c1', { name: 'ข้าว', sort_order: 2 })],
      [item('m1', { name: 'ข้าวผัดกุ้ง', price: 12000, sold_out: true, category: 'c1' })],
    );

    await pullMenu(SHOP, { now: NOW });

    const stored = await db.menuItems.get('m1');
    expect(stored?.name).toBe('ข้าวผัดกุ้ง');
    expect(stored?.price).toBe(12000);
    expect(stored?.soldOut).toBe(true);
    expect(stored?.categoryId).toBe('c1');
    expect(stored?.shopId).toBe(SHOP);

    expect((await db.categories.get('c1'))?.sortOrder).toBe(2);
  });
});

describe('pullMenu — ดึงเฉพาะที่เปลี่ยน', () => {
  it('รอบถัดไปใส่เงื่อนไข updated จาก cursor', async () => {
    mockLists([cat('c1', { updated: '2026-07-31 09:30:00.000Z' })], [item('m1')]);
    await pullMenu(SHOP, { now: NOW });

    const filters = mockLists([], []);
    // ยังไม่ถึงรอบกวาดทั้งหมด (ผ่านไปแค่ 1 ชั่วโมง)
    await pullMenu(SHOP, { now: new Date('2026-07-31T11:00:00.000Z') });

    expect(filters.categories).toContain('updated > "2026-07-31 09:30:00.000Z"');
  });

  it('เลื่อน cursor ตามค่าที่เซิร์ฟเวอร์ให้ ไม่ใช่เวลาของเครื่อง', async () => {
    // ถ้าใช้เวลาเครื่องแล้วนาฬิกาแท็บเล็ตเดินเร็วกว่าเซิร์ฟเวอร์
    // รายการที่แก้ระหว่างนั้นจะถูกข้ามไปเงียบๆ
    mockLists(
      [cat('c1', { updated: '2026-07-31 09:10:00.000Z' })],
      [item('m1', { updated: '2026-07-31 09:45:00.000Z' })],
    );

    await pullMenu(SHOP, { now: NOW });

    expect(await getSetting('sync.menu.cursor', '')).toBe('2026-07-31 09:45:00.000Z');
  });

  it('ไม่มีอะไรเปลี่ยนก็ไม่เลื่อน cursor', async () => {
    mockLists([cat('c1', { updated: '2026-07-31 09:30:00.000Z' })], []);
    await pullMenu(SHOP, { now: NOW });

    mockLists([], []);
    await pullMenu(SHOP, { now: new Date('2026-07-31T11:00:00.000Z') });

    expect(await getSetting('sync.menu.cursor', '')).toBe('2026-07-31 09:30:00.000Z');
  });

  it('รายการที่แก้ทับของเดิม ไม่เกิดรายการซ้ำ', async () => {
    mockLists([cat('c1')], [item('m1', { name: 'ข้าวผัด', price: 6000 })]);
    await pullMenu(SHOP, { now: NOW });

    mockLists(
      [],
      [item('m1', { name: 'ข้าวผัดหมู', price: 6500, updated: '2026-07-31 09:50:00.000Z' })],
    );
    await pullMenu(SHOP, { now: new Date('2026-07-31T11:00:00.000Z') });

    expect(await db.menuItems.count()).toBe(1);
    expect((await db.menuItems.get('m1'))?.name).toBe('ข้าวผัดหมู');
    expect((await db.menuItems.get('m1'))?.price).toBe(6500);
  });
});

describe('pullMenu — รายการที่ถูกลบ', () => {
  it('ลบเมนูที่ไม่มีบนเซิร์ฟเวอร์แล้วออกจากเครื่อง', async () => {
    // จุดที่พลาดง่าย: REST API ไม่บอกว่ามีอะไรถูกลบ ถ้าดึงแต่ของที่แก้ใหม่
    // เมนูที่เจ้าของลบทิ้งจะค้างบนแท็บเล็ตตลอดไป แล้วพนักงานจะขายของที่ไม่มี
    mockLists([cat('c1')], [item('m1'), item('m2')]);
    await pullMenu(SHOP, { now: NOW });
    expect(await db.menuItems.count()).toBe(2);

    mockLists([cat('c1')], [item('m1')]);
    const result = await pullMenu(SHOP, { now: NOW, forceFullSweep: true });

    expect(result.removed).toBe(1);
    expect(await db.menuItems.get('m2')).toBeUndefined();
    expect(await db.menuItems.get('m1')).toBeDefined();
  });

  it('ไม่ลบตอนดึงเฉพาะที่เปลี่ยน — ชุดข้อมูลไม่ครบ จะเข้าใจผิดว่าถูกลบ', async () => {
    mockLists([cat('c1')], [item('m1'), item('m2')]);
    await pullMenu(SHOP, { now: NOW });

    mockLists([], []);
    const result = await pullMenu(SHOP, { now: new Date('2026-07-31T11:00:00.000Z') });

    expect(result.fullSweep).toBe(false);
    expect(result.removed).toBe(0);
    expect(await db.menuItems.count()).toBe(2);
  });

  it('กวาดทั้งหมดอัตโนมัติเมื่อผ่านไปนานพอ', async () => {
    mockLists([cat('c1')], [item('m1')]);
    await pullMenu(SHOP, { now: NOW });

    const filters = mockLists([cat('c1')], [item('m1')]);
    const muchLater = new Date(NOW.getTime() + 7 * 60 * 60_000);
    const result = await pullMenu(SHOP, { now: muchLater });

    expect(result.fullSweep).toBe(true);
    expect(filters.categories).not.toContain('updated');
  });

  it('ไม่แตะข้อมูลของร้านอื่นตอนกวาด', async () => {
    await db.menuItems.put({
      id: 'other-1',
      shopId: 'shop-b',
      categoryId: 'cx',
      name: 'ของร้านอื่น',
      price: 1000,
      imageUrl: '',
      soldOut: false,
      sortOrder: 0,
      active: true,
      modifierGroups: [],
      recipe: [],
      updatedAt: '2026-07-31 09:00:00.000Z',
    });

    mockLists([cat('c1')], [item('m1')]);
    await pullMenu(SHOP, { now: NOW, forceFullSweep: true });

    expect(await db.menuItems.get('other-1')).toBeDefined();
  });
});

describe('readLocalMenu', () => {
  it('อ่านจากเครื่องได้โดยไม่ต้องมีเน็ต และเรียงตาม sort_order', async () => {
    mockLists(
      [cat('c1', { sort_order: 1 }), cat('c2', { sort_order: 0 })],
      [item('m1', { sort_order: 2 }), item('m2', { sort_order: 0 })],
    );
    await pullMenu(SHOP, { now: NOW });

    vi.restoreAllMocks(); // ตัดการเชื่อมต่อเซิร์ฟเวอร์ออกไปเลย
    const menu = await readLocalMenu(SHOP);

    expect(menu.categories.map((c) => c.id)).toEqual(['c2', 'c1']);
    expect(menu.items.map((i) => i.id)).toEqual(['m2', 'm1']);
  });

  it('คืนเฉพาะของร้านที่ขอ', async () => {
    mockLists([cat('c1')], [item('m1')]);
    await pullMenu(SHOP, { now: NOW });

    expect((await readLocalMenu('shop-b')).items).toEqual([]);
  });

  it('เก็บ kind ของหมวด และถือว่าเป็นอาหารถ้าเซิร์ฟเวอร์ยังไม่มีค่า', async () => {
    mockLists(
      [cat('c1', { kind: 'drink' }), cat('c2', { kind: '' })],
      [item('m1')],
    );
    await pullMenu(SHOP, { now: NOW });

    vi.restoreAllMocks();
    const menu = await readLocalMenu(SHOP);

    expect(menu.categories.find((c) => c.id === 'c1')?.kind).toBe('drink');
    expect(menu.categories.find((c) => c.id === 'c2')?.kind).toBe('food');
  });
});

describe('resetMenuCursor', () => {
  it('ล้างแล้วรอบถัดไปดึงใหม่ทั้งหมด', async () => {
    mockLists([cat('c1', { updated: '2026-07-31 09:30:00.000Z' })], []);
    await pullMenu(SHOP, { now: NOW });

    await resetMenuCursor();

    const filters = mockLists([cat('c1')], []);
    const result = await pullMenu(SHOP, { now: NOW });

    expect(result.fullSweep).toBe(true);
    expect(filters.categories).not.toContain('updated');
  });
});
