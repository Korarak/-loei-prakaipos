import { useCallback, useEffect, useState } from 'react';
import { getDevice, type DeviceInfo } from './auth/device.js';
// ล็อกหน้าจอ = ล้าง session ในหน่วยความจำเท่านั้น ไม่ล้าง token
// พนักงานกด PIN แล้วกลับเข้ามาได้ทันทีแม้ไม่มีเน็ต ซึ่งเป็นพฤติกรรมที่ต้องการ
import { refreshSession, restoreSession, type Session } from './auth/session.js';
import { useIdleLock } from './auth/useIdleLock.js';
import { SyncBadge } from './components/SyncBadge.js';
import { UpdateBanner } from './components/UpdateBanner.js';
import { requestPersistentStorage } from './db/db.js';
import { LockScreen } from './screens/LockScreen.js';
import { SetupScreen } from './screens/SetupScreen.js';
import { useSync } from './sync/useSync.js';

/**
 * ลำดับหน้าจอ
 *
 *   ยังไม่ตั้งค่าเครื่อง → SetupScreen  (ครั้งเดียวตอนติดตั้งที่ร้าน)
 *   ยังไม่เข้าระบบ      → LockScreen   (เลือกชื่อ + PIN)
 *   เข้าระบบแล้ว        → หน้าขาย
 */
export function App() {
  const [device, setDevice] = useState<DeviceInfo | null | undefined>(undefined);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function boot() {
      // ขอปักหมุดข้อมูลตั้งแต่เปิดแอปครั้งแรก ก่อนที่จะมีบิลค้างอยู่ในเครื่อง
      void requestPersistentStorage();

      const [d, s] = await Promise.all([getDevice(), restoreSession()]);
      setDevice(d);
      setSession(s);
      setReady(true);

      // ต่ออายุ token ทีหลัง ไม่บล็อกการเปิดแอป — แอปต้องใช้งานได้ทันทีแม้ไม่มีเน็ต
      if (s && navigator.onLine) {
        const stillValid = await refreshSession();
        if (!stillValid) setSession(null);
      }
    }
    void boot();
  }, []);

  const lock = useCallback(() => setSession(null), []);
  useIdleLock(lock, undefined, session !== null);

  if (!ready) {
    return <div className="screen screen--center muted">กำลังเปิดระบบ…</div>;
  }

  return (
    <>
      <UpdateBanner />
      {!device ? (
        <SetupScreen onDone={() => void getDevice().then(setDevice)} />
      ) : !session ? (
        <LockScreen device={device} onUnlock={setSession} />
      ) : (
        <PosShell device={device} session={session} onLock={lock} />
      )}
    </>
  );
}

function PosShell({
  device,
  session,
  onLock,
}: {
  device: DeviceInfo;
  session: Session;
  onLock: () => void;
}) {
  const sync = useSync();

  return (
    <div className="app">
      <header className="app__bar">
        <div className="app__brand">{device.shopName}</div>
        <SyncBadge state={sync} onRetry={() => void sync.syncNow()} />
        <div className="app__spacer" />
        <button type="button" className="app__user" onClick={onLock}>
          {session.profile.displayName} · ล็อก
        </button>
      </header>

      <main className="app__main">
        <section className="panel">
          <h1>เข้าระบบแล้ว</h1>
          <p className="muted">
            งานถัดไปคือหน้าขายจริง — เลือกเมนู ตะกร้า และคิดเงิน
          </p>

          <dl className="facts">
            <dt>ร้าน</dt>
            <dd>
              {device.shopName} ({device.shopCode})
            </dd>

            <dt>เครื่อง</dt>
            <dd>
              {device.deviceName} · เครื่องที่ {device.deviceIndex}
            </dd>

            <dt>ช่วงเลขบิล</dt>
            <dd>
              {device.orderNoRange.start}–{device.orderNoRange.end} · ถัดไป{' '}
              {device.orderNoRange.next}
            </dd>

            <dt>ผู้ใช้งาน</dt>
            <dd>
              {session.profile.displayName}
              {session.profile.role === 'owner' ? ' (เจ้าของร้าน)' : ''}
            </dd>

            <dt>ยืนยันตัวตนรอบนี้</dt>
            <dd>{session.verifiedOnline ? 'กับเซิร์ฟเวอร์' : 'จากข้อมูลในเครื่อง'}</dd>

            <dt>รายการค้างส่ง</dt>
            <dd>{sync.pending}</dd>
          </dl>
        </section>
      </main>
    </div>
  );
}
