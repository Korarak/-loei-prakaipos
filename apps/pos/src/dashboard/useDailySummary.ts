import type { Ingredient, RecipeLine, Satang } from '@prakaipos/shared';
import { useCallback, useEffect, useState } from 'react';
import { recipeCost } from '../menu/cost.js';
import { pb } from '../sync/pb.js';

/**
 * สรุปยอดขายวันนี้ — ดึงจากเซิร์ฟเวอร์ตรงๆ เสมอ ไม่ใช้ข้อมูลในเครื่อง (Dexie)
 *
 * `db.orders` ในเครื่องมีแค่บิลที่ "เครื่องนี้" สร้างเอง (ดู sell/checkout.ts)
 * ร้านที่มี 2 เครื่องขึ้นไปจะเห็นยอดผิด (น้อยกว่าจริง) ถ้าอ่านจากเครื่องเดียว
 * จึงต้องดึงจาก PocketBase ตรง — ครอบคลุมทั้งบิลหน้าขายและบิลที่แปลงจาก QR Order
 *
 * ต้องมีเน็ตเสมอ — ถ้าไม่มี ต้องบอกตรงๆ ว่าดูไม่ได้ ห้ามโชว์เลข 0 เฉยๆ
 * เพราะเข้าใจผิดว่าวันนี้ไม่มีบิลได้ (หลัก "ไม่พูดเกินกว่าที่รู้" ของทั้งโปรเจกต์)
 *
 * ต้นทุน/กำไรเป็น "ค่าประมาณ" เสมอ — คิดจากสูตรและราคาวัตถุดิบ ณ ตอนนี้
 * ไม่ใช่ราคาวัตถุดิบตอนขายจริง (ดูเหตุผลใน menu/cost.ts) และเมนูที่ยังไม่ได้
 * ตั้งสูตรจะนับต้นทุนเป็น 0 — ตัวเลขจึงอาจต่ำกว่าความจริงถ้าตั้งสูตรไม่ครบ
 */

export interface TopItem {
  name: string;
  qty: number;
  revenue: Satang;
  cost: Satang;
  profit: Satang;
}

export interface DailySummary {
  totalRevenue: Satang;
  billCount: number;
  averagePerBill: Satang;
  totalCost: Satang;
  totalProfit: Satang;
  topItems: TopItem[];
}

export interface DailySummaryState {
  summary: DailySummary | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

interface OrderLineRecord {
  menuItemId: string;
  nameSnapshot: string;
  qty: number;
  unitPrice: number;
}

interface OrderRecord {
  id: string;
  total: number;
  lines: OrderLineRecord[];
}

interface MenuItemCostRecord {
  id: string;
  recipe: RecipeLine[] | null;
}

interface IngredientRecord {
  id: string;
  shop: string;
  name: string;
  unit: string;
  stock_qty: number;
  cost_per_unit: number;
  active: boolean;
  updated: string;
}

function toIngredient(r: IngredientRecord): Ingredient {
  return {
    id: r.id,
    shopId: r.shop,
    name: r.name,
    unit: r.unit,
    stockQty: r.stock_qty ?? 0,
    costPerUnit: r.cost_per_unit,
    active: r.active,
    updatedAt: r.updated,
  };
}

/**
 * จุดเริ่มวันนี้ ในรูปแบบที่ PocketBase dbx เทียบ `created` ได้ถูกต้อง
 *
 * ต้องเว้นวรรคคั่นวันกับเวลา ไม่ใช่ ISO 8601 ที่มี "T" คั่น — ใช้ "T" แล้ว filter
 * จะคืน 0 แถวเงียบๆ โดยไม่มี error (บั๊กเดิมที่เจอและบันทึกไว้แล้วใน
 * backend/pb_hooks/qr_order.pb.js ตอนทำตัวจำกัดอัตราการสั่งของ QR Order)
 */
function todayStartFilterValue(now: Date): string {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start.toISOString().replace('T', ' ');
}

export function useDailySummary(shopId: string): DailySummaryState {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);

    if (!navigator.onLine) {
      setSummary(null);
      setError('ต้องต่ออินเทอร์เน็ตเพื่อดูสรุปยอดขาย');
      return;
    }

    try {
      const since = todayStartFilterValue(new Date());
      const [orders, menuItems, ingredientRecords] = await Promise.all([
        pb.collection('orders').getFullList<OrderRecord>({
          filter: `shop="${shopId}" && status="paid" && created >= "${since}"`,
          sort: '-created',
        }),
        pb.collection('menu_items').getFullList<MenuItemCostRecord>({
          filter: `shop="${shopId}"`,
        }),
        pb.collection('ingredients').getFullList<IngredientRecord>({
          filter: `shop="${shopId}"`,
        }),
      ]);

      const recipeByMenuItemId = new Map(menuItems.map((m) => [m.id, m.recipe ?? []]));
      const ingredients = ingredientRecords.map(toIngredient);
      const unitCost = (l: OrderLineRecord): Satang =>
        recipeCost(recipeByMenuItemId.get(l.menuItemId) ?? [], ingredients);

      const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
      const billCount = orders.length;
      const averagePerBill = billCount > 0 ? Math.round(totalRevenue / billCount) : 0;

      const itemTotals = new Map<string, TopItem>();
      for (const o of orders) {
        for (const l of o.lines) {
          // จัดกลุ่มด้วยชื่อเมนู ไม่ใช่ menuItemId — บิลเก่าบางใบ (เช่น ข้อมูลตัวอย่างจาก
          // backend/seed.mjs) ไม่มี menuItemId เก็บไว้ ถ้าจัดกลุ่มด้วย id เมนูเดียวกัน
          // จะโผล่เป็นสองแถวแยกกันทั้งที่เป็นเมนูเดียวกันตามที่เจ้าของร้านเห็น
          // ต้นทุนยังคำนวณจาก menuItemId ของแต่ละบรรทัดเองอยู่ดี (บรรทัดที่ไม่มี id
          // จะนับต้นทุนเป็น 0 ซึ่งถูกต้องแล้วเพราะหาสูตรไม่ได้จริงๆ)
          const key = l.nameSnapshot;
          const lineCost = l.qty * unitCost(l);
          const existing = itemTotals.get(key);
          if (existing) {
            existing.qty += l.qty;
            existing.revenue += l.qty * l.unitPrice;
            existing.cost += lineCost;
            existing.profit += l.qty * l.unitPrice - lineCost;
          } else {
            itemTotals.set(key, {
              name: l.nameSnapshot,
              qty: l.qty,
              revenue: l.qty * l.unitPrice,
              cost: lineCost,
              profit: l.qty * l.unitPrice - lineCost,
            });
          }
        }
      }
      const topItems = [...itemTotals.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
      const totalCost = [...itemTotals.values()].reduce((sum, i) => sum + i.cost, 0);
      const totalProfit = totalRevenue - totalCost;

      setSummary({ totalRevenue, billCount, averagePerBill, totalCost, totalProfit, topItems });
    } catch (err) {
      setSummary(null);
      setError(err instanceof Error ? err.message : 'ดึงยอดขายไม่สำเร็จ');
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

  return { summary, loading, error, reload };
}
