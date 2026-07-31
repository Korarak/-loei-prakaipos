import type { Category, MenuItem } from '@prakaipos/shared';
import { db, getSetting, setSetting } from '../db/db.js';
import { pb } from './pb.js';

/**
 * ดึงเมนูจากคลาวด์ลงมาเก็บในเครื่อง
 *
 * ขอเฉพาะรายการที่ `updated` ใหม่กว่าครั้งก่อน — ประหยัดเน็ตและเร็ว
 * (เอกสารออกแบบหัวข้อ 04) ร้านที่มีเมนู 200 รายการจะโหลดครบครั้งเดียว
 * แล้วครั้งต่อๆ ไปดึงแค่ที่แก้จริง
 *
 * ## เรื่องที่พลาดง่ายและระวังไว้แล้ว
 *
 * **การลบ** REST API ไม่บอกว่ามีอะไรถูกลบไปบ้าง ถ้าดึงแต่ของที่แก้ใหม่
 * เมนูที่เจ้าของลบทิ้งจะค้างอยู่บนแท็บเล็ตตลอดไป จึงต้องกวาดรายการทั้งหมด
 * เป็นครั้งคราวเพื่อลบส่วนเกินออก (ดู reconcileDeletions)
 *
 * **เวลาของเซิร์ฟเวอร์กับของเครื่องไม่ตรงกัน** จึงใช้ค่า `updated` ที่ได้จาก
 * เรกคอร์ดจริงเป็น cursor ไม่ใช่เวลาของเครื่องตัวเอง มิฉะนั้นถ้านาฬิกาแท็บเล็ต
 * เดินเร็วกว่าเซิร์ฟเวอร์ จะข้ามรายการที่แก้ระหว่างนั้นไปเงียบๆ
 */

const KEY_CURSOR = 'sync.menu.cursor';
const KEY_LAST_FULL_SWEEP = 'sync.menu.lastFullSweep';

/** กวาดรายการทั้งหมดเพื่อเก็บกวาดของที่ถูกลบ ทุกๆ ช่วงเวลานี้ */
const FULL_SWEEP_INTERVAL_MS = 6 * 60 * 60_000;

interface CategoryRecord {
  id: string;
  shop: string;
  name: string;
  sort_order: number;
  active: boolean;
  updated: string;
}

interface MenuItemRecord {
  id: string;
  shop: string;
  category: string;
  name: string;
  price: number;
  image: string;
  sold_out: boolean;
  sort_order: number;
  active: boolean;
  updated: string;
  collectionId: string;
}

export interface PullResult {
  categories: number;
  items: number;
  removed: number;
  /** รอบนี้กวาดรายการทั้งหมดหรือดึงเฉพาะที่เปลี่ยน */
  fullSweep: boolean;
}

function toCategory(r: CategoryRecord): Category {
  return {
    id: r.id,
    shopId: r.shop,
    name: r.name,
    sortOrder: r.sort_order,
    active: r.active,
    updatedAt: r.updated,
  };
}

function toMenuItem(r: MenuItemRecord): MenuItem {
  return {
    id: r.id,
    shopId: r.shop,
    categoryId: r.category,
    name: r.name,
    price: r.price,
    // ขอรูปย่อแทนรูปเต็ม — แท็บเล็ตราคาถูกเรนเดอร์รูปใหญ่หลายสิบรูปไม่ไหว
    imageUrl: r.image ? pb.files.getURL(r, r.image, { thumb: '200x200' }) : '',
    soldOut: r.sold_out,
    sortOrder: r.sort_order,
    active: r.active,
    updatedAt: r.updated,
  };
}

/** ค่า updated ที่มากที่สุดในชุดที่ดึงมา ใช้เป็น cursor รอบถัดไป */
function maxUpdated(records: readonly { updated: string }[], current: string): string {
  return records.reduce((max, r) => (r.updated > max ? r.updated : max), current);
}

/**
 * ลบรายการในเครื่องที่ไม่มีอยู่บนเซิร์ฟเวอร์แล้ว
 *
 * เรียกเฉพาะตอนกวาดทั้งหมด เพราะต้องรู้รายการ id ทั้งชุดจึงจะบอกได้ว่า
 * อะไรหายไป
 */
