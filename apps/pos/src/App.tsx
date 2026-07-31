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
import { MenuScreen } from './screens/MenuScreen.js';
import { SellScreen } from './screens/SellScreen.js';
import { SetupScreen } from './screens/SetupScreen.js';
import { refreshShopSettings, type ShopSettings } from './shop/shopSettings.js';
import { useSync } from './sync/useSync.js';

/** หน้าจอที่เปิดอยู่หลังเข้าระบบแล้ว */
type Screen = 'sell' | 'menu';

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
  const [screen, setScreen] = useState<Screen>('sell');
  const [shop, setShop] = useState<ShopSettings | null>(null);

  useEffect(() => {
    // ดึงค่าตั้งร้าน (โดยเฉพาะเลขพร้อมเพย์) มาแคชไว้ให้หน้ารับเงินใช้ตอนเน็ตหลุด
    void refreshShopSettings(device.shopId).then(setShop);
  }, [device.shopId]);

  if (screen === 'menu') {
    return (
      <MenuScreen
        shopId={device.shopId}
        profile={session.profile}
        onBack={() => setScreen('sell')}
      />
    );
  }

  return (
    <div className="app">
      <header className="app__bar">
        <div className="app__brand">{device.shopName}</div>
        <SyncBadge state={sync} onRetry={() => void sync.syncNow()} />
        <div className="app__spacer" />
        <button type="button" className="app__user" onClick={() => setScreen('menu')}>
          จัดการเมนู
        </button>
        <button type="button" className="app__user" onClick={onLock}>
          {session.profile.displayName} · ล็อก
        </button>
      </header>

      <SellScreen
        device={device}
        profile={session.profile}
        promptpayId={shop?.promptpayId ?? ''}
      />
    </div>
  );
}
