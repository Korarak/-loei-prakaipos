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
        <span className="sync__dot" />
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
        <span className="sync__dot" />
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
        <span className="sync__dot" />
        <span>กำลังส่งข้อมูล {state.pending} รายการ</span>
        <button type="button" onClick={onRetry} disabled={state.syncing}>
          ส่งเดี๋ยวนี้
        </button>
      </div>
    );
  }

  return (
    <div className="sync sync--ok">
      <span className="sync__dot" />
      <span>
        ข้อมูลตรงกับคลาวด์แล้ว
        {state.lastSyncAt &&
          ` · ล่าสุด ${state.lastSyncAt.toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
          })}`}
      </span>
    </div>
  );
}
