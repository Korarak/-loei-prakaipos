import { useCallback, useEffect, useRef, useState } from 'react';
import { pendingCount } from '../db/outbox.js';
import { flushOutbox, type FlushResult } from '../db/outbox.js';
import { pocketbaseSender } from './sender.js';

/**
 * ซิงก์ทุก 30 วินาทีเมื่อมีเน็ต
 *
 * ตั้งถี่แบบนี้ตั้งใจ — ยิ่งข้อมูลค้างในเครื่องนาน ยิ่งเสี่ยงหายตอนเบราว์เซอร์
 * ล้าง IndexedDB ซึ่งเป็นความเสี่ยงอันดับหนึ่งของโครงการ (เอกสารออกแบบหัวข้อ 12)
 */
const SYNC_INTERVAL_MS = 30_000;

export interface SyncState {
  online: boolean;
  /** จำนวนรายการที่ยังส่งขึ้นคลาวด์ไม่สำเร็จ */
  pending: number;
  syncing: boolean;
  /** เวลาที่ซิงก์สำเร็จครั้งล่าสุด */
  lastSyncAt: Date | null;
  /** ติดอยู่แบบที่ลองใหม่เองไม่หาย — ต้องมีคนเข้ามาแก้ */
  blocked: boolean;
  lastError: string | null;
}

export function useSync(): SyncState & { syncNow: () => Promise<void> } {
  const [state, setState] = useState<SyncState>({
    online: navigator.onLine,
    pending: 0,
    syncing: false,
    lastSyncAt: null,
    blocked: false,
    lastError: null,
  });

  // กันการซิงก์ซ้อนกัน: ถ้ารอบก่อนยังไม่จบ รอบใหม่ต้องไม่เริ่ม
  // มิฉะนั้นสองรอบจะแย่งกันหยิบงานชิ้นเดียวกันจากคิว
  const running = useRef(false);

  const syncNow = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setState((s) => ({ ...s, syncing: true }));

    let result: FlushResult | null = null;
    try {
      result = await flushOutbox(pocketbaseSender);
    } catch (err) {
      // ความผิดพลาดที่หลุดออกมาถึงตรงนี้แปลว่าเป็นบั๊กของเราเอง ไม่ใช่เรื่องเน็ต
      // ต้องไม่ทำให้แอปค้าง — หน้าขายต้องใช้งานต่อได้เสมอ
      console.error('ซิงก์ล้มเหลวแบบไม่คาดคิด', err);
    } finally {
      running.current = false;
    }

    const pending = await pendingCount();
    setState((s) => ({
      ...s,
      syncing: false,
      pending,
      blocked: result?.stoppedBy === 'blocked',
      lastError: result?.lastError ?? null,
      lastSyncAt: result && result.sent > 0 ? new Date() : s.lastSyncAt,
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshCount = async () => {
      const pending = await pendingCount();
      if (!cancelled) setState((s) => ({ ...s, pending }));
    };
    void refreshCount();

    const goOnline = () => {
      setState((s) => ({ ...s, online: true }));
      void syncNow();
    };
    const goOffline = () => setState((s) => ({ ...s, online: false }));

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    const timer = setInterval(() => {
      if (navigator.onLine) void syncNow();
    }, SYNC_INTERVAL_MS);

    // ซิงก์ทันทีที่พนักงานกลับมาที่หน้าจอ — เป็นจังหวะที่มักมีเน็ตกลับมาแล้ว
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void syncNow();
    };
    document.addEventListener('visibilitychange', onVisible);

    if (navigator.onLine) void syncNow();

    return () => {
      cancelled = true;
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [syncNow]);

  return { ...state, syncNow };
}
