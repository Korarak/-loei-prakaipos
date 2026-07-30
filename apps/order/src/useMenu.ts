import type { Satang } from '@prakaipos/shared';
import { useEffect, useState } from 'react';
import { pb } from './pb.js';

/** เมนูที่แสดงบนหน้าลูกค้า — เก็บเฉพาะฟิลด์ที่หน้านี้ใช้จริง */
export interface PublicMenuItem {
  id: string;
  name: string;
  price: Satang;
  imageUrl: string;
  soldOut: boolean;
}

export interface PublicCategory {
  id: string;
  name: string;
  items: PublicMenuItem[];
}

export interface MenuState {
  loading: boolean;
  shopName: string;
  categories: PublicCategory[];
  error: string | null;
}

/** สิ่งที่เส้นทางสาธารณะ /api/public/shop/:code คืนกลับมา */
interface PublicShop {
  id: string;
  code: string;
  name: string;
  qrOrderMode: string;
  tablesEnabled: boolean;
}

/**
 * แปลงรหัสร้านในลิงก์ QR เป็นข้อมูลร้าน
 *
 * ใช้เส้นทางสาธารณะที่เขียนไว้เอง ไม่ใช่ collection `shops` ตรงๆ
 * เพราะ `shops` ปิดไม่ให้อ่านสาธารณะโดยตั้งใจ — ถ้าเปิด ใครก็ดึงรายชื่อ
 * ร้านลูกค้าทั้งหมดของเราไปได้ (ดู backend/pb_hooks/public_shop.pb.js)
 */
async function fetchShop(shopCode: string, signal: AbortSignal): Promise<PublicShop> {
  const res = await fetch(
    `${pb.baseURL}/api/public/shop/${encodeURIComponent(shopCode)}`,
    { signal },
  );
  if (!res.ok) throw new Error(`ไม่พบร้าน ${shopCode}`);
  return (await res.json()) as PublicShop;
}

interface CategoryRecord {
  id: string;
  name: string;
}

interface MenuItemRecord {
  id: string;
  category: string;
  name: string;
  price: number;
  sold_out: boolean;
  image: string;
  collectionId: string;
}

/**
 * โหลดเมนูของร้านตามรหัสร้านในลิงก์
 *
 * เมนูเปิดอ่านสาธารณะโดยตั้งใจ เพราะหน้านี้ไม่มีการล็อกอิน
 * และเมนูร้านอาหารเป็นข้อมูลที่ติดไว้หน้าร้านอยู่แล้ว ไม่ใช่ความลับ
 */
export function useMenu(shopCode: string): MenuState {
  const [state, setState] = useState<MenuState>({
    loading: true,
    shopName: '',
    categories: [],
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();

    async function load() {
      try {
        const shop = await fetchShop(shopCode, abort.signal);

        const [cats, items] = await Promise.all([
          pb.collection('categories').getFullList<CategoryRecord>({
            filter: `shop="${shop.id}" && active=true`,
            sort: 'sort_order',
          }),
          pb.collection('menu_items').getFullList<MenuItemRecord>({
            filter: `shop="${shop.id}" && active=true`,
            sort: 'sort_order',
          }),
        ]);

        if (cancelled) return;

        const categories: PublicCategory[] = cats
          .map((c) => ({
            id: c.id,
            name: c.name,
            items: items
              .filter((i) => i.category === c.id)
              .map((i) => ({
                id: i.id,
                name: i.name,
                price: i.price,
                // ขอรูปย่อ 600px แทนรูปเต็ม — หน้านี้ต้องเปิดเร็วบนสัญญาณอ่อน
                imageUrl: i.image ? pb.files.getURL(i, i.image, { thumb: '600x0' }) : '',
                soldOut: i.sold_out,
              })),
          }))
          // หมวดที่ไม่มีเมนูเลยไม่ต้องแสดง ทำให้ลูกค้าเลื่อนหาน้อยลง
          .filter((c) => c.items.length > 0);

        setState({ loading: false, shopName: shop.name, categories, error: null });
      } catch {
        if (cancelled) return;
        setState({
          loading: false,
          shopName: '',
          categories: [],
          // ไม่แสดงรายละเอียดทางเทคนิคให้ลูกค้าเห็น เขาทำอะไรกับมันไม่ได้
          // บอกสิ่งที่ทำได้จริงแทน
          error: 'โหลดเมนูไม่สำเร็จ กรุณาลองใหม่ หรือเรียกพนักงานเพื่อขอเมนูกระดาษ',
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [shopCode]);

  return state;
}
