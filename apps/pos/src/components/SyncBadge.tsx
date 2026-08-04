import { Cloud, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react';
import type { SyncState } from '../sync/useSync.js';

/**
 * แถบสถานะการซิงก์
 *
 * เอกสารออกแบบระบุให้ "แสดงจำนวนรายการค้างส่งบนหน้าจอให้เจ้าของร้านเห็น
 * เพื่อให้เขาไว้ใจระบบ" (หัวข้อ 04) — คนที่ไม่เห็นว่าระบบกำลังทำอะไรอยู่
 * จะไม่กล้าใช้ตอนเน็ตไม่ดี แล้วกลับไปจดใส่กระดาษ
 */
export function SyncBadge({ state, onRetry }: { state: SyncState; onRetry: () => void }) {
  if (state.blocked) {
    return (
      <div className="sync sync--blocked" role="alert">
        <TriangleAlert size={15} aria-hidden="true" />
        <span>
          ส่งข้อมูลไม่ได้ {state.pending} รายการ — กรุณาติดต่อผู้ดูแลระบบ
        </span>
        {state.lastError && <code className="sync__detail">{state.lastError}</code>}
      </div>
    );
  }

  if (!state.online) {
    return (
      <div className="sync sync--offline">
        <WifiOff size={15} aria-hidden="true" />
        <span>
          ออฟไลน์ — ขายต่อได้ตามปกติ
          {state.pending > 0 && ` · ค้างส่ง ${state.pending} รายการ`}
        </span>
      </div>
    );
  }

  if (state.pending > 0) {
    return (
      <div className="sync sync--pending">
        <RefreshCw size={15} aria-hidden="true" className={state.syncing ? 'sync__spin' : undefined} />
        <span>กำลังส่งข้อมูล {state.pending} รายการ</span>
        <button type="button" onClick={onRetry} disabled={state.syncing}>
          ส่งเดี๋ยวนี้
        </button>
      </div>
    );
  }

  // คิวว่าง = ไม่มีอะไรต้องส่ง แต่ "ไม่มีอะไรต้องส่ง" ไม่ได้แปลว่า
  // "ติดต่อเซิร์ฟเวอร์ได้" — ตอนคิวว่างเราไม่ได้ยิงหาเซิร์ฟเวอร์เลยจึงไม่รู้
  // จะอ้างว่าข้อมูลตรงกับคลาวด์ได้ก็ต่อเมื่อเคยส่งสำเร็จจริงในรอบนี้
  // การพูดเกินกว่าที่รู้คือสิ่งที่ทำลายความเชื่อถือของเจ้าของร้าน
  return (
    <div className="sync sync--ok">
      <Cloud size={15} aria-hidden="true" />
      <span>
        {state.lastSyncAt
          ? `ข้อมูลตรงกับคลาวด์แล้ว · ล่าสุด ${state.lastSyncAt.toLocaleTimeString(
              'th-TH',
              { hour: '2-digit', minute: '2-digit' },
            )}`
          : 'ไม่มีรายการค้างส่ง'}
      </span>
    </div>
  );
}
