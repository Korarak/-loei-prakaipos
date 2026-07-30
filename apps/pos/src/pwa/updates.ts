import { registerSW } from 'virtual:pwa-register';

/**
 * การอัปเดตแอป
 *
 * **ห้ามใช้ confirm() หรือ alert() เด็ดขาด** — กล่องโต้ตอบของเบราว์เซอร์
 * บล็อกทั้งหน้าจนกดไม่ได้อะไรเลย ถ้าโผล่มาตอนพนักงานกำลังเปิดบิลอยู่
 * เขาจะกดอะไรก็ไม่ได้จนกว่าจะตอบกล่องนั้น และบนแท็บเล็ตบางรุ่น
 * กล่องนี้อาจโผล่นอกจอที่มองเห็น
 *
 * **และห้ามรีโหลดเองอัตโนมัติ** เพราะถ้ารีโหลดกลางบิล รายการในตะกร้าหาย
 * ซึ่งทำลายความเชื่อถือเร็วกว่าการได้เวอร์ชันใหม่ช้าไปหนึ่งวัน
 *
 * วิธีที่ใช้: ขึ้นแถบเล็กๆ ให้เจ้าของร้านกดอัปเดตเองเมื่อว่าง
 */

export type UpdateState = 'idle' | 'available' | 'offline_ready';

type Listener = (state: UpdateState) => void;

let state: UpdateState = 'idle';
const listeners = new Set<Listener>();
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;

function setState(next: UpdateState) {
  state = next;
  for (const fn of listeners) fn(state);
}

export function getUpdateState(): UpdateState {
  return state;
}

export function subscribeToUpdates(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** ติดตั้งเวอร์ชันใหม่แล้วรีโหลด — เรียกเมื่อผู้ใช้กดยืนยันเท่านั้น */
export async function applyPendingUpdate(): Promise<void> {
  await applyUpdate?.(true);
}

export function initServiceWorker(): void {
  applyUpdate = registerSW({
    onNeedRefresh() {
      setState('available');
    },
    onOfflineReady() {
      setState('offline_ready');
      // แจ้งครั้งเดียวพอ แล้วหายไปเอง ไม่ต้องให้ผู้ใช้กดปิด
      setTimeout(() => {
        if (state === 'offline_ready') setState('idle');
      }, 6000);
    },
  });
}
