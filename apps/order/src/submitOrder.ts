import { pb } from './pb.js';
import type { CartLine } from './cart.js';

/**
 * ส่งออร์เดอร์จริงไปที่ backend/pb_hooks/qr_order.pb.js
 *
 * ส่งเฉพาะ menuItemId/qty/note/orderedBy — **ไม่ส่งราคาหรือชื่อเมนูไปเลย**
 * เพราะเซิร์ฟเวอร์ไม่เชื่ออยู่แล้ว (ดึงจากฐานข้อมูลจริงเสมอ) ส่งไปก็ไม่มี
 * ประโยชน์ และลดโอกาสที่คนอ่านโค้ดจะเข้าใจผิดว่าราคานี้มีผลจริง
 */

export type SubmitOrderResult =
  | { ok: true; orderNo: number; status: 'open' | 'pending' }
  | { ok: false; error: string };

export async function submitOrder(
  sessionId: string,
  lines: readonly CartLine[],
): Promise<SubmitOrderResult> {
  try {
    const res = await fetch(`${pb.baseURL}/api/public/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        lines: lines.map((l) => ({
          menuItemId: l.menuItemId,
          qty: l.qty,
          note: l.note,
        })),
      }),
    });

    const body = await res.json().catch(() => null);

    if (!res.ok) {
      // ข้อความจากเซิร์ฟเวอร์ (ของหมด, สั่งถี่เกินไป, รอบนั่งปิดแล้ว ฯลฯ)
      // เขียนมาให้ลูกค้าอ่านเข้าใจได้ตรงๆ อยู่แล้ว ส่งต่อได้เลย
      return {
        ok: false,
        error: body?.message ?? 'สั่งอาหารไม่สำเร็จ กรุณาลองใหม่',
      };
    }

    return { ok: true, orderNo: body.orderNo, status: body.status };
  } catch {
    return {
      ok: false,
      error: 'เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
    };
  }
}
