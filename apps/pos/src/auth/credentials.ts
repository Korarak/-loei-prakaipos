import type { StaffRole } from '@prakaipos/shared';
import { db, type StaffCredential } from '../db/db.js';
import {
  FREE_ATTEMPTS,
  afterFailure,
  afterSuccess,
  isLocked,
  type LockState,
} from './lockout.js';
import { hashPin, verifyPin } from './pinHash.js';

/**
 * ข้อมูลพนักงานที่เก็บในเครื่องเพื่อเข้าระบบตอนออฟไลน์
 *
 * บันทึกตอนพนักงานเข้าระบบสำเร็จ "ครั้งแรกตอนมีเน็ต" เท่านั้น
 * เราจึงไม่เคยเดาหรือสร้าง PIN ขึ้นเอง — สิ่งที่เก็บคือหลักฐานว่า
 * เซิร์ฟเวอร์เคยยืนยันแล้วว่า PIN นี้ถูกต้องสำหรับคนคนนี้
 */

export interface StaffProfile {
  staffId: string;
  shopId: string;
  username: string;
  displayName: string;
  role: StaffRole;
}

/** จำ PIN ของพนักงานไว้ในเครื่อง หลังเซิร์ฟเวอร์ยืนยันแล้วว่าถูกต้อง */
export async function rememberStaff(
  profile: StaffProfile,
  pin: string,
  now: Date = new Date(),
): Promise<void> {
  await db.credentials.put({
    ...profile,
    pin: await hashPin(pin),
    ...afterSuccess(),
    lastLoginAt: now.toISOString(),
  });
}

/** พนักงานที่เคยเข้าระบบบนเครื่องนี้ — ใช้แสดงรายชื่อบนหน้าล็อก */
export async function knownStaff(shopId: string): Promise<StaffCredential[]> {
  const rows = await db.credentials.where('shopId').equals(shopId).toArray();
  // เรียงคนที่เข้าล่าสุดไว้ก่อน — คนที่เพิ่งใช้มักเป็นคนที่จะใช้ต่อ
  return rows.sort((a, b) => b.lastLoginAt.localeCompare(a.lastLoginAt));
}

export async function getCredential(staffId: string): Promise<StaffCredential | undefined> {
  return db.credentials.get(staffId);
}

export async function forgetStaff(staffId: string): Promise<void> {
  await db.credentials.delete(staffId);
}

/** ล้างข้อมูลเข้าระบบทั้งหมด — ใช้ตอนถอดเครื่องออกจากร้าน */
export async function forgetAllStaff(): Promise<void> {
  await db.credentials.clear();
}

/**
 * บันทึกว่ากด PIN ผิดหนึ่งครั้ง แล้วคืนสถานะการล็อกที่เป็นผลตามมา
 *
 * ใช้ได้ทั้งตอนออฟไลน์และตอนที่เซิร์ฟเวอร์ปฏิเสธ PIN เพราะเซิร์ฟเวอร์
 * ไม่ได้นับจำนวนครั้งให้ ถ้าไม่นับที่เครื่องด้วย คนที่อยากไล่เดา PIN
 * แค่ต่อเน็ตไว้ก็เลี่ยงการล็อกได้ทั้งหมด
 *
 * @returns null ถ้ายังไม่เคยรู้จักพนักงานคนนี้บนเครื่องนี้
 */
export async function recordFailedAttempt(
  staffId: string,
  now: Date = new Date(),
): Promise<LockState | null> {
  const cred = await db.credentials.get(staffId);
  if (!cred) return null;

  const next = afterFailure(
    { failedAttempts: cred.failedAttempts, lockedUntil: cred.lockedUntil },
    now,
  );
  await db.credentials.update(staffId, next);
  return next;
}

export type OfflineLoginResult =
  | { ok: true; profile: StaffProfile }
  /** ยังไม่เคยเข้าระบบบนเครื่องนี้ — ต้องเข้าครั้งแรกตอนมีเน็ต */
  | { ok: false; reason: 'unknown_staff' }
  | { ok: false; reason: 'wrong_pin'; attemptsLeft: number }
  | { ok: false; reason: 'locked'; secondsLeft: number };

/**
 * ตรวจ PIN จากข้อมูลในเครื่อง ใช้ตอนไม่มีเน็ต
 *
 * บันทึกจำนวนครั้งที่ผิดลงฐานข้อมูลทุกครั้ง ไม่ได้เก็บไว้แค่ในหน่วยความจำ
 * มิฉะนั้นคนที่อยากไล่เดา PIN แค่ปิดเปิดแอปก็รีเซ็ตตัวนับได้แล้ว
 */
export async function loginOffline(
  staffId: string,
  pin: string,
  now: Date = new Date(),
): Promise<OfflineLoginResult> {
  const cred = await db.credentials.get(staffId);
  if (!cred) return { ok: false, reason: 'unknown_staff' };

  const lock: LockState = {
    failedAttempts: cred.failedAttempts,
    lockedUntil: cred.lockedUntil,
  };

  if (isLocked(lock, now)) {
    return {
      ok: false,
      reason: 'locked',
      secondsLeft: Math.ceil(
        (new Date(cred.lockedUntil ?? 0).getTime() - now.getTime()) / 1000,
      ),
    };
  }

  if (await verifyPin(pin, cred.pin)) {
    await db.credentials.update(staffId, {
      ...afterSuccess(),
      lastLoginAt: now.toISOString(),
    });
    return {
      ok: true,
      profile: {
        staffId: cred.staffId,
        shopId: cred.shopId,
        username: cred.username,
        displayName: cred.displayName,
        role: cred.role,
      },
    };
  }

  const next = afterFailure(lock, now);
  await db.credentials.update(staffId, next);

  if (isLocked(next, now)) {
    return {
      ok: false,
      reason: 'locked',
      secondsLeft: Math.ceil(
        (new Date(next.lockedUntil ?? 0).getTime() - now.getTime()) / 1000,
      ),
    };
  }

  return {
    ok: false,
    reason: 'wrong_pin',
    attemptsLeft: Math.max(0, FREE_ATTEMPTS - next.failedAttempts),
  };
}
