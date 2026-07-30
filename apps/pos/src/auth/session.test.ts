import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db.js';
import { pb } from '../sync/pb.js';
import { getCredential, rememberStaff, type StaffProfile } from './credentials.js';
import { login, logout, refreshSession, restoreSession } from './session.js';

const NOW = new Date('2026-07-31T05:00:00.000Z');

const profile: StaffProfile = {
  staffId: 's1',
  shopId: 'shop-a',
  username: 'krua-nong-owner',
  displayName: 'เจ้าของร้าน',
  role: 'owner',
};

const serverRecord = {
  id: 's1',
  shop: 'shop-a',
  username: 'krua-nong-owner',
  display_name: 'เจ้าของร้าน',
  role: 'owner',
  active: true,
};

/**
 * สร้าง JWT ปลอมที่มี exp ในอนาคต
 *
 * จำเป็นเพราะ pb.authStore.isValid ถอด JWT แล้วดูวันหมดอายุจริง
 * ใส่สตริงมั่วๆ แล้วจะถือว่าหมดอายุทันที
 */
function fakeJwt(secondsFromNow = 3600): string {
  const enc = (o: object) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return [
    enc({ alg: 'HS256', typ: 'JWT' }),
    enc({ id: 's1', exp: Math.floor(Date.now() / 1000) + secondsFromNow }),
    'signature',
  ].join('.');
}

/**
 * จำลอง pb.collection('staff') โดยเลียนพฤติกรรมของ SDK จริง
 * ที่เขียน token ลง authStore ให้เองเมื่อยืนยันตัวตนสำเร็จ
 */
function mockAuth(impl: () => Promise<{ token: string; record: unknown }>) {
  const wrapped = async () => {
    const result = await impl();
    pb.authStore.save(result.token, result.record as never);
    return result;
  };
  return vi.spyOn(pb, 'collection').mockReturnValue({
    authWithPassword: wrapped,
    authRefresh: wrapped,
  } as never);
}

/** จำลองกรณีที่ SDK โยน error — authStore ไม่ถูกแตะ */
function mockAuthError(error: unknown) {
  const thrower = async () => {
    throw error;
  };
  return vi.spyOn(pb, 'collection').mockReturnValue({
    authWithPassword: thrower,
    authRefresh: thrower,
  } as never);
}

function setOnline(online: boolean) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: online },
    configurable: true,
  });
}

