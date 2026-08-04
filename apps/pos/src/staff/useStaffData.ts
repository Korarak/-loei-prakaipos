import { useCallback, useEffect, useState } from 'react';
import { pb } from '../sync/pb.js';

/**
 * รายชื่อพนักงานของร้าน — ดึงจากเซิร์ฟเวอร์ตรงๆ ทุกครั้ง
 *
 * ต่างจากเมนู (useMenuData.ts) ตรงที่ไม่ต้อง cache ลง Dexie เลย เพราะ:
 * - หน้านี้เข้าได้แค่ตอนมีเน็ตอยู่แล้ว (เหมือนการแก้เมนู)
 * - รายชื่อพนักงานเล็กมาก (ไม่กี่คนต่อร้าน) โหลดใหม่ทุกครั้งไม่มีต้นทุนที่มีนัยสำคัญ
 * - ไม่มีใครต้องดูรายชื่อพนักงานตอนออฟไลน์ ต่างจากเมนูที่พนักงานต้องขายได้
 *   แม้เน็ตหลุด
 */

export interface StaffRecord {
  id: string;
  username: string;
  displayName: string;
  role: 'owner' | 'staff';
  active: boolean;
  createdAt: string;
}

interface RawStaffRecord {
  id: string;
  username: string;
  display_name: string;
  role: 'owner' | 'staff';
  active: boolean;
  created: string;
}

function toStaffRecord(r: RawStaffRecord): StaffRecord {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
    active: r.active,
    createdAt: r.created,
  };
}

export interface StaffData {
  staff: StaffRecord[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useStaffData(shopId: string): StaffData {
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const records = await pb.collection('staff').getFullList<RawStaffRecord>({
        filter: `shop="${shopId}"`,
        sort: '-created',
      });
      setStaff(records.map(toStaffRecord));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดรายชื่อพนักงานไม่สำเร็จ');
    }
  }, [shopId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await reload();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  return { staff, loading, error, reload };
}
