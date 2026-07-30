import type { StaffRole } from '@prakaipos/shared';
import { getSetting, setSetting } from '../db/db.js';
import { pb } from '../sync/pb.js';
import {
  getCredential,
  loginOffline,
  recordFailedAttempt,
  rememberStaff,
  type StaffProfile,
} from './credentials.js';
import { FREE_ATTEMPTS, isLocked, secondsUntilUnlock } from './lockout.js';

/**
 * การเข้าระบบของพนักงาน
 *
 * มีสองเส้นทาง และเลือกอัตโนมัติตามว่ามีเน็ตหรือไม่:
 *
 * - **มีเน็ต** ถามเซิร์ฟเวอร์ แล้วจำ PIN ไว้ในเครื่องเพื่อใช้ครั้งหน้า
 * - **ไม่มีเน็ต** เทียบ PIN กับที่จำไว้ในเครื่อง
 *
 * พนักงานใหม่จึงต้องเข้าระบบครั้งแรกตอนมีเน็ต ซึ่งอธิบายให้ร้านเข้าใจได้ง่าย
 * และเป็นข้อแลกเปลี่ยนที่ยอมรับได้ เพราะการเพิ่มพนักงานเป็นเรื่องที่ทำนานๆ ครั้ง
 */

const KEY_TOKEN = 'auth.token';
const KEY_PROFILE = 'auth.profile';

export interface Session {
  profile: StaffProfile;
  /** true = ยืนยันกับเซิร์ฟเวอร์ในรอบนี้ · false = ยืนยันจากข้อมูลในเครื่อง */
  verifiedOnline: boolean;
}

export type LoginFailure =
  | { reason: 'wrong_pin'; attemptsLeft: number }
  | { reason: 'locked'; secondsLeft: number }
  | { reason: 'unknown_staff' }
  | { reason: 'network' }
  | { reason: 'server'; message: string };

export type LoginResult =
  | { ok: true; session: Session }
  | ({ ok: false } & LoginFailure);

interface StaffAuthRecord {
  id: string;
  shop: string;
  username: string;
  display_name: string;
  role: StaffRole;
  active: boolean;
}

/**
 * เก็บ token ไว้ใน IndexedDB ไม่ใช่ localStorage
 *
 * เพราะ Safari บน iOS ล้าง localStorage ได้ง่ายกว่า และเราเรียก
 * storage.persist() ปักหมุด IndexedDB ไว้แล้ว — เก็บไว้ที่เดียวกับข้อมูลบิล
 * ทำให้ token กับข้อมูลหายหรืออยู่พร้อมกัน ไม่เกิดสภาพที่ token หาย
 * แต่บิลยังค้างอยู่จนส่งไม่ได้
 */
async function persistToken(): Promise<void> {
  await setSetting(KEY_TOKEN, pb.authStore.isValid ? pb.authStore.token : null);
}

/** เรียกตอนเปิดแอป เพื่อเอา token เดิมกลับมาใช้ */
export async function restoreSession(): Promise<Session | null> {
  const [token, profile] = await Promise.all([
    getSetting<string | null>(KEY_TOKEN, null),
    getSetting<StaffProfile | null>(KEY_PROFILE, null),
  ]);

  if (!profile) return null;

  if (token) {
    // ใส่ token กลับเข้า SDK โดยไม่ต้องมีเรกคอร์ด — เราเก็บโปรไฟล์แยกไว้แล้ว
    pb.authStore.save(token, null);
  }

  // ไม่ตรวจ token กับเซิร์ฟเวอร์ตรงนี้ เพราะแอปต้องเปิดใช้งานได้ทันที
  // แม้ไม่มีเน็ต การต่ออายุ token เป็นหน้าที่ของ refreshSession() ทีหลัง
  return { profile, verifiedOnline: false };
}

/**
 * ต่ออายุ token เมื่อมีเน็ต
 *
 * @returns false ถ้า token หมดอายุจริง — ผู้เรียกควรบังคับล็อกหน้าจอ
 */
export async function refreshSession(): Promise<boolean> {
  if (!pb.authStore.isValid) return false;
  try {
    await pb.collection('staff').authRefresh();
    await persistToken();
    return true;
  } catch (err) {
    const status = (err as { status?: number }).status;
    // 401/403 = token ใช้ไม่ได้จริง · อย่างอื่น (เน็ตหลุด) ยังถือว่าใช้ได้อยู่
    // ถ้าตีความผิดตรงนี้ พนักงานจะถูกเตะออกจากระบบทุกครั้งที่เน็ตกระตุก
    if (status === 401 || status === 403) {
      await logout();
      return false;
    }
    return true;
  }
}

