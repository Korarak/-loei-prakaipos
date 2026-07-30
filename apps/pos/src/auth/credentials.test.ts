import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db.js';
import {
  forgetAllStaff,
  forgetStaff,
  getCredential,
  knownStaff,
  loginOffline,
  rememberStaff,
  type StaffProfile,
} from './credentials.js';

const NOON = new Date('2026-07-31T05:00:00.000Z');

const nong: StaffProfile = {
  staffId: 's1',
  shopId: 'shop-a',
  username: 'krua-nong-owner',
  displayName: 'เจ้าของร้าน',
  role: 'owner',
};

const dao: StaffProfile = {
  staffId: 's2',
  shopId: 'shop-a',
  username: 'krua-nong-staff',
  displayName: 'พนักงานหน้าร้าน',
  role: 'staff',
};

beforeEach(async () => {
  await db.credentials.clear();
});

describe('rememberStaff', () => {
  it('เก็บพนักงานไว้ให้เข้าระบบตอนออฟไลน์ได้', async () => {
    await rememberStaff(nong, '1379', NOON);

    const cred = await getCredential('s1');
    expect(cred?.displayName).toBe('เจ้าของร้าน');
    expect(cred?.role).toBe('owner');
    expect(cred?.failedAttempts).toBe(0);
  });

  it('ไม่เก็บ PIN ดิบ เก็บแค่แฮชกับเกลือ', async () => {
    await rememberStaff(nong, '1379', NOON);

    const raw = JSON.stringify(await getCredential('s1'));
    expect(raw).not.toContain('1379');
    expect((await getCredential('s1'))?.pin.salt).toBeTruthy();
  });

  it('เรียกซ้ำแล้วทับของเดิม ไม่เกิดเรกคอร์ดซ้ำ', async () => {
    await rememberStaff(nong, '1379', NOON);
    await rememberStaff(nong, '8024', NOON);

    expect(await db.credentials.count()).toBe(1);
    // PIN ใหม่ต้องใช้ได้ ของเก่าต้องใช้ไม่ได้
    expect((await loginOffline('s1', '8024', NOON)).ok).toBe(true);
  });
});

describe('knownStaff', () => {
  it('คืนเฉพาะพนักงานของร้านนั้น', async () => {
    await rememberStaff(nong, '1379', NOON);
    await rememberStaff({ ...dao, shopId: 'shop-b' }, '8024', NOON);

    const list = await knownStaff('shop-a');
    expect(list.map((s) => s.staffId)).toEqual(['s1']);
  });

  it('เรียงคนที่เข้าระบบล่าสุดไว้ก่อน', async () => {
    await rememberStaff(nong, '1379', new Date('2026-07-31T05:00:00.000Z'));
    await rememberStaff(dao, '8024', new Date('2026-07-31T06:00:00.000Z'));

    expect((await knownStaff('shop-a')).map((s) => s.staffId)).toEqual(['s2', 's1']);
  });

  it('ยังไม่มีใครเคยเข้า คืนรายการว่าง', async () => {
    expect(await knownStaff('shop-a')).toEqual([]);
  });
});

describe('loginOffline', () => {
  beforeEach(async () => {
    await rememberStaff(nong, '1379', NOON);
  });

  it('PIN ถูกต้องเข้าได้ และคืนโปรไฟล์', async () => {
    const result = await loginOffline('s1', '1379', NOON);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.displayName).toBe('เจ้าของร้าน');
      expect(result.profile.role).toBe('owner');
    }
  });

  it('พนักงานที่ไม่เคยเข้าบนเครื่องนี้ ต้องบอกให้ชัดว่าต้องมีเน็ตก่อน', async () => {
    const result = await loginOffline('ไม่มีคนนี้', '1379', NOON);
    expect(result).toEqual({ ok: false, reason: 'unknown_staff' });
  });

  it('PIN ผิดไม่ผ่าน และบอกจำนวนครั้งที่เหลือ', async () => {
    const result = await loginOffline('s1', '9999', NOON);

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'wrong_pin') {
      expect(result.attemptsLeft).toBe(3);
    } else {
      throw new Error(`คาดว่าจะได้ wrong_pin แต่ได้ ${JSON.stringify(result)}`);
    }
  });

  it('เข้าสำเร็จแล้วล้างประวัติที่กดผิด', async () => {
    await loginOffline('s1', '9999', NOON);
    await loginOffline('s1', '9999', NOON);
    expect((await getCredential('s1'))?.failedAttempts).toBe(2);

    await loginOffline('s1', '1379', NOON);
    expect((await getCredential('s1'))?.failedAttempts).toBe(0);
  });
});

