import type { OutboxItem } from '@prakaipos/shared';
import type { OutboxSender, SendResult } from '../db/outbox.js';
import { pb } from './pb.js';

/**
 * ตัวส่งงานในคิวขึ้น PocketBase
 *
 * งานสำคัญที่สุดของไฟล์นี้คือ **แปลผลลัพธ์ให้ถูก** ว่าอะไรควรลองใหม่
 * อะไรถือว่าสำเร็จไปแล้ว และอะไรต้องให้คนมาแก้ ถ้าแปลผิดจะเกิดหนึ่งในสองอย่าง:
 * คิวตันทั้งที่ควรผ่านไปได้ หรือข้อมูลถูกทิ้งทั้งที่ยังไม่ถึงเซิร์ฟเวอร์
 */

/** รูปแบบ error ที่ PocketBase SDK โยนออกมา */
interface PbError {
  status?: number;
  message?: string;
  response?: { data?: Record<string, { code?: string; message?: string }> };
}

function asPbError(err: unknown): PbError {
  return typeof err === 'object' && err !== null ? (err as PbError) : {};
}

/**
 * ตรวจว่า error นี้แปลว่า "เรกคอร์ดนี้มีอยู่แล้ว" หรือไม่
 *
 * เกิดตอนที่แท็บเล็ตส่งบิลไปแล้วเซิร์ฟเวอร์บันทึกสำเร็จ แต่ Wi-Fi หลุด
 * ก่อนคำตอบจะกลับมา แท็บเล็ตจึงส่งซ้ำ — ต้องถือว่าสำเร็จ ไม่ใช่ล้มเหลว
 * มิฉะนั้นคิวจะตันถาวรทั้งที่ข้อมูลถึงปลายทางเรียบร้อยแล้ว
 */
function isDuplicate(err: PbError): boolean {
  if (err.status !== 400) return false;
  const fields = err.response?.data ?? {};
  return Object.values(fields).some((f) => f?.code === 'validation_not_unique');
}

/**
 * error นี้ลองใหม่แล้วมีโอกาสหายไหม
 *
 * - ไม่มี status (เน็ตหลุด, DNS ไม่ตอบ) → ลองใหม่ได้
 * - 429 (ยิงถี่เกิน) และ 5xx (เซิร์ฟเวอร์มีปัญหา) → ลองใหม่ได้
 * - 4xx อื่นๆ → ข้อมูลหรือสิทธิ์มีปัญหา ลองใหม่กี่ครั้งก็เหมือนเดิม
 */
function isRetryable(err: PbError): boolean {
  const status = err.status;
  if (status === undefined || status === 0) return true;
  return status === 429 || status >= 500;
}

function describe(err: PbError): string {
  const fields = err.response?.data ?? {};
  const detail = Object.entries(fields)
    .map(([field, info]) => `${field}: ${info?.message ?? info?.code ?? '?'}`)
    .join(', ');
  const base = err.message ?? 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
  return detail ? `${base} (${detail})` : base;
}

export const pocketbaseSender: OutboxSender = {
  async send(item: OutboxItem): Promise<SendResult> {
    try {
      if (item.op === 'create') {
        const record = await pb.collection(item.collection).create(item.payload);
        return { ok: true, serverId: record.id };
      }

      // รู้ id ของเซิร์ฟเวอร์อยู่แล้ว (เช่น เมนูที่ดึงลงมา) ก็อัปเดตตรงได้เลย
      if (item.serverId) {
        await pb.collection(item.collection).update(item.serverId, item.payload);
        return { ok: true, serverId: item.serverId };
      }

      // ส่วนบิลที่แท็บเล็ตสร้างเอง ต้องหาเรกคอร์ดจาก clientUuid ก่อน
      // เพราะเครื่องไม่รู้ id ของเซิร์ฟเวอร์จนกว่าการสร้างจะสำเร็จ
      // และเราไม่อยากผูกคิวไว้กับ id ที่อาจยังไม่มี
      const existing = await pb
        .collection(item.collection)
        .getFirstListItem(`client_uuid="${item.clientUuid}"`);
      await pb.collection(item.collection).update(existing.id, item.payload);
      return { ok: true, serverId: existing.id };
    } catch (raw) {
      const err = asPbError(raw);

      if (item.op === 'create' && isDuplicate(err)) {
        // ถึงปลายทางไปแล้วตั้งแต่ครั้งก่อน — คำตอบแค่หายกลางทาง
        return { ok: true };
      }

      return isRetryable(err)
        ? { ok: false, retryable: true, error: describe(err) }
        : { ok: false, retryable: false, error: describe(err) };
    }
  },
};

export const _internal = { isDuplicate, isRetryable, describe };
