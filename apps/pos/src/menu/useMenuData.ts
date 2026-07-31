import type { Category, MenuItem } from '@prakaipos/shared';
import { useCallback, useEffect, useState } from 'react';
import { pullMenu, readLocalMenu } from '../sync/pullMenu.js';

/**
 * อ่านเมนูจากเครื่อง แล้วดึงของใหม่จากคลาวด์มาทับถ้ามีเน็ต
 *
 * ลำดับสำคัญ: **แสดงของในเครื่องก่อนเสมอ** แล้วค่อยดึงของใหม่มาทับ
 * ถ้ารอเซิร์ฟเวอร์ก่อนแล้วเน็ตช้า หน้าจอจะว่างเปล่าอยู่หลายวินาที
 * ทั้งที่ข้อมูลที่ใช้ได้อยู่ในเครื่องอยู่แล้ว
 */

export interface MenuData {
  categories: Category[];
  items: MenuItem[];
  loading: boolean;
  /** กำลังดึงของใหม่จากคลาวด์อยู่เบื้องหลัง */
  refreshing: boolean;
  /** ดึงจากคลาวด์ไม่สำเร็จ — ข้อมูลที่แสดงอยู่เป็นของเดิมในเครื่อง */
  stale: boolean;
  reload: () => Promise<void>;
}

export function useMenuData(shopId: string): MenuData {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);

  const readFromDevice = useCallback(async () => {
    const menu = await readLocalMenu(shopId);
    setCategories(menu.categories);
    setItems(menu.items);
  }, [shopId]);

  const reload = useCallback(async () => {
    await readFromDevice();

    if (!navigator.onLine) {
      setStale(true);
      return;
    }

    setRefreshing(true);
    try {
      await pullMenu(shopId);
      await readFromDevice();
      setStale(false);
    } catch {
      // เงียบไว้โดยตั้งใจ — ข้อมูลในเครื่องยังใช้ขายได้
      // แค่บอกว่าอาจไม่ใช่ล่าสุด ไม่ต้องขึ้น error ให้ตกใจ
      setStale(true);
    } finally {
      setRefreshing(false);
    }
  }, [shopId, readFromDevice]);

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

  return { categories, items, loading, refreshing, stale, reload };
}
