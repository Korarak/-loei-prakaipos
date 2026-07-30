/**
 * จำกัดจำนวนครั้งที่กด PIN ผิด
 *
 * นี่คือสิ่งที่กันการไล่เดา PIN จริงๆ ไม่ใช่ความหนักของการแฮช
 * PIN 4 หลักมี 10,000 แบบ ถ้าปล่อยให้กดได้ไม่จำกัดก็งัดได้ในไม่กี่นาที
 *
 * ## ข้อแลกเปลี่ยนที่ตั้งใจเลือก
 *
 * ล็อกนานเกินไปแย่กว่าปล่อยหลวมนิดหน่อย เพราะพนักงานที่กดผิดตอนลูกค้าต่อคิว
 * แล้วใช้เครื่องไม่ได้ 1 ชั่วโมง จะทำให้ร้านเลิกใช้ระบบเราเลย
 * จึงหยุดเพิ่มเวลาล็อกไว้ที่ 5 นาที และให้ผ่อนผัน 4 ครั้งแรกฟรี
 */

/** กดผิดได้กี่ครั้งก่อนเริ่มล็อก — คนพิมพ์พลาดตอนรีบเป็นเรื่องปกติ */
export const FREE_ATTEMPTS = 4;
/** เวลาล็อกครั้งแรกหลังเกินโควตา */
const FIRST_LOCK_MS = 15_000;
/** เพดานเวลาล็อก — ยาวกว่านี้ร้านจะใช้งานไม่ได้จริง */
const MAX_LOCK_MS = 5 * 60_000;

/**
 * เวลาล็อกหลังกดผิดครั้งที่ n
 *
 * ครั้งที่ 1–4 ไม่ล็อก · ครั้งที่ 5 ล็อก 15 วิ · แล้วเพิ่มเป็นเท่าตัว
 * จนถึงเพดาน 5 นาที
 */
export function lockDurationMs(failedAttempts: number): number {
  if (failedAttempts <= FREE_ATTEMPTS) return 0;
  const step = failedAttempts - FREE_ATTEMPTS - 1;
  return Math.min(FIRST_LOCK_MS * 2 ** step, MAX_LOCK_MS);
}

export interface LockState {
  failedAttempts: number;
  lockedUntil: string | null;
}

/** ตอนนี้ล็อกอยู่หรือไม่ */
export function isLocked(state: LockState, now: Date = new Date()): boolean {
  if (!state.lockedUntil) return false;
  return new Date(state.lockedUntil) > now;
}

/** เหลืออีกกี่วินาทีจึงจะลองใหม่ได้ — เอาไปแสดงบนหน้าจอ */
export function secondsUntilUnlock(state: LockState, now: Date = new Date()): number {
  if (!state.lockedUntil) return 0;
  const ms = new Date(state.lockedUntil).getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 1000);
}

/** สถานะใหม่หลังกดผิดหนึ่งครั้ง */
export function afterFailure(state: LockState, now: Date = new Date()): LockState {
  const failedAttempts = state.failedAttempts + 1;
  const duration = lockDurationMs(failedAttempts);
  return {
    failedAttempts,
    lockedUntil:
      duration === 0 ? null : new Date(now.getTime() + duration).toISOString(),
  };
}

/** สถานะใหม่หลังเข้าสำเร็จ — ล้างประวัติทั้งหมด */
export function afterSuccess(): LockState {
  return { failedAttempts: 0, lockedUntil: null };
}

/** เหลือกดผิดได้อีกกี่ครั้งก่อนโดนล็อก — ใช้เตือนล่วงหน้า */
export function attemptsBeforeLock(state: LockState): number {
  return Math.max(0, FREE_ATTEMPTS - state.failedAttempts);
}
