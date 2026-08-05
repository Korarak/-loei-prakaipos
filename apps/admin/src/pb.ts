import PocketBase from 'pocketbase';

const baseUrl = import.meta.env.VITE_PB_URL ?? 'http://127.0.0.1:8095';

export const pb = new PocketBase(baseUrl);

// ปิด auto-cancel: SDK ยกเลิกคำขอเดิมเมื่อมีคำขอซ้ำเส้นทาง ซึ่งชนกับ
// React StrictMode ที่ยิง effect ซ้ำสองรอบตอน dev แล้วโผล่ error
// "autocancelled" ให้เห็นทั้งที่ไม่ใช่ปัญหาจริง (แพทเทิร์นเดียวกับ apps/pos)
pb.autoCancellation(false);

/**
 * ล็อกอินด้วยบัญชีแอดมินของ PocketBase เอง
 *
 * ใช้ fetch ตรงไปที่ /api/admins/auth-with-password แทนเมธอดในตัว SDK
 * เพราะ SDK เวอร์ชันที่ใช้ (0.25.x) เปลี่ยนไปเรียก collection "_superusers"
 * ซึ่งเป็นชื่อใหม่ตั้งแต่ PocketBase เซิร์ฟเวอร์ 0.23 ขึ้นไป — แต่เซิร์ฟเวอร์
 * ที่โปรเจกต์นี้ล็อกเวอร์ชันไว้ (backend/docker-compose.yml) คือ 0.22.21
 * ซึ่งยังใช้ชื่อเดิม "admins" อยู่ เรียกตรงกันเส้นทางเก่าจึงชัวร์กว่า
 * พึ่งพา SDK ที่อาจไม่ตรงรุ่นเซิร์ฟเวอร์ — ทดสอบยืนยันแล้วว่าเส้นทางนี้ใช้ได้จริง
 * ส่วนคำขอ collection อื่นๆ หลังจากนี้ยังใช้ SDK ตามปกติ เพราะแนบ token ให้เอง
 * ผ่าน pb.authStore โดยไม่สนใจว่ามาจากคอลเลกชันชื่ออะไร
 */
export async function loginAsAdmin(email: string, password: string): Promise<void> {
  const res = await fetch(`${pb.baseURL}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? 'เข้าระบบไม่สำเร็จ');
  }

  const body = (await res.json()) as { token: string; admin: Record<string, unknown> };
  pb.authStore.save(body.token, body.admin as never);
}

export function logout(): void {
  pb.authStore.clear();
}
