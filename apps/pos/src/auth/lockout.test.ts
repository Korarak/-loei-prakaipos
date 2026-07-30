import { describe, expect, it } from 'vitest';
import {
  FREE_ATTEMPTS,
  afterFailure,
  afterSuccess,
  attemptsBeforeLock,
  isLocked,
  lockDurationMs,
  secondsUntilUnlock,
  type LockState,
} from './lockout.js';

const NOW = new Date('2026-07-31T10:00:00.000Z');
const clean: LockState = { failedAttempts: 0, lockedUntil: null };

describe('lockDurationMs', () => {
  it('กดผิดไม่เกินโควตาฟรี ยังไม่ล็อก — คนพิมพ์พลาดตอนรีบเป็นเรื่องปกติ', () => {
    for (let n = 0; n <= FREE_ATTEMPTS; n++) {
      expect(lockDurationMs(n)).toBe(0);
    }
  });

  it('เกินโควตาแล้วเริ่มล็อก และเพิ่มเป็นเท่าตัว', () => {
    expect(lockDurationMs(5)).toBe(15_000);
    expect(lockDurationMs(6)).toBe(30_000);
    expect(lockDurationMs(7)).toBe(60_000);
  });

  it('มีเพดาน 5 นาที — ล็อกนานกว่านี้ร้านจะใช้งานไม่ได้จริง', () => {
    expect(lockDurationMs(20)).toBe(5 * 60_000);
    expect(lockDurationMs(100)).toBe(5 * 60_000);
  });
});

describe('afterFailure', () => {
  it('กดผิดครั้งแรกๆ นับไว้แต่ยังไม่ล็อก', () => {
    const s1 = afterFailure(clean, NOW);
    expect(s1.failedAttempts).toBe(1);
    expect(s1.lockedUntil).toBeNull();
    expect(isLocked(s1, NOW)).toBe(false);
  });

  it('กดผิดครบโควตาแล้วล็อก', () => {
    let state = clean;
    for (let i = 0; i < FREE_ATTEMPTS + 1; i++) state = afterFailure(state, NOW);

    expect(state.failedAttempts).toBe(5);
    expect(isLocked(state, NOW)).toBe(true);
    expect(state.lockedUntil).toBe('2026-07-31T10:00:15.000Z');
  });

  it('ล็อกหมดอายุแล้วลองใหม่ได้', () => {
    let state = clean;
    for (let i = 0; i < 5; i++) state = afterFailure(state, NOW);

    expect(isLocked(state, new Date('2026-07-31T10:00:14.000Z'))).toBe(true);
    expect(isLocked(state, new Date('2026-07-31T10:00:16.000Z'))).toBe(false);
  });

  it('กดผิดซ้ำหลังพ้นล็อก ทำให้ล็อกนานขึ้น', () => {
    let state = clean;
    for (let i = 0; i < 5; i++) state = afterFailure(state, NOW);
    const later = new Date('2026-07-31T10:00:20.000Z');
    state = afterFailure(state, later);

    expect(state.failedAttempts).toBe(6);
    expect(state.lockedUntil).toBe('2026-07-31T10:00:50.000Z'); // 30 วินาที
  });
});

describe('afterSuccess', () => {
  it('เข้าสำเร็จแล้วล้างประวัติทั้งหมด', () => {
    let state = clean;
    for (let i = 0; i < 6; i++) state = afterFailure(state, NOW);

    expect(afterSuccess()).toEqual({ failedAttempts: 0, lockedUntil: null });
  });
});

describe('secondsUntilUnlock', () => {
  it('บอกเวลาที่เหลือเป็นวินาที ปัดขึ้น', () => {
    const state: LockState = {
      failedAttempts: 5,
      lockedUntil: '2026-07-31T10:00:12.500Z',
    };
    expect(secondsUntilUnlock(state, NOW)).toBe(13);
  });

  it('ไม่ได้ล็อกอยู่ คืน 0', () => {
    expect(secondsUntilUnlock(clean, NOW)).toBe(0);
  });

  it('เลยเวลาล็อกแล้ว คืน 0 ไม่ใช่ค่าติดลบ', () => {
    const state: LockState = {
      failedAttempts: 5,
      lockedUntil: '2026-07-31T09:59:00.000Z',
    };
    expect(secondsUntilUnlock(state, NOW)).toBe(0);
  });
});

describe('attemptsBeforeLock', () => {
  it('บอกจำนวนครั้งที่เหลือ เพื่อเตือนก่อนโดนล็อก', () => {
    expect(attemptsBeforeLock(clean)).toBe(4);
    expect(attemptsBeforeLock({ failedAttempts: 3, lockedUntil: null })).toBe(1);
  });

  it('ไม่คืนค่าติดลบเมื่อเลยโควตาไปแล้ว', () => {
    expect(attemptsBeforeLock({ failedAttempts: 9, lockedUntil: null })).toBe(0);
  });
});
