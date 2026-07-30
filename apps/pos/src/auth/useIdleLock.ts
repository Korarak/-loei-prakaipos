import { useEffect, useRef } from 'react';

/**
 * ล็อกหน้าจออัตโนมัติเมื่อไม่มีการใช้งาน
 *
 * ร้านอาหารมีคนเดินผ่านหน้าเคาน์เตอร์ตลอด แท็บเล็ตที่เปิดค้างไว้
 * แล้วไม่มีใครอยู่ = ใครก็กดเปิดบิลหรือดูยอดขายได้
 *
 * ตั้งไว้ 5 นาทีเป็นค่าเริ่มต้น — สั้นกว่านี้พนักงานจะต้องกด PIN บ่อยจนรำคาญ
 * แล้วไปตั้ง PIN เป็น 1111 กันเอง ซึ่งแย่กว่าเดิม
 */
const DEFAULT_IDLE_MS = 5 * 60_000;

/** เหตุการณ์ที่นับว่า "ยังมีคนใช้งานอยู่" */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

export function useIdleLock(
  onIdle: () => void,
  idleMs: number = DEFAULT_IDLE_MS,
  enabled = true,
): void {
  // เก็บ callback ไว้ใน ref เพื่อไม่ต้องตั้ง listener ใหม่ทุกครั้งที่ parent re-render
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout>;

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onIdleRef.current(), idleMs);
    };

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, reset, { passive: true });
    }

    // จอดับหรือสลับไปแอปอื่นแล้วกลับมา ให้เริ่มนับใหม่ ไม่ล็อกทันที
    // เพราะพนักงานอาจแค่สลับไปดู LINE แป๊บเดียวแล้วกลับมาต่อบิลเดิม
    document.addEventListener('visibilitychange', reset);

    reset();

    return () => {
      clearTimeout(timer);
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, reset);
      }
      document.removeEventListener('visibilitychange', reset);
    };
  }, [idleMs, enabled]);
}
