import type { Ingredient } from '@prakaipos/shared';
import { useCallback, useEffect, useState } from 'react';
import { pb } from '../sync/pb.js';

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

export interface IngredientsState {
  ingredients: Ingredient[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** ดึงรายชื่อวัตถุดิบของร้าน — ต้องมีเน็ตเสมอ (ดูเหตุผลใน stockActions.ts) */
export function useIngredients(shopId: string): IngredientsState {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    if (!navigator.onLine) {
      setError('ต้องต่ออินเทอร์เน็ตเพื่อดูวัตถุดิบ');
      return;
    }
    try {
      const records = await pb.collection('ingredients').getFullList<IngredientRecord>({
        filter: `shop="${shopId}"`,
        sort: 'name',
      });
      setIngredients(records.map(toIngredient));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ดึงรายชื่อวัตถุดิบไม่สำเร็จ');
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

  return { ingredients, loading, error, reload };
}
