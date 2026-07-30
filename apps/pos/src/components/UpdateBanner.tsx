import { useEffect, useState } from 'react';
import {
  applyPendingUpdate,
  getUpdateState,
  subscribeToUpdates,
  type UpdateState,
} from '../pwa/updates.js';

/**
 * แถบแจ้งเวอร์ชันใหม่
 *
 * ไม่บล็อกหน้าจอ พนักงานขายต่อได้ตามปกติแล้วค่อยกดอัปเดตตอนว่าง
 */
export function UpdateBanner() {
  const [state, setState] = useState<UpdateState>(getUpdateState);
  const [applying, setApplying] = useState(false);

  useEffect(() => subscribeToUpdates(setState), []);

  if (state === 'idle') return null;

  if (state === 'offline_ready') {
    return (
      <div className="updatebar updatebar--ok">พร้อมใช้งานแบบออฟไลน์แล้ว</div>
    );
  }

  return (
    <div className="updatebar">
      <span>มีเวอร์ชันใหม่ — กดอัปเดตตอนที่ไม่มีบิลค้างอยู่</span>
      <button
        type="button"
        disabled={applying}
        onClick={() => {
          setApplying(true);
          void applyPendingUpdate();
        }}
      >
        {applying ? 'กำลังอัปเดต…' : 'อัปเดตตอนนี้'}
      </button>
    </div>
  );
}
