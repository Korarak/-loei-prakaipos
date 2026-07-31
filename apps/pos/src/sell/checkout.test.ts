import 'fake-indexeddb/auto';
import type { MenuItem } from '@prakaipos/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildDevice, getDevice, saveDevice } from '../auth/device.js';
import { db } from '../db/db.js';
import { addItem, emptyCart, setDiscount } from './cart.js';
import { checkout, ordersOfDay, toServerPayload, voidOrder } from './checkout.js';

const NOW = new Date('2026-07-31T05:30:00.000Z');
const SHOP = 'shop-a';
const STAFF = 'staff-1';

function menu(id: string, name: string, price: number): MenuItem {
  return {
    id,
    shopId: SHOP,
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

/** ตะกร้า 1 ข้าวผัดกุ้ง + 2 ชาเย็น = 180.00 บาท */
function sampleCart() {
  return addItem(addItem(emptyCart, kungFried), iceTea, 2);
}

beforeEach(async () => {
  await db.orders.clear();
  await db.outbox.clear();
  await db.settings.clear();
  await saveDevice(
    buildDevice(
      {
        shopId: SHOP,
        shopCode: 'krua-nong',
        shopName: 'ครัวน้อง',
        deviceIndex: 1,
        deviceName: 'แท็บเล็ตหน้าร้าน',
      },
      NOW,
    ),
  );
});

describe('checkout — เงินสด', () => {
  it('บันทึกบิลลงเครื่องพร้อมยอดที่ถูกต้อง', async () => {
    const { order } = await checkout(
      { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 20000 },
      NOW,
    );

    expect(order.subtotal).toBe(18000);
    expect(order.total).toBe(18000);
    expect(order.status).toBe('paid');
    expect(order.channel).toBe('pos');
    expect(await db.orders.get(order.clientUuid)).toBeDefined();
  });

  it('คิดเงินทอนถูกต้อง', async () => {
    const { change } = await checkout(
      { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 20000 },
      NOW,
    );

    expect(change).toBe(2000); // 200.00 − 180.00
  });

  it('จ่ายพอดีไม่มีทอน', async () => {
    const { change } = await checkout(
      { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 18000 },
      NOW,
    );

    expect(change).toBe(0);
  });

  it('รับเงินน้อยกว่ายอดบิลต้องไม่ผ่าน — ยอดสิ้นวันจะไม่ตรง', async () => {
    await expect(
      checkout(
        { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 10000 },
        NOW,
      ),
    ).rejects.toThrow('น้อยกว่ายอดบิล');

    expect(await db.orders.count()).toBe(0);
  });

  it('หักส่วนลดก่อนคิดเงินทอน', async () => {
    const cart = setDiscount(sampleCart(), 3000);

    const { order, change } = await checkout(
      { shopId: SHOP, staffId: STAFF, cart, method: 'cash', received: 20000 },
      NOW,
    );

    expect(order.subtotal).toBe(18000);
    expect(order.discount).toBe(3000);
    expect(order.total).toBe(15000);
    expect(change).toBe(5000);
  });
});

describe('checkout — พร้อมเพย์', () => {
  it('ไม่มีเงินทอน', async () => {
    const { order, change } = await checkout(
      {
        shopId: SHOP,
        staffId: STAFF,
        cart: sampleCart(),
        method: 'promptpay',
        received: 18000,
      },
      NOW,
    );

    expect(change).toBe(0);
    expect(order.payment?.method).toBe('promptpay');
    expect(order.payment?.change).toBe(0);
  });
});

describe('checkout — เลขบิล', () => {
  it('ใช้เลขจากช่วงที่เครื่องจองไว้ และเดินหน้าทีละหนึ่ง', async () => {
    const a = await checkout(
      { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 20000 },
      NOW,
    );
    const b = await checkout(
      { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 20000 },
      NOW,
    );

    expect(a.order.orderNo).toBe(1001);
    expect(b.order.orderNo).toBe(1002);
  });

  it('บันทึกความคืบหน้าลงเครื่องทันที ไม่รอบิลเสร็จ', async () => {
    await checkout(
      { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 20000 },
      NOW,
    );

    expect((await getDevice())?.orderNoRange.next).toBe(1002);
  });

  it('ทุกบิลมี UUID ของตัวเองไม่ซ้ำกัน', async () => {
    const a = await checkout(
      { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 20000 },
      NOW,
    );
    const b = await checkout(
      { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 20000 },
      NOW,
    );

    expect(a.order.clientUuid).not.toBe(b.order.clientUuid);
  });

  it('ช่วงเลขหมดแล้วล้มก่อนบันทึกอะไร ไม่ทิ้งบิลครึ่งๆ กลางๆ', async () => {
    const device = await getDevice();
    await saveDevice({
      ...device!,
      orderNoRange: { start: 1001, end: 2000, next: 2001 },
    });

    await expect(
      checkout(
        { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 20000 },
        NOW,
      ),
    ).rejects.toThrow('ถูกใช้หมดแล้ว');

    expect(await db.orders.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('checkout — คิวส่ง', () => {
  it('เข้าคิวหนึ่งงานต่อหนึ่งบิล', async () => {
    const { order } = await checkout(
      { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 20000 },
      NOW,
    );

    const jobs = await db.outbox.toArray();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.collection).toBe('orders');
    expect(jobs[0]?.op).toBe('create');
    expect(jobs[0]?.clientUuid).toBe(order.clientUuid);
  });

  it('payload ใช้ชื่อฟิลด์แบบเซิร์ฟเวอร์ และเก็บรายการไว้ครบ', async () => {
    const { order } = await checkout(
      { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 20000 },
      NOW,
    );

    const payload = toServerPayload(order);
    expect(payload.client_uuid).toBe(order.clientUuid);
    expect(payload.order_no).toBe(1001);
    expect(payload.shop).toBe(SHOP);
    expect(payload.total).toBe(18000);
    expect(Array.isArray(payload.lines)).toBe(true);
    expect((payload.lines as unknown[]).length).toBe(2);
  });

  it('เก็บชื่อและราคา ณ เวลาขายไว้ในบิล ไม่อ้างไปที่เมนู', async () => {
    // รายงานย้อนหลังต้องแสดงยอดเดิมที่ลูกค้าจ่ายจริง แม้เมนูจะถูกแก้ราคาไปแล้ว
    const { order } = await checkout(
      { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 20000 },
      NOW,
    );

    expect(order.lines[0]?.nameSnapshot).toBe('ข้าวผัดกุ้ง');
    expect(order.lines[0]?.unitPrice).toBe(12000);
  });
});

describe('checkout — บิลว่าง', () => {
  it('ปิดบิลว่างไม่ได้ และไม่กินเลขบิลไปเปล่าๆ', async () => {
    await expect(
      checkout(
        { shopId: SHOP, staffId: STAFF, cart: emptyCart, method: 'cash', received: 0 },
        NOW,
      ),
    ).rejects.toThrow('บิลว่าง');

    expect((await getDevice())?.orderNoRange.next).toBe(1001);
  });
});

describe('voidOrder', () => {
  it('เปลี่ยนสถานะเป็น void ไม่ลบทิ้ง — ต้องตรวจสอบย้อนหลังได้', async () => {
    const { order } = await checkout(
      { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 20000 },
      NOW,
    );

    await voidOrder(order.clientUuid, NOW);

    const stored = await db.orders.get(order.clientUuid);
    expect(stored).toBeDefined();
    expect(stored?.status).toBe('void');
    expect(stored?.total).toBe(18000); // ยอดเดิมยังอยู่ให้ตรวจสอบได้
  });

  it('เข้าคิวแจ้งเซิร์ฟเวอร์ด้วย', async () => {
    const { order } = await checkout(
      { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 20000 },
      NOW,
    );
    await db.outbox.clear();

    await voidOrder(order.clientUuid, NOW);

    const jobs = await db.outbox.toArray();
    expect(jobs[0]?.op).toBe('update');
    expect(jobs[0]?.payload).toEqual({ status: 'void' });
  });

  it('ยกเลิกซ้ำไม่เข้าคิวซ้ำ', async () => {
    const { order } = await checkout(
      { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 20000 },
      NOW,
    );
    await voidOrder(order.clientUuid, NOW);
    await db.outbox.clear();

    await voidOrder(order.clientUuid, NOW);
    expect(await db.outbox.count()).toBe(0);
  });

  it('บิลที่ไม่มีในเครื่องแจ้ง error', async () => {
    await expect(voidOrder('ไม่มีบิลนี้', NOW)).rejects.toThrow('ไม่พบบิลนี้');
  });
});

describe('ordersOfDay', () => {
  it('คืนเฉพาะบิลของวันนั้น เรียงใหม่สุดขึ้นก่อน', async () => {
    const morning = new Date('2026-07-31T02:00:00.000Z');
    const evening = new Date('2026-07-31T12:00:00.000Z');
    const yesterday = new Date('2026-07-30T05:00:00.000Z');

    await checkout(
      { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 20000 },
      morning,
    );
    await checkout(
      { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 20000 },
      evening,
    );
    await checkout(
      { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 20000 },
      yesterday,
    );

    const today = await ordersOfDay(SHOP, new Date('2026-07-31T08:00:00.000Z'));

    expect(today).toHaveLength(2);
    expect(new Date(today[0]!.createdAt).getTime()).toBeGreaterThan(
      new Date(today[1]!.createdAt).getTime(),
    );
  });

  it('ไม่ปนบิลของร้านอื่น', async () => {
    await checkout(
      { shopId: SHOP, staffId: STAFF, cart: sampleCart(), method: 'cash', received: 20000 },
      NOW,
    );

    expect(await ordersOfDay('shop-b', NOW)).toEqual([]);
  });
});
