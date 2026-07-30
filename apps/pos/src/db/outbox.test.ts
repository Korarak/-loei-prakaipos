import 'fake-indexeddb/auto';
import type { OutboxItem } from '@prakaipos/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db.js';
import {
  STUCK_AFTER_ATTEMPTS,
  backoffMs,
  enqueue,
  flushOutbox,
  pendingCount,
  stuckItems,
  type OutboxSender,
  type SendResult,
} from './outbox.js';

/** ตัวส่งปลอมที่สั่งผลลัพธ์ได้ทีละครั้ง และจดว่าถูกเรียกด้วยอะไรบ้าง */
function fakeSender(results: SendResult[]): OutboxSender & { calls: OutboxItem[] } {
  const calls: OutboxItem[] = [];
  let i = 0;
  return {
    calls,
    async send(item) {
      calls.push(structuredClone(item));
      return results[i++] ?? { ok: true };
    },
  };
}

const OK: SendResult = { ok: true };
const NET_DOWN: SendResult = { ok: false, retryable: true, error: 'เน็ตหลุด' };
const BAD_DATA: SendResult = { ok: false, retryable: false, error: 'ข้อมูลไม่ถูกต้อง' };

async function enqueueOrder(uuid: string, orderNo: number) {
  return enqueue({
    collection: 'orders',
    op: 'create',
    clientUuid: uuid,
    payload: { client_uuid: uuid, order_no: orderNo },
  });
}