beforeEach(async () => {
  await db.credentials.clear();
  await db.settings.clear();
  pb.authStore.clear();
  setOnline(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('login — มีเน็ต', () => {
  it('เข้าสำเร็จและจำ PIN ไว้ให้ใช้ตอนออฟไลน์ครั้งหน้า', async () => {
    mockAuth(async () => ({ token: fakeJwt(), record: serverRecord }));

    const result = await login('krua-nong-owner', '1379', undefined, NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.profile.displayName).toBe('เจ้าของร้าน');
      expect(result.session.verifiedOnline).toBe(true);
    }
    // สิ่งสำคัญ: ต้องจำไว้ในเครื่องแล้ว เพื่อให้ครั้งหน้าเข้าได้ตอนเน็ตหลุด
    expect(await getCredential('s1')).toBeDefined();
  });

  it('บัญชีที่ถูกปิดใช้งานเข้าไม่ได้ แม้ PIN ถูก', async () => {
    mockAuth(async () => ({
      token: fakeJwt(),
      record: { ...serverRecord, active: false },
    }));

    const result = await login('krua-nong-owner', '1379', undefined, NOW);

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'server') {
      expect(result.message).toContain('ปิดใช้งาน');
    }
    // ต้องไม่จำ PIN ของบัญชีที่ถูกปิด
    expect(await getCredential('s1')).toBeUndefined();
  });

  it('PIN ผิด — นับจำนวนครั้งที่เครื่องด้วย ไม่ใช่แค่ให้เซิร์ฟเวอร์ปฏิเสธ', async () => {
    await rememberStaff(profile, '1379', NOW);
    mockAuthError({ status: 400, message: 'Failed to authenticate.' });

    const result = await login('krua-nong-owner', '9999', 's1', NOW);

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'wrong_pin') {
      expect(result.attemptsLeft).toBe(3);
    } else {
      throw new Error(`คาดว่าจะได้ wrong_pin แต่ได้ ${JSON.stringify(result)}`);
    }
    expect((await getCredential('s1'))?.failedAttempts).toBe(1);
  });

  it('การล็อกมีผลแม้มีเน็ต — ต่อเน็ตไว้ไม่ช่วยให้เลี่ยงการล็อกได้', async () => {
    await rememberStaff(profile, '1379', NOW);
    mockAuthError({ status: 400, message: 'Failed to authenticate.' });

    for (let i = 0; i < 5; i++) await login('krua-nong-owner', '9999', 's1', NOW);

    // ครั้งที่ 6 ต้องโดนล็อก แม้จะกรอก PIN ที่ถูกต้อง
    const result = await login('krua-nong-owner', '1379', 's1', NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('locked');
  });
});

describe('login — เน็ตล่มกลางทาง', () => {
  it('ถอยไปใช้ข้อมูลในเครื่องเมื่อเซิร์ฟเวอร์ไม่ตอบ', async () => {
    await rememberStaff(profile, '1379', NOW);
    mockAuthError({ status: 0, message: 'network error' });

    const result = await login('krua-nong-owner', '1379', 's1', NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // ยืนยันจากข้อมูลในเครื่อง ไม่ใช่จากเซิร์ฟเวอร์
      expect(result.session.verifiedOnline).toBe(false);
    }
  });

  it('เซิร์ฟเวอร์ล่ม (5xx) ก็ถอยไปใช้ข้อมูลในเครื่อง', async () => {
    await rememberStaff(profile, '1379', NOW);
    mockAuthError({ status: 503 });

    expect((await login('krua-nong-owner', '1379', 's1', NOW)).ok).toBe(true);
  });

  it('PIN ผิดต้องไม่ถอยไปใช้ข้อมูลในเครื่อง', async () => {
    // จุดสำคัญ: ถ้าถอย พนักงานที่ลาออกแล้วและถูกเปลี่ยน PIN ที่เซิร์ฟเวอร์
    // จะยังเข้าระบบด้วย PIN เก่าที่ค้างอยู่ในเครื่องได้
    await rememberStaff(profile, '1379', NOW);
    mockAuthError({ status: 400 });

    const result = await login('krua-nong-owner', '1379', 's1', NOW);
    expect(result.ok).toBe(false);
  });
});

describe('login — ไม่มีเน็ตตั้งแต่แรก', () => {
  it('ใช้ข้อมูลในเครื่องโดยไม่ยิงเซิร์ฟเวอร์เลย', async () => {
    await rememberStaff(profile, '1379', NOW);
    setOnline(false);
    const spy = mockAuthError(new Error('ไม่ควรถูกเรียก'));

    const result = await login('krua-nong-owner', '1379', 's1', NOW);

    expect(result.ok).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('พนักงานที่ไม่เคยเข้าบนเครื่องนี้ เข้าไม่ได้ตอนไม่มีเน็ต', async () => {
    setOnline(false);

    const result = await login('คนใหม่', '1379', 'ไม่รู้จัก', NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unknown_staff');
  });
});

describe('restoreSession', () => {
  it('ยังไม่เคยเข้าระบบ คืน null', async () => {
    expect(await restoreSession()).toBeNull();
  });

  it('เอาโปรไฟล์กลับมาได้หลังปิดเปิดแอป', async () => {
    mockAuth(async () => ({ token: fakeJwt(), record: serverRecord }));
    await login('krua-nong-owner', '1379', undefined, NOW);

    const restored = await restoreSession();
    expect(restored?.profile.displayName).toBe('เจ้าของร้าน');
    // ยังไม่ได้ยืนยันกับเซิร์ฟเวอร์ในรอบนี้ — แอปต้องเปิดใช้ได้ทันทีแม้ไม่มีเน็ต
    expect(restored?.verifiedOnline).toBe(false);
  });

  it('logout แล้วเปิดแอปใหม่ต้องไม่มี session ค้าง', async () => {
    mockAuth(async () => ({ token: fakeJwt(), record: serverRecord }));
    await login('krua-nong-owner', '1379', undefined, NOW);
    await logout();

    expect(await restoreSession()).toBeNull();
  });
});

describe('refreshSession', () => {
  it('token หมดอายุจริง (401) ให้เตะออกจากระบบ', async () => {
    mockAuth(async () => ({ token: fakeJwt(), record: serverRecord }));
    await login('krua-nong-owner', '1379', undefined, NOW);

    mockAuthError({ status: 401 });
    expect(await refreshSession()).toBe(false);
    expect(await restoreSession()).toBeNull();
  });

  it('เน็ตกระตุกต้องไม่เตะพนักงานออกจากระบบ', async () => {
    // ถ้าตีความผิดตรงนี้ พนักงานจะถูกเตะออกทุกครั้งที่สัญญาณไม่ดี
    // ซึ่งทำให้ร้านเลิกใช้ระบบเรา
    mockAuth(async () => ({ token: fakeJwt(), record: serverRecord }));
    await login('krua-nong-owner', '1379', undefined, NOW);

    mockAuthError({ status: 0 });
    expect(await refreshSession()).toBe(true);
    expect(await restoreSession()).not.toBeNull();
  });

  it('ยังไม่เคยเข้าระบบ คืน false', async () => {
    expect(await refreshSession()).toBe(false);
  });
});
