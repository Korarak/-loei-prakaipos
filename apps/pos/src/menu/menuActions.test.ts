import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db.js';
import { pb } from '../sync/pb.js';
import {
  NeedsInternetError,
  createCategory,
  createMenuItem,
  deleteCategory,
  setSoldOut,
} from './menuActions.js';

const SHOP = 'shop-a';

function setOnline(online: boolean) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: online },
    configurable: true,
  });
}

/** จำลอง pb.collection(...) และจดสิ่งที่ถูกส่งไป */
function mockPb() {
  const calls: { method: string; collection: string; payload?: unknown }[] = [];
  vi.spyOn(pb, 'collection').mockImplementation(
    (name: string) =>
      ({
        create: async (payload: unknown) => {
          calls.push({ method: 'create', collection: name, payload });
          return { id: 'new-id' };
        },
        update: async (_id: string, payload: unknown) => {
          calls.push({ method: 'update', collection: name, payload });
          return { id: _id };
        },
        delete: async () => {
          calls.push({ method: 'delete', collection: name });
          return true;
        },
        getFullList: async () => [],
      }) as never,
  );
  return calls;
}

async function seedItem(id: string, over: Record<string, unknown> = {}) {
  await db.menuItems.put({
    id,
    shopId: SHOP,
    categoryId: 'c1',
    name: 'ข้าวผัดกุ้ง',
    price: 12000,
    imageUrl: '',
    soldOut: false,
    sortOrder: 0,
    active: true,
    modifierGroups: [],
    recipe: [],
    updatedAt: '2026-07-31 09:00:00.000Z',
    ...over,
  });
}

