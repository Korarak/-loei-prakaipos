import { useEffect, useRef, useState } from 'react';

export type MountTransitionStage = 'entering' | 'visible' | 'leaving';

/**
 * React ถอด element ออกจาก DOM ทันทีตอน unmount — ไม่มีเวลาให้ CSS transition เล่น
 * hook นี้หน่วงการถอดออกจริงไว้ `duration` ms เพื่อให้ทันเล่น transition ตอนปิด/ซ่อน
 */
export function useMountTransition(
  isOpen: boolean,
  duration: number,
): { shouldRender: boolean; stage: MountTransitionStage } {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [stage, setStage] = useState<MountTransitionStage>(isOpen ? 'visible' : 'leaving');
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timeoutRef.current);
    if (isOpen) {
      setShouldRender(true);
      setStage('entering');
      const raf = requestAnimationFrame(() => setStage('visible'));
      return () => cancelAnimationFrame(raf);
    }
    setStage('leaving');
    timeoutRef.current = setTimeout(() => setShouldRender(false), duration);
    return () => clearTimeout(timeoutRef.current);
  }, [isOpen, duration]);

  return { shouldRender, stage };
}
