import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getSetting } from '../db/db.js';
import { pb } from './pb.js';
import { pullOrders, resetOrdersCursor } from './pullOrders.js';

const SHOP = 'shop-a';

function order(clientUuid: string, over: Record<string, unknown> = {}) {
  return {
    id: `srv-${clientUuid}`,
    client_uuid: clientUuid,
    shop: SHOP,
    order_no: 1001,
    channel: 'pos',
    status: 'paid',
    table_no: '',
    lines: [],
    subtotal: 6000,
    discount: 0,
    total: 6000,
    payment: { method: 'cash', amount: 6000, change: 0, paidAt: '2026-07-31 09:00:00.000Z' },
    staff: 'staff-1',
    created: '2026-07-31 09:00:00.000Z',
    updated: '2026-07-31 09:00:00.000Z',
    ...over,
  };
}

/** จำลอง pb.collection('orders').getFullList() และจดว่าถูกเรียกด้วย filter อะไร */
function mockOrders(records: unknown[]) {
  let filter = '';
  vi.spyOn(pb, 'collection').mockImplementation(
    () =>
      ({
        getFullList: async (opts: { filter: string }) => {
          filter = opts.filter;
          return records;
        },
      }) as never,
  );
  return () => filter;
}

beforeEach(async () => {
  await db.orders.clear();
  await db.settings.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pullOrders — ดึงครั้งแรก', () => {
  it('เก็บบิลจากเครื่องอื่นลงเครื่องนี้', async () => {
    mockOrders([order('o1'), order('o2', { order_no: 1002 })]);

    const result = await pullOrders(SHOP);

    expect(result.pulled).toBe(2);
    expect(await db.orders.count()).toBe(2);
    expect((await db.orders.get('o1'))?.orderNo).toBe(1001);
  });

  it('ครั้งแรกไม่ใส่เงื่อนไขเวลา ขอทั้งหมด', async () => {
    const getFilter = mockOrders([order('o1')]);

    await pullOrders(SHOP);

    expect(getFilter()).toBe(`shop="${SHOP}"`);
    expect(getFilter()).not.toContain('updated');
  });

  it('แปลงฟิลด์ให้ตรงกับรูปแบบที่แอปใช้', async () => {
    mockOrders([
      order('o1', {
        table_no: '5',
        lines: [
          {
            clientUuid: 'l1',
            menuItemId: 'm1',
            nameSnapshot: 'ข้าวผัด',
            unitPrice: 6000,
            qty: 2,
            note: '',
            modifiers: [],
            orderedBy: '',
          },
        ],
      }),
    ]);

    await pullOrders(SHOP);

    const stored = await db.orders.get('o1');
    expect(stored?.tableNo).toBe('5');
    expect(stored?.shopId).toBe(SHOP);
    expect(stored?.id).toBe('srv-o1');
    expect(stored?.tableSessionId).toBe('');
    expect(stored?.lines).toHaveLength(1);
    expect(stored?.lines[0]?.nameSnapshot).toBe('ข้าวผัด');
  });
});

