import type { Satang, StockMovementType } from '@prakaipos/shared';
import { pb } from '../sync/pb.js';

/**
 * จัดการวัตถุดิบและสต๊อก — ต้องมีเน็ตเสมอ เหมือนการแก้เมนู (menu/menuActions.ts)
 *
 * ไม่ผ่านคิวออฟไลน์เหมือนบิล เพราะเป็นงานที่เจ้าของร้านทำตอนว่าง ไม่ใช่ตอน
 * ขายจริง และการอัปเดตยอดคงเหลือเป็นสองขั้น (แก้ ingredient แล้วค่อยบันทึก
 * ประวัติ) ถ้าให้ทำงานออฟไลน์ได้ต้องรับมือกับกรณีขั้นแรกสำเร็จแต่ขั้นสองค้าง
 * ในคิว ซึ่งซับซ้อนเกินความจำเป็นสำหรับฟีเจอร์ที่ใช้ตอนไม่รีบ
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

export interface IngredientInput {
  name: string;
  unit: string;
  costPerUnit: Satang;
}

export async function createIngredient(
  shopId: string,
  input: IngredientInput & { stockQty?: number },
): Promise<void> {
  requireOnline('การเพิ่มวัตถุดิบ');
  await pb.collection('ingredients').create({
    shop: shopId,
    name: input.name,
    unit: input.unit,
    cost_per_unit: input.costPerUnit,
    stock_qty: input.stockQty ?? 0,
    active: true,
  });
}

export async function updateIngredient(
  id: string,
  patch: Partial<IngredientInput> & { active?: boolean },
): Promise<void> {
  requireOnline('การแก้ไขวัตถุดิบ');
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.unit !== undefined) payload.unit = patch.unit;
  if (patch.costPerUnit !== undefined) payload.cost_per_unit = patch.costPerUnit;
  if (patch.active !== undefined) payload.active = patch.active;
  await pb.collection('ingredients').update(id, payload);
}

export async function deleteIngredient(id: string): Promise<void> {
  requireOnline('การลบวัตถุดิบ');
  await pb.collection('ingredients').delete(id);
}

/**
 * บันทึกการเปลี่ยนแปลงสต๊อก — รับเข้า/ตัดออก/นับสต๊อก
 *
 * ไม่ใช่ธุรกรรมเดียวระดับฐานข้อมูล (อ่านค่าเดิม → เขียนค่าใหม่ → บันทึกประวัติ
 * เป็นสามคำขอแยกกัน) จึงมีโอกาสเพี้ยนเล็กน้อยถ้าพนักงานสองคนแก้วัตถุดิบ
 * เดียวกันพร้อมกันเป๊ะๆ — ยอมรับความเสี่ยงนี้เพราะจำกัดสิทธิ์ไว้แค่เจ้าของร้าน
 * คนเดียวอยู่แล้ว โอกาสชนกันจึงต่ำมาก
 */
export async function recordStockMovement(
  shopId: string,
  ingredientId: string,
  staffId: string,
  type: StockMovementType,
  qtyDelta: number,
  note = '',
): Promise<number> {
  requireOnline('การปรับสต๊อก');

  const ingredient = await pb.collection('ingredients').getOne<{ stock_qty: number }>(ingredientId);
  const nextQty = (ingredient.stock_qty ?? 0) + qtyDelta;

  await pb.collection('ingredients').update(ingredientId, { stock_qty: nextQty });
  await pb.collection('stock_movements').create({
    shop: shopId,
    ingredient: ingredientId,
    type,
    qty_delta: qtyDelta,
    note,
    staff: staffId,
  });

  return nextQty;
}