beforeEach(async () => {
  await db.outbox.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('backoffMs', () => {
  it('เพิ่มเป็นเท่าตัวตามจำนวนครั้งที่ล้มเหลว', () => {
    const noJitter = () => 0.5; // ให้ตัวคูณเป็น 1.0 พอดี
    expect(backoffMs(1, noJitter)).toBe(2_000);
    expect(backoffMs(2, noJitter)).toBe(4_000);
    expect(backoffMs(3, noJitter)).toBe(8_000);
  });

  it('มีเพดานไม่เกิน 5 นาที ไม่ปล่อยให้ถอยจนนานเกินไป', () => {
    const noJitter = () => 0.5;
    expect(backoffMs(20, noJitter)).toBe(5 * 60_000);
  });

  it('มี jitter กันหลายเครื่องยิงพร้อมกันตอนเน็ตกลับมา', () => {
    // ตัวคูณอยู่ในช่วง 0.75–1.25 ของค่าฐาน
    expect(backoffMs(1, () => 0)).toBe(1_500);
    expect(backoffMs(1, () => 1)).toBe(2_500);
  });
});

describe('enqueue', () => {
  it('งานใหม่พร้อมส่งทันที ไม่ต้องรอ', async () => {
    const now = new Date('2026-07-31T10:00:00.000Z');
    await enqueueOrder('uuid-1', 1001);

    const item = await db.outbox.orderBy('seq').first();
    expect(item?.attempts).toBe(0);
    expect(new Date(item?.nextAttemptAt ?? 0).getTime()).toBeLessThanOrEqual(
      Date.now() + 1000,
    );
    expect(now).toBeInstanceOf(Date); // กันตัวแปรไม่ถูกใช้
  });

  it('รักษาลำดับตามที่เพิ่มเข้ามา', async () => {
    await enqueueOrder('uuid-1', 1001);
    await enqueueOrder('uuid-2', 1002);
    await enqueueOrder('uuid-3', 1003);

    const seqs = (await db.outbox.orderBy('seq').toArray()).map((i) => i.clientUuid);
    expect(seqs).toEqual(['uuid-1', 'uuid-2', 'uuid-3']);
  });
});

describe('flushOutbox — เส้นทางปกติ', () => {
  it('คิวว่างก็ไม่ทำอะไร', async () => {
    const result = await flushOutbox(fakeSender([]));
    expect(result).toEqual({ sent: 0, remaining: 0, stoppedBy: 'drained' });
  });

  it('ส่งหมดคิวแล้วลบออกจากคิว', async () => {
    await enqueueOrder('uuid-1', 1001);
    await enqueueOrder('uuid-2', 1002);

    const result = await flushOutbox(fakeSender([OK, OK]));

    expect(result.sent).toBe(2);
    expect(result.stoppedBy).toBe('drained');
    expect(await pendingCount()).toBe(0);
  });

  it('ส่งตามลำดับที่เข้าคิว', async () => {
    await enqueueOrder('uuid-1', 1001);
    await enqueueOrder('uuid-2', 1002);
    await enqueueOrder('uuid-3', 1003);

    const sender = fakeSender([OK, OK, OK]);
    await flushOutbox(sender);

    expect(sender.calls.map((c) => c.clientUuid)).toEqual([
      'uuid-1',
      'uuid-2',
      'uuid-3',
    ]);
  });

  it('หยุดเมื่อถึงเพดานต่อรอบ กันไม่ให้บล็อกหน้าจอนาน', async () => {
    for (let i = 0; i < 5; i++) await enqueueOrder(`uuid-${i}`, 1000 + i);

    const result = await flushOutbox(fakeSender(Array(5).fill(OK)), { limit: 2 });

    expect(result.sent).toBe(2);
    expect(result.stoppedBy).toBe('limit');
    expect(await pendingCount()).toBe(3);
  });
});

describe('flushOutbox — เน็ตหลุด', () => {
  it('งานที่ส่งไม่สำเร็จยังอยู่ในคิว ไม่หายไปไหน', async () => {
    await enqueueOrder('uuid-1', 1001);

    const result = await flushOutbox(fakeSender([NET_DOWN]));

    expect(result.sent).toBe(0);
    expect(result.stoppedBy).toBe('retryable_error');
    expect(await pendingCount()).toBe(1);
  });

  it('บันทึกจำนวนครั้งที่ล้มเหลวและข้อความ error ไว้ให้ดูได้', async () => {
    await enqueueOrder('uuid-1', 1001);
    await flushOutbox(fakeSender([NET_DOWN]));

    const item = await db.outbox.orderBy('seq').first();
    expect(item?.attempts).toBe(1);
    expect(item?.lastError).toBe('เน็ตหลุด');
  });

  it('เลื่อนเวลาลองใหม่ออกไปตาม backoff', async () => {
    const now = new Date('2026-07-31T10:00:00.000Z');
    await enqueueOrder('uuid-1', 1001);

    await flushOutbox(fakeSender([NET_DOWN]), { now, random: () => 0.5 });

    const item = await db.outbox.orderBy('seq').first();
    expect(new Date(item?.nextAttemptAt ?? 0).toISOString()).toBe(
      '2026-07-31T10:00:02.000Z',
    );
  });

  it('ยังไม่ถึงเวลาลองใหม่ก็ไม่ยิงเซิร์ฟเวอร์ซ้ำ', async () => {
    const t0 = new Date('2026-07-31T10:00:00.000Z');
    await enqueueOrder('uuid-1', 1001);
    await flushOutbox(fakeSender([NET_DOWN]), { now: t0, random: () => 0.5 });

    // ผ่านไปแค่ 1 วินาที ยังไม่ถึงกำหนด 2 วินาที
    const sender = fakeSender([OK]);
    const result = await flushOutbox(sender, {
      now: new Date('2026-07-31T10:00:01.000Z'),
    });

    expect(sender.calls).toHaveLength(0);
    expect(result.stoppedBy).toBe('not_due');
  });

  it('ถึงเวลาแล้วส่งใหม่ได้สำเร็จ', async () => {
    const t0 = new Date('2026-07-31T10:00:00.000Z');
    await enqueueOrder('uuid-1', 1001);
    await flushOutbox(fakeSender([NET_DOWN]), { now: t0, random: () => 0.5 });

    const result = await flushOutbox(fakeSender([OK]), {
      now: new Date('2026-07-31T10:00:05.000Z'),
    });

    expect(result.sent).toBe(1);
    expect(await pendingCount()).toBe(0);
  });
});

describe('flushOutbox — การรักษาลำดับ (จุดที่พังง่ายที่สุด)', () => {
  it('งานที่ติดอยู่ต้องบล็อกงานที่ตามหลัง ห้ามข้ามไปส่ง', async () => {
    // สถานการณ์จริง: บิลใบที่ 1 ส่งไม่ผ่าน แล้วมีการแก้บิลใบเดียวกันตามมา
    // ถ้าข้ามไปส่ง "อัปเดต" ก่อน "สร้าง" เซิร์ฟเวอร์จะหาบิลไม่เจอ
    await enqueueOrder('uuid-1', 1001);
    await enqueue({
      collection: 'orders',
      op: 'update',
      clientUuid: 'uuid-1',
      payload: { status: 'paid' },
    });

    const sender = fakeSender([NET_DOWN]);
    await flushOutbox(sender);

    expect(sender.calls).toHaveLength(1);
    expect(sender.calls[0]?.op).toBe('create');
    expect(await pendingCount()).toBe(2);
  });

  it('เมื่อชิ้นแรกผ่าน ชิ้นถัดไปจึงได้ส่ง', async () => {
    await enqueueOrder('uuid-1', 1001);
    await enqueue({
      collection: 'orders',
      op: 'update',
      clientUuid: 'uuid-1',
      payload: { status: 'paid' },
    });

    const sender = fakeSender([OK, OK]);
    await flushOutbox(sender);

    expect(sender.calls.map((c) => c.op)).toEqual(['create', 'update']);
    expect(await pendingCount()).toBe(0);
  });
});

describe('flushOutbox — ล้มเหลวแบบแก้ไม่ได้', () => {
  it('ไม่ทิ้งงาน แม้จะรู้ว่าลองใหม่ก็ไม่หาย — ข้อมูลการขายห้ามหาย', async () => {
    await enqueueOrder('uuid-1', 1001);

    const result = await flushOutbox(fakeSender([BAD_DATA]));

    expect(result.stoppedBy).toBe('blocked');
    expect(result.lastError).toBe('ข้อมูลไม่ถูกต้อง');
    expect(await pendingCount()).toBe(1);
  });

  it('แยกสถานะ blocked ออกจาก retryable_error เพื่อให้หน้าจอแสดงต่างกัน', async () => {
    await enqueueOrder('uuid-1', 1001);
    const netResult = await flushOutbox(fakeSender([NET_DOWN]));

    await db.outbox.clear();
    await enqueueOrder('uuid-2', 1002);
    const badResult = await flushOutbox(fakeSender([BAD_DATA]));

    expect(netResult.stoppedBy).toBe('retryable_error');
    expect(badResult.stoppedBy).toBe('blocked');
  });
});

describe('stuckItems', () => {
  it('ไม่รายงานงานที่เพิ่งล้มเหลวไม่กี่ครั้ง', async () => {
    await enqueueOrder('uuid-1', 1001);
    await flushOutbox(fakeSender([NET_DOWN]));

    expect(await stuckItems()).toHaveLength(0);
  });

  it('รายงานงานที่ล้มเหลวซ้ำจนน่าจะต้องมีคนเข้ามาดู', async () => {
    const seq = await enqueueOrder('uuid-1', 1001);
    await db.outbox.update(seq, { attempts: STUCK_AFTER_ATTEMPTS });

    const stuck = await stuckItems();
    expect(stuck).toHaveLength(1);
    expect(stuck[0]?.clientUuid).toBe('uuid-1');
  });
});

describe('การส่งซ้ำเมื่อคำตอบหายกลางทาง', () => {
  it('เซิร์ฟเวอร์บอกว่าซ้ำ = ครั้งก่อนถึงแล้ว ถือว่าสำเร็จ ไม่ค้างคิว', async () => {
    // นี่คือเหตุผลทั้งหมดที่ต้องมี UUID จากเครื่อง: แท็บเล็ตส่งบิลไปแล้ว
    // เซิร์ฟเวอร์บันทึกสำเร็จ แต่ Wi-Fi หลุดก่อนคำตอบจะกลับมา
    // แท็บเล็ตจึงส่งซ้ำ และต้องไม่เกิดบิลใบที่สอง
    await enqueueOrder('uuid-1', 1001);

    // ตัวส่งจริงจะแปลง error "unique constraint" เป็น ok เพราะแปลว่าถึงปลายทางแล้ว
    const result = await flushOutbox(fakeSender([OK]));

    expect(result.sent).toBe(1);
    expect(await pendingCount()).toBe(0);
  });
});
