import { useEffect, useState } from 'react';
import { SyncBadge } from './components/SyncBadge.js';
import { requestPersistentStorage } from './db/db.js';
import { useSync } from './sync/useSync.js';

/**
 * โครงหน้าจอของแอปหน้าขาย
 *
 * ตอนนี้เป็น shell — หน้าขายจริง (เลือกเมนู ตะกร้า คิดเงิน) เป็นงานถัดไป
 * ตามลำดับในเอกสารออกแบบหัวข้อ 06 ซึ่งเป็นงานหนักที่สุด 10 คน-วัน
 */
export function App() {
  const sync = useSync();
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    // ขอปักหมุดข้อมูลตั้งแต่เปิดแอปครั้งแรก ก่อนที่จะมีบิลค้างอยู่ในเครื่อง
    void requestPersistentStorage().then(setPersisted);
  }, []);

  return (
    <div className="app">
      <header className="app__bar">
        <div className="app__brand">PrakaiPOS</div>
        <SyncBadge state={sync} onRetry={() => void sync.syncNow()} />
      </header>

      <main className="app__main">
        <section className="panel">
          <h1>โครงระบบพร้อมแล้ว</h1>
          <p className="muted">
            ชั้นข้อมูลออฟไลน์ คิวส่งข้อมูล และการเชื่อมกับ PocketBase ทำงานได้แล้ว
            งานถัดไปคือหน้าขายจริง
          </p>

          <dl className="facts">
            <dt>สถานะเครือข่าย</dt>
            <dd>{sync.online ? 'ออนไลน์' : 'ออฟไลน์'}</dd>

            <dt>รายการค้างส่ง</dt>
            <dd>{sync.pending}</dd>

            <dt>ปักหมุดข้อมูลในเครื่อง</dt>
            <dd>
              {persisted === null
                ? 'กำลังตรวจสอบ'
                : persisted
                  ? 'สำเร็จ — เบราว์เซอร์จะไม่ล้างข้อมูลเอง'
                  : 'ไม่สำเร็จ — ต้องซิงก์ให้ถี่กว่าปกติ'}
            </dd>
          </dl>

          {persisted === false && (
            <p className="warn">
              เบราว์เซอร์นี้ไม่รับปากว่าจะเก็บข้อมูลไว้ให้ ถ้าเป็น iPad
              ให้ติดตั้งแอปลงหน้าจอโฮมก่อนใช้งานจริง เพื่อลดโอกาสข้อมูลถูกล้าง
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