beforeEach(async () => {
  await db.menuItems.clear();
  await db.categories.clear();
  await db.outbox.clear();
  await db.settings.clear();
  setOnline(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('การแก้เมนูต้องมีเน็ต', () => {
  it('เพิ่มหมวดตอนไม่มีเน็ตแล้วแจ้งให้ชัด', async () => {
    setOnline(false);
    await expect(createCategory(SHOP, 'ข้าว', 'food', 0)).rejects.toBeInstanceOf(
      NeedsInternetError,
    );
  });

  it('เพิ่มเมนูตอนไม่มีเน็ตแล้วแจ้งให้ชัด', async () => {
    setOnline(false);
    await expect(
      createMenuItem(SHOP, { categoryId: 'c1', name: 'ข้าวผัด', price: 6000, sortOrder: 0 }),
    ).rejects.toThrow('ต้องต่ออินเทอร์เน็ต');
  });

  it('ไม่ยิงเซิร์ฟเวอร์เลยเมื่อรู้ว่าไม่มีเน็ต', async () => {
    setOnline(false);
    const calls = mockPb();

    await expect(createCategory(SHOP, 'ข้าว', 'food', 0)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('createMenuItem', () => {
  it('ส่งราคาเป็นสตางค์ และตั้ง active/sold_out เริ่มต้น', async () => {
    const calls = mockPb();

    await createMenuItem(SHOP, {
      categoryId: 'c1',
      name: 'ข้าวผัดกุ้ง',
      price: 12000,
      sortOrder: 3,
    });

    const created = calls.find((c) => c.method === 'create');
    expect(created?.collection).toBe('menu_items');
    expect(created?.payload).toMatchObject({
      shop: SHOP,
      category: 'c1',
      name: 'ข้าวผัดกุ้ง',
      price: 12000,
      sort_order: 3,
      sold_out: false,
      active: true,
    });
  });

  it('ส่งเป็น FormData เมื่อมีรูปแนบมาด้วย', async () => {
    const calls = mockPb();
    const image = new File(['xxx'], 'menu.jpg', { type: 'image/jpeg' });

    await createMenuItem(SHOP, {
      categoryId: 'c1',
      name: 'ข้าวผัดกุ้ง',
      price: 12000,
      sortOrder: 0,
      image,
    });

    const created = calls.find((c) => c.method === 'create');
    expect(created?.payload).toBeInstanceOf(FormData);
    expect((created?.payload as FormData).get('name')).toBe('ข้าวผัดกุ้ง');
    expect((created?.payload as FormData).get('image')).toBeInstanceOf(File);
  });

  it('ส่ง JSON ธรรมดาเมื่อไม่มีรูป — อ่านง่ายกว่าตอน debug', async () => {
    const calls = mockPb();

    await createMenuItem(SHOP, {
      categoryId: 'c1',
      name: 'ข้าวผัด',
      price: 6000,
      sortOrder: 0,
    });

    expect(calls.find((c) => c.method === 'create')?.payload).not.toBeInstanceOf(
      FormData,
    );
  });
});

describe('deleteCategory', () => {
  it('ปฏิเสธเมื่อหมวดยังมีเมนูอยู่ พร้อมบอกจำนวน', async () => {
    await seedItem('m1', { categoryId: 'c1' });
    await seedItem('m2', { categoryId: 'c1' });
    const calls = mockPb();

    await expect(deleteCategory(SHOP, 'c1')).rejects.toThrow('2 รายการ');
    expect(calls.filter((c) => c.method === 'delete')).toHaveLength(0);
  });

  it('ลบได้เมื่อหมวดว่างแล้ว', async () => {
    const calls = mockPb();

    await deleteCategory(SHOP, 'c-empty');

    expect(calls.some((c) => c.method === 'delete' && c.collection === 'categories')).toBe(
      true,
    );
  });

  it('ไม่นับเมนูของหมวดอื่นมาขวางการลบ', async () => {
    await seedItem('m1', { categoryId: 'c2' });
    const calls = mockPb();

    await deleteCategory(SHOP, 'c1');
    expect(calls.some((c) => c.method === 'delete')).toBe(true);
  });
});

describe('setSoldOut — ตัวเดียวที่ต้องใช้ได้ตอนออฟไลน์', () => {
  beforeEach(async () => {
    await seedItem('m1');
  });

  it('เปลี่ยนค่าในเครื่องทันที ไม่รอเซิร์ฟเวอร์', async () => {
    setOnline(false);

    await setSoldOut('m1', true);

    expect((await db.menuItems.get('m1'))?.soldOut).toBe(true);
  });

  it('เข้าคิวรอส่งพร้อม id ของเซิร์ฟเวอร์', async () => {
    setOnline(false);

    await setSoldOut('m1', true);

    const job = await db.outbox.orderBy('seq').first();
    expect(job?.collection).toBe('menu_items');
    expect(job?.op).toBe('update');
    // ต้องมี serverId มิฉะนั้นตัวส่งจะไปค้นด้วย client_uuid
    // ซึ่งตาราง menu_items ไม่มีคอลัมน์นั้น แล้วงานจะติดค้างถาวร
    expect(job?.serverId).toBe('m1');
    expect(job?.payload).toEqual({ sold_out: true });
  });

  it('กดเปิดแล้วปิดได้ และเข้าคิวทั้งสองครั้งตามลำดับ', async () => {
    setOnline(false);

    await setSoldOut('m1', true);
    await setSoldOut('m1', false);

    expect((await db.menuItems.get('m1'))?.soldOut).toBe(false);
    const jobs = await db.outbox.orderBy('seq').toArray();
    expect(jobs.map((j) => j.payload)).toEqual([{ sold_out: true }, { sold_out: false }]);
  });

  it('เมนูที่ไม่มีในเครื่องแจ้ง error ไม่เข้าคิวเปล่าๆ', async () => {
    await expect(setSoldOut('ไม่มีเมนูนี้', true)).rejects.toThrow('ไม่พบเมนูนี้');
    expect(await db.outbox.count()).toBe(0);
  });

  it('ทำงานเหมือนกันตอนมีเน็ต — ไม่แยกเส้นทาง', async () => {
    // ถ้าแยกเส้นทางตอนมีเน็ต จะเกิดบั๊กที่โผล่เฉพาะตอนเน็ตดี
    // ซึ่งเป็นบั๊กที่หายากที่สุดเวลาลูกค้าแจ้ง
    setOnline(true);

    await setSoldOut('m1', true);

    expect((await db.menuItems.get('m1'))?.soldOut).toBe(true);
    expect(await db.outbox.count()).toBe(1);
  });
});
