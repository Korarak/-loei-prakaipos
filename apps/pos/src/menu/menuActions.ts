import type { ModifierGroup, RecipeLine, Satang } from '@prakaipos/shared';
import { db } from '../db/db.js';
import { enqueue } from '../db/outbox.js';
import { pb } from '../sync/pb.js';
import { pullMenu } from '../sync/pullMenu.js';

/**
 * การแก้เมนู
 *
 * ## แบ่งเป็นสองกลุ่มโดยตั้งใจ
 *
 * **ต้องมีเน็ต** — เพิ่ม/แก้/ลบเมนูและหมวด อัปโหลดรูป
 * เป็นงานที่เจ้าของร้านทำตอนว่าง ไม่ใช่ตอนลูกค้าต่อคิว การบังคับให้มีเน็ต
 * จึงไม่กระทบการขาย และแลกมาด้วยการที่เราไม่ต้องทำระบบรวมความขัดแย้ง
 * เวลาสองเครื่องแก้เมนูตัวเดียวกันพร้อมกันตอนออฟไลน์ ซึ่งซับซ้อนมาก
 * เทียบกับประโยชน์ที่แทบไม่มี
 *
 * **ต้องใช้ได้ตอนออฟไลน์** — ปุ่ม "ของหมด"
 * อันนี้พนักงานกดกลางวันขายดี ตอนที่เน็ตร้านอาจไม่ดี ถ้ากดไม่ได้
 * ลูกค้าจะสั่งของที่ไม่มีผ่าน QR แล้วร้านต้องไปขอโทษทีหลัง
 * จึงเขียนลงเครื่องทันทีแล้วส่งผ่านคิวเหมือนบิล
 */

export class NeedsInternetError extends Error {
  constructor(action: string) {
    super(`${action}ต้องต่ออินเทอร์เน็ตก่อน`);
    this.name = 'NeedsInternetError';
  }
}

function requireOnline(action: string): void {
  if (!navigator.onLine) throw new NeedsInternetError(action);
}

// ── หมวด ────────────────────────────────────────────────────

export async function createCategory(
  shopId: string,
  name: string,
  sortOrder: number,
): Promise<void> {
  requireOnline('การเพิ่มหมวด');
  await pb.collection('categories').create({
    shop: shopId,
    name,
    sort_order: sortOrder,
    active: true,
  });
  await pullMenu(shopId, { forceFullSweep: true });
}

export async function updateCategory(
  shopId: string,
  id: string,
  patch: { name?: string; sortOrder?: number; active?: boolean },
): Promise<void> {
  requireOnline('การแก้ไขหมวด');
  await pb.collection('categories').update(id, {
    ...(patch.name !== undefined && { name: patch.name }),
    ...(patch.sortOrder !== undefined && { sort_order: patch.sortOrder }),
    ...(patch.active !== undefined && { active: patch.active }),
  });
  await pullMenu(shopId, { forceFullSweep: true });
}

/**
 * ลบหมวด
 *
 * ปฏิเสธถ้ายังมีเมนูอยู่ข้างใน — ฝั่งเซิร์ฟเวอร์ตั้ง cascadeDelete: false ไว้
 * จึงจะลบไม่ผ่านอยู่แล้ว แต่การบอกเหตุผลตรงนี้ทำให้เจ้าของร้านเข้าใจว่า
 * ต้องทำอะไรต่อ แทนที่จะเห็นข้อความ error ดิบจากเซิร์ฟเวอร์
 */
export async function deleteCategory(shopId: string, id: string): Promise<void> {
  requireOnline('การลบหมวด');

  const remaining = await db.menuItems.where('categoryId').equals(id).count();
  if (remaining > 0) {
    throw new Error(
      `หมวดนี้ยังมีเมนูอยู่ ${remaining} รายการ กรุณาย้ายหรือลบเมนูออกก่อน`,
    );
  }

  await pb.collection('categories').delete(id);
  await pullMenu(shopId, { forceFullSweep: true });
}

// ── เมนู ────────────────────────────────────────────────────

export interface MenuItemInput {
  categoryId: string;
  name: string;
  price: Satang;
  sortOrder: number;
  /** รูปที่เลือกจากเครื่อง — ไม่ใส่ก็ได้ */
  image?: File | null;
  modifierGroups?: ModifierGroup[];
  recipe?: RecipeLine[];
}