async function reconcileDeletions(
  shopId: string,
  serverCategoryIds: Set<string>,
  serverItemIds: Set<string>,
): Promise<number> {
  const [localCats, localItems] = await Promise.all([
    db.categories.where('shopId').equals(shopId).toArray(),
    db.menuItems.where('shopId').equals(shopId).toArray(),
  ]);

  const staleCats = localCats.filter((c) => !serverCategoryIds.has(c.id)).map((c) => c.id);
  const staleItems = localItems.filter((i) => !serverItemIds.has(i.id)).map((i) => i.id);

  if (staleCats.length) await db.categories.bulkDelete(staleCats);
  if (staleItems.length) await db.menuItems.bulkDelete(staleItems);

  return staleCats.length + staleItems.length;
}

export interface PullMenuOptions {
  now?: Date;
  /** บังคับกวาดทั้งหมด ไม่ต้องรอครบรอบ — ใช้หลังเจ้าของร้านแก้เมนูเสร็จ */
  forceFullSweep?: boolean;
}

/**
 * ดึงเมนูของร้านลงเครื่อง
 *
 * โยน error ถ้าติดต่อเซิร์ฟเวอร์ไม่ได้ — ผู้เรียกตัดสินใจเองว่าจะเงียบไว้
 * (เพราะแอปยังใช้เมนูเดิมในเครื่องได้) หรือจะแจ้งผู้ใช้
 */
export async function pullMenu(
  shopId: string,
  options: PullMenuOptions = {},
): Promise<PullResult> {
  const { now = new Date(), forceFullSweep = false } = options;

  const cursor = await getSetting<string>(KEY_CURSOR, '');
  const lastSweep = await getSetting<string>(KEY_LAST_FULL_SWEEP, '');

  const sweepDue =
    forceFullSweep ||
    cursor === '' ||
    lastSweep === '' ||
    now.getTime() - new Date(lastSweep).getTime() > FULL_SWEEP_INTERVAL_MS;

  // ตอนกวาดทั้งหมดไม่ใส่เงื่อนไขเวลา เพื่อให้ได้รายการ id ครบทั้งชุด
  const changedOnly = cursor && !sweepDue ? ` && updated > "${cursor}"` : '';

  const [cats, items] = await Promise.all([
    pb.collection('categories').getFullList<CategoryRecord>({
      filter: `shop="${shopId}"${changedOnly}`,
      sort: 'sort_order',
    }),
    pb.collection('menu_items').getFullList<MenuItemRecord>({
      filter: `shop="${shopId}"${changedOnly}`,
      sort: 'sort_order',
    }),
  ]);

  if (cats.length) await db.categories.bulkPut(cats.map(toCategory));
  if (items.length) await db.menuItems.bulkPut(items.map(toMenuItem));

  let removed = 0;
  if (sweepDue) {
    removed = await reconcileDeletions(
      shopId,
      new Set(cats.map((c) => c.id)),
      new Set(items.map((i) => i.id)),
    );
    await setSetting(KEY_LAST_FULL_SWEEP, now.toISOString());
  }

  // เลื่อน cursor จากค่าที่เซิร์ฟเวอร์ให้มา ไม่ใช่เวลาของเครื่องเรา
  const next = maxUpdated(items, maxUpdated(cats, cursor));
  if (next !== cursor) await setSetting(KEY_CURSOR, next);

  return { categories: cats.length, items: items.length, removed, fullSweep: sweepDue };
}

/** ล้าง cursor เพื่อให้รอบถัดไปดึงใหม่ทั้งหมด — ใช้ตอนเปลี่ยนร้านหรือแก้ปัญหา */
export async function resetMenuCursor(): Promise<void> {
  await setSetting(KEY_CURSOR, '');
  await setSetting(KEY_LAST_FULL_SWEEP, '');
}

/** อ่านเมนูจากเครื่อง — ใช้ได้ตลอดแม้ไม่มีเน็ต */
export async function readLocalMenu(shopId: string): Promise<{
  categories: Category[];
  items: MenuItem[];
}> {
  const [categories, items] = await Promise.all([
    db.categories.where('shopId').equals(shopId).toArray(),
    db.menuItems.where('shopId').equals(shopId).toArray(),
  ]);

  return {
    categories: categories.sort((a, b) => a.sortOrder - b.sortOrder),
    items: items.sort((a, b) => a.sortOrder - b.sortOrder),
  };
}
