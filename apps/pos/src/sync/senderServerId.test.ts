import 'fake-indexeddb/auto';
import type { OutboxItem } from '@prakaipos/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pb } from './pb.js';
import { pocketbaseSender } from './sender.js';

/**
 * ตัวส่งต้องเลือกวิธีหาเรกคอร์ดให้ถูกตามชนิดของข้อมูล
 *
 * บิล → แท็บเล็ตสร้างเอง หาเจอจาก client_uuid
 * เมนู → สร้างจากหลังบ้าน ตารางไม่มีคอลัมน์ client_uuid ต้องใช้ id ตรงๆ
 *
 * เลือกผิดแล้วงานจะติดค้างในคิวถาวรโดยไม่มีทางหายเอง
 */

function job(over: Partial<OutboxItem>): OutboxItem {
  return {
    seq: 1,
    collection: 'orders',
    op: 'update',
    clientUuid: 'uuid-1',
    payload: { status: 'paid' },
    createdAt: '2026-07-31T10:00:00.000Z',
    attempts: 0,
    nextAttemptAt: '2026-07-31T10:00:00.000Z',
    lastError: '',
    ...over,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('การอัปเดตเรกคอร์ดที่มีอยู่บนเซิร์ฟเวอร์แล้ว', () => {
  it('มี serverId แล้วอัปเดตตรง ไม่ต้องค้นหาก่อน', async () => {
    const lookups: string[] = [];
    const updates: { id: string; payload: unknown }[] = [];

    vi.spyOn(pb, 'collection').mockReturnValue({
      getFirstListItem: async (filter: string) => {
        lookups.push(filter);
        throw new Error('ไม่ควรถูกเรียก');
      },
      update: async (id: string, payload: unknown) => {
        updates.push({ id, payload });
        return { id };
      },
    } as never);

    const result = await pocketbaseSender.send(
      job({ collection: 'menu_items', serverId: 'm1', payload: { sold_out: true } }),
    );

    expect(result.ok).toBe(true);
    expect(lookups).toHaveLength(0);
    expect(updates).toEqual([{ id: 'm1', payload: { sold_out: true } }]);
  });

  it('ไม่มี serverId ก็ค้นจาก client_uuid ตามเดิม', async () => {
    const lookups: string[] = [];

    vi.spyOn(pb, 'collection').mockReturnValue({
      getFirstListItem: async (filter: string) => {
        lookups.push(filter);
        return { id: 'server-42' };
      },
      update: async (id: string) => ({ id }),
    } as never);

    const result = await pocketbaseSender.send(job({ clientUuid: 'uuid-9' }));

    expect(result.ok).toBe(true);
    expect(lookups).toEqual(['client_uuid="uuid-9"']);
    if (result.ok) expect(result.serverId).toBe('server-42');
  });

  it('เมนูที่ถูกลบไปแล้วถือว่าแก้ไม่ได้ ไม่ใช่ปัญหาเครือข่าย', async () => {
    // เจ้าของร้านลบเมนูตอนที่พนักงานกด "ของหมด" ค้างอยู่ในคิว
    // ต้องไม่วนลองใหม่ไม่รู้จบ
    vi.spyOn(pb, 'collection').mockReturnValue({
      update: async () => {
        throw { status: 404, message: 'ไม่พบเรกคอร์ด' };
      },
    } as never);

    const result = await pocketbaseSender.send(
      job({ collection: 'menu_items', serverId: 'ถูกลบไปแล้ว' }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBe(false);
  });
});