describe('pullOrders — ดึงเฉพาะที่เปลี่ยน', () => {
  it('รอบถัดไปใส่เงื่อนไข updated จาก cursor', async () => {
    mockOrders([order('o1', { updated: '2026-07-31 09:30:00.000Z' })]);
    await pullOrders(SHOP);

    const getFilter = mockOrders([]);
    await pullOrders(SHOP);

    expect(getFilter()).toContain('updated > "2026-07-31 09:30:00.000Z"');
  });

  it('เลื่อน cursor ตามค่าที่เซิร์ฟเวอร์ให้ ไม่ใช่เวลาของเครื่อง', async () => {
    mockOrders([order('o1', { updated: '2026-07-31 09:45:00.000Z' })]);

    await pullOrders(SHOP);

    expect(await getSetting('sync.orders.cursor', '')).toBe('2026-07-31 09:45:00.000Z');
  });

  it('ไม่มีอะไรเปลี่ยนก็ไม่เลื่อน cursor', async () => {
    mockOrders([order('o1', { updated: '2026-07-31 09:30:00.000Z' })]);
    await pullOrders(SHOP);

    mockOrders([]);
    await pullOrders(SHOP);

    expect(await getSetting('sync.orders.cursor', '')).toBe('2026-07-31 09:30:00.000Z');
  });

  it('บิลที่มีอยู่แล้ว ดึงมาทับได้ (เช่น เติม id ของเซิร์ฟเวอร์)', async () => {
    mockOrders([order('o1', { status: 'open' })]);
    await pullOrders(SHOP);
    expect((await db.orders.get('o1'))?.status).toBe('open');

    mockOrders([order('o1', { status: 'paid', updated: '2026-07-31 09:50:00.000Z' })]);
    await pullOrders(SHOP);

    expect(await db.orders.count()).toBe(1);
    expect((await db.orders.get('o1'))?.status).toBe('paid');
  });
});

describe('pullOrders — บิลที่ยกเลิกในเครื่องนี้แล้ว', () => {
  it('ไม่ยอมให้ของที่ดึงมาทับสถานะ void กลับเป็นของเดิม', async () => {
    // จำลองว่าเครื่องนี้ยกเลิกบิลไปแล้ว (local เขียนตรง เหมือน voidOrder ทำ)
    // แต่คิวส่งอัปเดตยังไม่ถึงเซิร์ฟเวอร์ — เซิร์ฟเวอร์จึงยังตอบว่า status: paid
    await db.orders.put({
      clientUuid: 'o1',
      shopId: SHOP,
      orderNo: 1001,
      channel: 'pos',
      status: 'void',
      tableNo: '',
      tableSessionId: '',
      lines: [],
      subtotal: 6000,
      discount: 0,
      total: 6000,
      payment: null,
      staffId: 'staff-1',
      createdAt: '2026-07-31T09:00:00.000Z',
      updatedAt: '2026-07-31T09:05:00.000Z',
    });

    mockOrders([order('o1', { status: 'paid' })]);
    const result = await pullOrders(SHOP);

    expect(result.skippedVoid).toBe(1);
    expect(result.pulled).toBe(0);
    expect((await db.orders.get('o1'))?.status).toBe('void');
  });

  it('ดึงบิล void มาจากเซิร์ฟเวอร์ได้ตามปกติ (ไม่ใช่การทับกลับ)', async () => {
    mockOrders([order('o1', { status: 'void' })]);
    const result = await pullOrders(SHOP);

    expect(result.skippedVoid).toBe(0);
    expect((await db.orders.get('o1'))?.status).toBe('void');
  });
});

describe('pullOrders — แยกร้าน', () => {
  it('ไม่แตะบิลของร้านอื่น', async () => {
    await db.orders.put({
      clientUuid: 'other-1',
      shopId: 'shop-b',
      orderNo: 1,
      channel: 'pos',
      status: 'paid',
      tableNo: '',
      tableSessionId: '',
      lines: [],
      subtotal: 100,
      discount: 0,
      total: 100,
      payment: null,
      staffId: 'staff-x',
      createdAt: '2026-07-31T09:00:00.000Z',
      updatedAt: '2026-07-31T09:00:00.000Z',
    });

    const getFilter = mockOrders([order('o1')]);
    await pullOrders(SHOP);

    expect(getFilter()).toBe(`shop="${SHOP}"`);
    expect(await db.orders.get('other-1')).toBeDefined();
  });
});

describe('resetOrdersCursor', () => {
  it('ล้างแล้วรอบถัดไปดึงใหม่ทั้งหมด', async () => {
    mockOrders([order('o1', { updated: '2026-07-31 09:30:00.000Z' })]);
    await pullOrders(SHOP);

    await resetOrdersCursor();

    const getFilter = mockOrders([order('o1')]);
    await pullOrders(SHOP);

    expect(getFilter()).not.toContain('updated');
  });
});
