import { pb } from '../sync/pb.js';

/**
 * การจัดการพนักงาน — เฉพาะเจ้าของร้าน ต้องมีเน็ตเสมอ
 *
 * เหมือน menu/menuActions.ts: นี่เป็นงานที่เจ้าของร้านทำตอนว่าง ไม่ใช่ตอนขาย
 * การบังคับให้มีเน็ตจึงไม่กระทบการขาย และไม่ต้องมีระบบคิว/ออฟไลน์ให้ซับซ้อน
 */

export class NeedsInternetError extends Error {
  constructor(action: string) {
    super(`${action}ต้องต่ออินเทอร์เน็ตก่อน`);
    this.name = 'NeedsInternetError';
  }
}

function requireOnline(action: string): void {
  if (!navigator.onLine) throw new NeedsInternetError(action);
}

export interface CreateStaffInput {
  username: string;
  displayName: string;
  role: 'owner' | 'staff';
  pin: string;
}

export async function createStaff(shopId: string, input: CreateStaffInput): Promise<void> {
  requireOnline('การเพิ่มพนักงาน');
  await pb.collection('staff').create({
    shop: shopId,
    username: input.username,
    password: input.pin,
    passwordConfirm: input.pin,
    display_name: input.displayName,
    role: input.role,
    active: true,
  });
}

export async function updateStaff(
  id: string,
  patch: { displayName?: string; role?: 'owner' | 'staff'; active?: boolean },
): Promise<void> {
  requireOnline('การแก้ไขพนักงาน');
  await pb.collection('staff').update(id, {
    ...(patch.displayName !== undefined && { display_name: patch.displayName }),
    ...(patch.role !== undefined && { role: patch.role }),
    ...(patch.active !== undefined && { active: patch.active }),
  });
}

/**
 * ตั้ง PIN ใหม่ให้พนักงาน — ผ่าน backend/pb_hooks/staff_admin.pb.js
 *
 * ใช้ pb.send() แทน fetch ตรง เพราะ pb.send() แนบ token ของเจ้าของร้าน
 * ที่ล็อกอินอยู่ให้อัตโนมัติ (เส้นทางนี้ต้องล็อกอินเป็นเจ้าของร้านเท่านั้น
 * ต่างจาก apps/order ที่เป็น endpoint สาธารณะไม่ต้องแนบ token)
 */
export async function resetStaffPin(id: string, pin: string): Promise<void> {
  requireOnline('การตั้ง PIN ใหม่');
  await pb.send(`/api/staff/${id}/reset-pin`, {
    method: 'POST',
    body: { pin },
  });
}