/**
 * สร้าง FormData เมื่อมีไฟล์แนบ มิฉะนั้นส่ง JSON ธรรมดา
 *
 * PocketBase รับได้ทั้งสองแบบ แต่ FormData จำเป็นเมื่อมีไฟล์
 * และ JSON อ่านง่ายกว่าตอน debug จึงใช้เท่าที่จำเป็น
 *
 * ฟิลด์ JSON (เช่น modifier_groups) ต้อง stringify เองก่อนใส่ลง FormData
 * เพราะช่องของฟอร์มเป็นข้อความล้วน — ต่างจากส่ง object ตรงๆ ที่ SDK แปลงให้เอง
 */
function buildPayload(
  base: Record<string, string | number | boolean>,
  image?: File | null,
  jsonFields?: Record<string, unknown>,
): FormData | Record<string, unknown> {
  if (!image) return { ...base, ...jsonFields };

  const form = new FormData();
  for (const [k, v] of Object.entries(base)) form.append(k, String(v));
  for (const [k, v] of Object.entries(jsonFields ?? {})) form.append(k, JSON.stringify(v));
  form.append('image', image);
  return form;
}

export async function createMenuItem(
  shopId: string,
  input: MenuItemInput,
): Promise<void> {
  requireOnline('การเพิ่มเมนู');
  await pb.collection('menu_items').create(
    buildPayload(
      {
        shop: shopId,
        category: input.categoryId,
        name: input.name,
        price: input.price,
        sort_order: input.sortOrder,
        sold_out: false,
        active: true,
      },
      input.image,
      { modifier_groups: input.modifierGroups ?? [], recipe: input.recipe ?? [] },
    ),
  );
  await pullMenu(shopId, { forceFullSweep: true });
}

export async function updateMenuItem(
  shopId: string,
  id: string,
  patch: Partial<MenuItemInput> & { active?: boolean },
): Promise<void> {
  requireOnline('การแก้ไขเมนู');

  const base: Record<string, string | number | boolean> = {};
  if (patch.categoryId !== undefined) base.category = patch.categoryId;
  if (patch.name !== undefined) base.name = patch.name;
  if (patch.price !== undefined) base.price = patch.price;
  if (patch.sortOrder !== undefined) base.sort_order = patch.sortOrder;
  if (patch.active !== undefined) base.active = patch.active;

  const jsonFields: Record<string, unknown> = {};
  if (patch.modifierGroups !== undefined) jsonFields.modifier_groups = patch.modifierGroups;
  if (patch.recipe !== undefined) jsonFields.recipe = patch.recipe;

  await pb
    .collection('menu_items')
    .update(id, buildPayload(base, patch.image, Object.keys(jsonFields).length ? jsonFields : undefined));
  await pullMenu(shopId, { forceFullSweep: true });
}

export async function deleteMenuItem(shopId: string, id: string): Promise<void> {
  requireOnline('การลบเมนู');
  await pb.collection('menu_items').delete(id);
  await pullMenu(shopId, { forceFullSweep: true });
}

/**
 * เปิด/ปิด "ของหมด" — ตัวเดียวที่ต้องใช้ได้ตอนออฟไลน์
 *
 * เขียนลงเครื่องก่อนเสมอ หน้าจอจึงเปลี่ยนทันทีไม่ว่าเน็ตจะเป็นอย่างไร
 * แล้วส่งผ่านคิวเหมือนบิล
 */
export async function setSoldOut(itemId: string, soldOut: boolean): Promise<void> {
  const updated = await db.menuItems.update(itemId, {
    soldOut,
    updatedAt: new Date().toISOString(),
  });
  if (updated === 0) throw new Error('ไม่พบเมนูนี้ในเครื่อง');

  // อ้างด้วย id ของเซิร์ฟเวอร์ เพราะเมนูสร้างจากหลังบ้าน ไม่ใช่จากแท็บเล็ต
  // และตาราง menu_items ไม่มีคอลัมน์ client_uuid ให้ค้นด้วยซ้ำ
  await enqueue({
    collection: 'menu_items',
    op: 'update',
    clientUuid: itemId,
    serverId: itemId,
    payload: { sold_out: soldOut },
  });
}
