import type { ModifierGroup, Satang } from '@prakaipos/shared';
import { useEffect, useState } from 'react';
import { pb } from './pb.js';

/** เมนูที่แสดงบนหน้าลูกค้า — เก็บเฉพาะฟิลด์ที่หน้านี้ใช้จริง */
export interface PublicMenuItem {
  id: string;
  name: string;
  price: Satang;
  imageUrl: string;
  soldOut: boolean;
  modifierGroups: ModifierGroup[];
}

export interface PublicCategory {
  id: string;
  name: string;
  items: PublicMenuItem[];
}

export interface MenuState {
  loading: boolean;
  categories: PublicCategory[];
  error: string | null;
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
  modifier_groups: ModifierGroup[] | null;
  collectionId: string;
}

/**
 * โหลดเมนูของร้าน — รับ shopId ที่ยืนยันแล้วจาก useTableSession เข้ามาตรงๆ
 *
 * ไม่ทำการยืนยันร้านซ้ำเองในนี้ เพราะการยืนยันด้วยลายเซ็น HMAC เกิดขึ้น
 * ที่ useTableSession ไปแล้วครั้งเดียว — ถ้าให้ที่นี่ค้นหาร้านซ้ำโดยไม่ต้อง
 * มีลายเซ็น จะเปิดช่องให้ดูเมนูของร้านไหนก็ได้จากแค่รหัสร้าน ทั้งที่ตั้งใจ
 * ให้ต้องผ่านการสแกน QR ที่มีลายเซ็นถูกต้องก่อนเสมอ
 *
 * เมนูเปิดอ่านสาธารณะที่ระดับ collection โดยตั้งใจ (ไม่ต้องล็อกอิน)
 * แต่การ "รู้ shopId ที่จะขอ" ต้องผ่านขั้นตอนยืนยันลายเซ็นก่อนแล้วเท่านั้น
 */
export function useMenu(shopId: string): MenuState {
  const [state, setState] = useState<MenuState>({
    loading: true,
    categories: [],
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();

    async function load() {
      try {
        const [cats, items] = await Promise.all([
          pb.collection('categories').getFullList<CategoryRecord>({
            filter: `shop="${shopId}" && active=true`,
            sort: 'sort_order',
            signal: abort.signal,
          }),
          pb.collection('menu_items').getFullList<MenuItemRecord>({
            filter: `shop="${shopId}" && active=true`,
            sort: 'sort_order',
            signal: abort.signal,
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
                modifierGroups: i.modifier_groups ?? [],
              })),
          }))
          // หมวดที่ไม่มีเมนูเลยไม่ต้องแสดง ทำให้ลูกค้าเลื่อนหาน้อยลง
          .filter((c) => c.items.length > 0);

        setState({ loading: false, categories, error: null });
      } catch {
        if (cancelled) return;
        setState({
          loading: false,
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
  }, [shopId]);

  return state;
}
