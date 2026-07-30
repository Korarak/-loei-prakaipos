import type { OutboxItem } from '@prakaipos/shared';
import { db } from './db.js';

/**
 * คิวงานที่รอส่งขึ้นคลาวด์
 *
 * กฎที่ยึด:
 *
 * 1. **ส่งตามลำดับเสมอ** งานที่ติดอยู่จะบล็อกงานที่ตามหลัง ไม่ข้ามไปส่งตัวอื่น
 *    เพราะการ "อัปเดตบิล" ต้องเกิดหลัง "สร้างบิล" ใบเดียวกัน ถ้าข้ามลำดับ
 *    การอัปเดตจะไปถึงเซิร์ฟเวอร์ก่อนแล้วล้มเหลวเพราะยังไม่มีบิลนั้น
 *
 * 2. **ส่งซ้ำได้ไม่จำกัด** ทุกงานผูกกับ clientUuid ถ้าเซิร์ฟเวอร์บอกว่าซ้ำ
 *    แปลว่าครั้งก่อนถึงปลายทางแล้วแต่คำตอบหายกลางทาง — ถือว่าสำเร็จ
 *    นี่คือเหตุผลทั้งหมดที่ต้องมี UUID จากเครื่อง
 *
 * 3. **งานที่ล้มเหลวแบบแก้ไม่ได้จะค้างในคิว ไม่ถูกทิ้ง**
 *    ยอมให้คิวตันดีกว่าทำข้อมูลการขายหาย ซึ่งเป็นความเสียหายที่กู้ไม่ได้
 *    หน้าจอต้องแสดงให้เจ้าของร้านเห็นว่ามีรายการค้าง เพื่อให้โทรหาเราได้
 */

/** ผลการส่งงานหนึ่งชิ้น */
export type SendResult =
  | { ok: true; serverId?: string }
  /**
   * ล้มเหลวแบบลองใหม่ได้ — เน็ตหลุด, เซิร์ฟเวอร์ล่ม, timeout
   * งานยังอยู่ในคิว รอถอยเวลาแล้วลองใหม่
   */
  | { ok: false; retryable: true; error: string }
  /**
   * ล้มเหลวแบบลองใหม่ก็ไม่หาย — ข้อมูลผิดรูปแบบ, สิทธิ์ไม่พอ
   * งานยังอยู่ในคิวและบล็อกงานถัดไป ต้องมีคนเข้าไปแก้
   */
  | { ok: false; retryable: false; error: string };

export interface OutboxSender {
  send(item: OutboxItem): Promise<SendResult>;
}

/** เวลารอครั้งแรกก่อนลองส่งใหม่ */
const BASE_DELAY_MS = 2_000;
/** เพดานเวลารอ — ไม่ปล่อยให้ถอยจนนานเป็นชั่วโมง เพราะร้านอยากเห็นข้อมูลขึ้นเร็ว */
const MAX_DELAY_MS = 5 * 60_000;
/** ล้มเหลวเกินจำนวนนี้ถือว่า "ติด" ต้องแจ้งเจ้าของร้าน */
export const STUCK_AFTER_ATTEMPTS = 8;

/**
 * เวลารอก่อนลองใหม่ เพิ่มเป็นเท่าตัวตามจำนวนครั้งที่ล้มเหลว
 * มีการสุ่มบวกเล็กน้อย (jitter) กันหลายเครื่องยิงพร้อมกันตอนเน็ตกลับมา
 */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const exponential = BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1);
  const capped = Math.min(exponential, MAX_DELAY_MS);
  return Math.round(capped * (0.75 + random() * 0.5));
}

/** เพิ่มงานเข้าคิว — เรียกทันทีหลังเขียนข้อมูลลงเครื่องสำเร็จ */
export async function enqueue(
  entry: Pick<OutboxItem, 'collection' | 'op' | 'clientUuid' | 'payload'>,
  now: Date = new Date(),
): Promise<number> {
  const iso = now.toISOString();
  // ไม่ส่ง seq มา — Dexie ออกเลขให้เองแบบ auto-increment
  return db.outbox.add({
    ...entry,
    createdAt: iso,
    attempts: 0,
    nextAttemptAt: iso,
    lastError: '',
  });
}

/** จำนวนงานที่ยังค้างส่ง — เอาไปแสดงบนหน้าจอให้เจ้าของร้านเห็น */
export function pendingCount(): Promise<number> {
  return db.outbox.count();
}

/** งานที่ล้มเหลวซ้ำจนน่าจะต้องมีคนเข้ามาดู */
export async function stuckItems(): Promise<OutboxItem[]> {
  return db.outbox.filter((i) => i.attempts >= STUCK_AFTER_ATTEMPTS).toArray();
}

export interface FlushResult {
  /** ส่งสำเร็จกี่ชิ้น */
  sent: number;
  /** ยังเหลือค้างในคิวกี่ชิ้น */
  remaining: number;
  /** หยุดเพราะอะไร */
  stoppedBy: 'drained' | 'not_due' | 'retryable_error' | 'blocked' | 'limit';
  /** ข้อความ error ล่าสุด ถ้ามี */
  lastError?: string;
}

export interface FlushOptions {
  now?: Date;
  /** ส่งได้สูงสุดกี่ชิ้นต่อการเรียกหนึ่งครั้ง กันไม่ให้บล็อก UI ยาว */
  limit?: number;
  random?: () => number;
}

/**
 * ส่งงานในคิวออกไปตามลำดับ จนกว่าจะหมด ติด หรือถึงเพดานที่กำหนด
 *
 * ปลอดภัยเมื่อถูกเรียกซ้ำ — ถ้ามีการเรียกซ้อนกัน งานที่ส่งไปแล้วจะถูกลบ
 * ออกจากคิวไปก่อน และการส่งซ้ำก็ไม่ทำให้เกิดข้อมูลซ้ำอยู่แล้ว
 */
export async function flushOutbox(
  sender: OutboxSender,
  options: FlushOptions = {},
): Promise<FlushResult> {
  const { now = new Date(), limit = 50, random = Math.random } = options;
  let sent = 0;

  for (let i = 0; i < limit; i++) {
    // เอาชิ้นที่ลำดับน้อยที่สุดเสมอ — ห้ามข้ามไปหยิบชิ้นที่ "ถึงเวลา" แล้ว
    // เพราะจะทำให้ลำดับการสร้าง/อัปเดตสลับกัน
    const item = await db.outbox.orderBy('seq').first();
    if (!item) {
      return { sent, remaining: 0, stoppedBy: 'drained' };
    }

    if (new Date(item.nextAttemptAt) > now) {
      return {
        sent,
        remaining: await db.outbox.count(),
        stoppedBy: 'not_due',
        lastError: item.lastError || undefined,
      };
    }

    const result = await sender.send(item);

    if (result.ok) {
      await db.outbox.delete(item.seq);
      sent++;
      continue;
    }

    const attempts = item.attempts + 1;
    await db.outbox.update(item.seq, {
      attempts,
      lastError: result.error,
      nextAttemptAt: new Date(
        now.getTime() + backoffMs(attempts, random),
      ).toISOString(),
    });

    return {
      sent,
      remaining: await db.outbox.count(),
      // แยกสองกรณีให้ชัด เพราะหน้าจอต้องแสดงต่างกัน:
      // เน็ตหลุดคือเรื่องปกติที่หายเอง ส่วน blocked คือเรื่องที่ต้องมีคนแก้
      stoppedBy: result.retryable ? 'retryable_error' : 'blocked',
      lastError: result.error,
    };
  }

  return { sent, remaining: await db.outbox.count(), stoppedBy: 'limit' };
}