export async function logout(): Promise<void> {
  pb.authStore.clear();
  await setSetting(KEY_TOKEN, null);
  await setSetting(KEY_PROFILE, null);
}

/**
 * เข้าระบบด้วย username + PIN
 *
 * ลองทางเซิร์ฟเวอร์ก่อนเมื่อมีเน็ต ถ้าเน็ตล่มระหว่างนั้นจึงถอยไปใช้
 * ข้อมูลในเครื่อง — ไม่ใช่กลับกัน เพราะเซิร์ฟเวอร์เป็นแหล่งความจริง
 * ของการเปลี่ยน PIN และการปิดบัญชีพนักงานที่ลาออก
 */
export async function login(
  username: string,
  pin: string,
  staffId?: string,
  now: Date = new Date(),
): Promise<LoginResult> {
  // การล็อกต้องมีผลก่อนเสมอ ไม่ว่าจะมีเน็ตหรือไม่ — มิฉะนั้นคนที่อยากไล่เดา PIN
  // แค่ต่อเน็ตไว้ก็เลี่ยงการล็อกได้ทั้งหมด
  if (staffId) {
    const cred = await getLockState(staffId);
    if (cred && isLocked(cred, now)) {
      return { ok: false, reason: 'locked', secondsLeft: secondsUntilUnlock(cred, now) };
    }
  }

  if (navigator.onLine) {
    const online = await loginOnline(username, pin, staffId, now);
    // เน็ตล่มกลางทางเท่านั้นที่ถอยไปใช้ข้อมูลในเครื่อง
    // PIN ผิดหรือบัญชีถูกปิด ต้องไม่ถอย มิฉะนั้นพนักงานที่ลาออกแล้ว
    // จะยังเข้าระบบด้วย PIN เก่าที่จำไว้ในเครื่องได้
    if (online.ok || online.reason !== 'network') return online;
  }

  if (!staffId) return { ok: false, reason: 'unknown_staff' };

  const offline = await loginOffline(staffId, pin, now);
  if (offline.ok) {
    await setSetting(KEY_PROFILE, offline.profile);
    return { ok: true, session: { profile: offline.profile, verifiedOnline: false } };
  }
  // รูปแบบผลลัพธ์ของ loginOffline ตรงกับ LoginResult ฝั่งล้มเหลวอยู่แล้ว
  return offline;
}

async function getLockState(staffId: string) {
  const cred = await getCredential(staffId);
  return cred
    ? { failedAttempts: cred.failedAttempts, lockedUntil: cred.lockedUntil }
    : null;
}

async function loginOnline(
  username: string,
  pin: string,
  staffId: string | undefined,
  now: Date,
): Promise<LoginResult> {
  try {
    const auth = await pb
      .collection('staff')
      .authWithPassword<StaffAuthRecord>(username, pin);

    if (!auth.record.active) {
      await logout();
      return { ok: false, reason: 'server', message: 'บัญชีนี้ถูกปิดใช้งานแล้ว' };
    }

    const profile: StaffProfile = {
      staffId: auth.record.id,
      shopId: auth.record.shop,
      username: auth.record.username,
      displayName: auth.record.display_name,
      role: auth.record.role,
    };

    // จำไว้ให้เข้าระบบตอนออฟไลน์ได้ครั้งหน้า
    await rememberStaff(profile, pin, now);
    await setSetting(KEY_PROFILE, profile);
    await persistToken();

    return { ok: true, session: { profile, verifiedOnline: true } };
  } catch (err) {
    const status = (err as { status?: number }).status;

    if (status === undefined || status === 0) return { ok: false, reason: 'network' };
    if (status >= 500) return { ok: false, reason: 'network' };

    if (status === 400 || status === 401) {
      // เซิร์ฟเวอร์ไม่ได้นับจำนวนครั้งให้ จึงต้องนับที่เครื่องเอง
      // เพื่อให้การล็อกทำงานเหมือนกันทั้งตอนมีเน็ตและไม่มีเน็ต
      const lock = staffId ? await recordFailedAttempt(staffId, now) : null;
      if (lock && isLocked(lock, now)) {
        return { ok: false, reason: 'locked', secondsLeft: secondsUntilUnlock(lock, now) };
      }
      return {
        ok: false,
        reason: 'wrong_pin',
        attemptsLeft: lock ? Math.max(0, FREE_ATTEMPTS - lock.failedAttempts) : FREE_ATTEMPTS,
      };
    }

    return {
      ok: false,
      reason: 'server',
      message: (err as { message?: string }).message ?? 'เซิร์ฟเวอร์ตอบกลับผิดพลาด',
    };
  }
}