describe('loginOffline — การจำกัดจำนวนครั้ง', () => {
  beforeEach(async () => {
    await rememberStaff(nong, '1379', NOON);
  });

  it('กดผิดครบโควตาแล้วโดนล็อก', async () => {
    for (let i = 0; i < 4; i++) await loginOffline('s1', '9999', NOON);
    const fifth = await loginOffline('s1', '9999', NOON);

    expect(fifth.ok).toBe(false);
    if (!fifth.ok && fifth.reason === 'locked') {
      expect(fifth.secondsLeft).toBe(15);
    } else {
      throw new Error(`คาดว่าจะโดนล็อก แต่ได้ ${JSON.stringify(fifth)}`);
    }
  });

  it('ตอนล็อกอยู่ PIN ที่ถูกต้องก็เข้าไม่ได้', async () => {
    for (let i = 0; i < 5; i++) await loginOffline('s1', '9999', NOON);

    const result = await loginOffline('s1', '1379', NOON);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('locked');
  });

  it('พ้นเวลาล็อกแล้ว PIN ที่ถูกต้องเข้าได้', async () => {
    for (let i = 0; i < 5; i++) await loginOffline('s1', '9999', NOON);

    const later = new Date(NOON.getTime() + 16_000);
    expect((await loginOffline('s1', '1379', later)).ok).toBe(true);
  });

  it('ตัวนับอยู่ในฐานข้อมูล ปิดเปิดแอปแล้วไม่รีเซ็ต', async () => {
    // นี่คือประเด็นสำคัญ — ถ้าเก็บตัวนับไว้แค่ในหน่วยความจำ
    // คนที่อยากไล่เดา PIN แค่รีโหลดหน้าเว็บก็ได้โควตาใหม่แล้ว
    for (let i = 0; i < 3; i++) await loginOffline('s1', '9999', NOON);

    // จำลองการปิดเปิดแอป: อ่านค่าจากฐานข้อมูลใหม่
    expect((await getCredential('s1'))?.failedAttempts).toBe(3);

    const fourth = await loginOffline('s1', '9999', NOON);
    if (!fourth.ok && fourth.reason === 'wrong_pin') {
      expect(fourth.attemptsLeft).toBe(0);
    } else {
      throw new Error(`คาดว่าจะได้ wrong_pin แต่ได้ ${JSON.stringify(fourth)}`);
    }
  });

  it('การล็อกแยกกันรายคน — คนหนึ่งโดนล็อกไม่กระทบอีกคน', async () => {
    await rememberStaff(dao, '8024', NOON);
    for (let i = 0; i < 5; i++) await loginOffline('s1', '9999', NOON);

    expect((await loginOffline('s2', '8024', NOON)).ok).toBe(true);
  });
});

describe('การลบข้อมูลเข้าระบบ', () => {
  it('forgetStaff ลบเฉพาะคนนั้น', async () => {
    await rememberStaff(nong, '1379', NOON);
    await rememberStaff(dao, '8024', NOON);

    await forgetStaff('s1');
    expect(await getCredential('s1')).toBeUndefined();
    expect(await getCredential('s2')).toBeDefined();
  });

  it('forgetAllStaff ล้างหมด — ใช้ตอนถอดเครื่องออกจากร้าน', async () => {
    await rememberStaff(nong, '1379', NOON);
    await rememberStaff(dao, '8024', NOON);

    await forgetAllStaff();
    expect(await db.credentials.count()).toBe(0);
  });
});
