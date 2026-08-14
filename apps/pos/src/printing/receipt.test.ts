import type { Order } from '@prakaipos/shared';
import { describe, expect, it } from 'vitest';
import { buildOrderReceipt } from './receipt.js';

function sampleOrder(overrides: Partial<Order> = {}): Order {
  return {
    clientUuid: 'c1',
    shopId: 'shop-a',
    orderNo: 42,
    channel: 'pos',
    status: 'paid',
    tableNo: '',
    tableSessionId: '',
    lines: [
      {
        clientUuid: 'l1',
        menuItemId: 'm1',
        nameSnapshot: 'ข้าวผัดกุ้ง',
        unitPrice: 12000,
        qty: 2,
        note: '',
        modifiers: [],
        orderedBy: '',
      },
    ],
    subtotal: 24000,
    discount: 0,
    total: 24000,
    payment: { method: 'cash', amount: 30000, change: 6000, paidAt: '2026-07-31T05:00:00.000Z' },
    staffId: 'staff-1',
    createdAt: '2026-07-31T05:00:00.000Z',
    updatedAt: '2026-07-31T05:00:00.000Z',
    ...overrides,
  };
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

describe('buildOrderReceipt', () => {
  it('มีชื่อร้าน เลขบิล รายการ และยอดรวม', () => {
    const text = decode(buildOrderReceipt(sampleOrder(), 'ครัวน้อง'));
    expect(text).toContain('ครัวน้อง');
    expect(text).toContain('บิลเลขที่ 42');
    expect(text).toContain('ข้าวผัดกุ้ง');
    expect(text).toContain('รวมทั้งสิ้น');
    expect(text).toContain('240.00');
  });

  it('แสดงเลขโต๊ะเมื่อมี ไม่แสดงเมื่อไม่มี', () => {
    const withTable = decode(buildOrderReceipt(sampleOrder({ tableNo: '5' }), 'ครัวน้อง'));
    expect(withTable).toContain('โต๊ะ 5');

    const withoutTable = decode(buildOrderReceipt(sampleOrder({ tableNo: '' }), 'ครัวน้อง'));
    expect(withoutTable).not.toContain('โต๊ะ');
  });

  it('แสดงส่วนลดเมื่อมีส่วนลดเท่านั้น', () => {
    const discounted = decode(
      buildOrderReceipt(sampleOrder({ subtotal: 25000, discount: 1000, total: 24000 }), 'ครัวน้อง'),
    );
    expect(discounted).toContain('ส่วนลด');

    const noDiscount = decode(buildOrderReceipt(sampleOrder(), 'ครัวน้อง'));
    expect(noDiscount).not.toContain('ส่วนลด');
  });

  it('แสดงเงินทอนเฉพาะจ่ายเงินสด ไม่แสดงตอนพร้อมเพย์', () => {
    const cash = decode(buildOrderReceipt(sampleOrder(), 'ครัวน้อง'));
    expect(cash).toContain('เงินทอน');

    const promptpay = decode(
      buildOrderReceipt(
        sampleOrder({
          payment: { method: 'promptpay', amount: 24000, change: 0, paidAt: '2026-07-31T05:00:00.000Z' },
        }),
        'ครัวน้อง',
      ),
    );
    expect(promptpay).not.toContain('เงินทอน');
    expect(promptpay).toContain('พร้อมเพย์');
  });

  it('มีหัวเรื่องใบเสร็จรับเงินและช่องทางการขาย', () => {
    const pos = decode(buildOrderReceipt(sampleOrder(), 'ครัวน้อง'));
    expect(pos).toContain('ใบเสร็จรับเงิน');
    expect(pos).toContain('ช่องทาง หน้าร้าน');

    const qr = decode(buildOrderReceipt(sampleOrder({ channel: 'qr' }), 'ครัวน้อง'));
    expect(qr).toContain('ช่องทาง ลูกค้าสั่งผ่าน QR');
  });

  it('แสดงชื่อพนักงานเมื่อส่งมาให้เท่านั้น', () => {
    const withStaff = decode(
      buildOrderReceipt(sampleOrder(), 'ครัวน้อง', { staffName: 'เจ้าของร้าน' }),
    );
    expect(withStaff).toContain('พนักงาน เจ้าของร้าน');

    const withoutStaff = decode(buildOrderReceipt(sampleOrder(), 'ครัวน้อง'));
    expect(withoutStaff).not.toContain('พนักงาน ');
  });

  it('จบด้วยคำสั่งตัดกระดาษ', () => {
    const bytes = buildOrderReceipt(sampleOrder(), 'ครัวน้อง');
    const tail = bytes.slice(-3);
    expect(Array.from(tail)).toEqual([0x1d, 0x56, 0x00]);
  });
});
