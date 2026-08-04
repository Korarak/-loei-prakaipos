import type { Ingredient, MenuItem } from '@prakaipos/shared';
import { describe, expect, it } from 'vitest';
import { marginPercent, recipeCost, recipeMargin } from './cost.js';

function ingredient(id: string, costPerUnit: number): Ingredient {
  return {
    id,
    shopId: 'shop-a',
    name: id,
    unit: 'กรัม',
    stockQty: 1000,
    costPerUnit,
    active: true,
    updatedAt: '2026-07-31 09:00:00.000Z',
  };
}

function menuItem(price: number, recipe: MenuItem['recipe']): MenuItem {
  return {
    id: 'm1',
    shopId: 'shop-a',
    categoryId: 'c1',
    name: 'ข้าวผัดกุ้ง',
    price,
    imageUrl: '',
    soldOut: false,
    sortOrder: 0,
    active: true,
    modifierGroups: [],
    recipe,
    updatedAt: '2026-07-31 09:00:00.000Z',
  };
}

describe('recipeCost', () => {
  it('รวมต้นทุนจากทุกวัตถุดิบในสูตร', () => {
    const ingredients = [ingredient('rice', 5), ingredient('shrimp', 20)];
    const item = menuItem(12000, [
      { ingredientId: 'rice', qty: 100 },
      { ingredientId: 'shrimp', qty: 50 },
    ]);
    // 100*5 + 50*20 = 500 + 1000 = 1500
    expect(recipeCost(item.recipe, ingredients)).toBe(1500);
  });

  it('ไม่มีสูตรเลยต้นทุนเป็น 0', () => {
    expect(recipeCost(menuItem(12000, []).recipe, [])).toBe(0);
  });

  it('วัตถุดิบที่หาไม่เจอ (ถูกลบไปแล้ว) ไม่ทำให้คำนวณพัง — ถือว่าไม่มีต้นทุนส่วนนั้น', () => {
    const item = menuItem(12000, [{ ingredientId: 'deleted', qty: 10 }]);
    expect(recipeCost(item.recipe, [])).toBe(0);
  });
});

describe('recipeMargin / marginPercent', () => {
  it('กำไร = ราคาขาย - ต้นทุน', () => {
    const ingredients = [ingredient('rice', 5)];
    const item = menuItem(12000, [{ ingredientId: 'rice', qty: 100 }]);
    expect(recipeMargin(item, ingredients)).toBe(11500);
  });

  it('คิดเปอร์เซ็นต์กำไรต่อราคาขายถูกต้อง', () => {
    const ingredients = [ingredient('rice', 30)];
    const item = menuItem(10000, [{ ingredientId: 'rice', qty: 100 }]);
    // ต้นทุน 3000, กำไร 7000, 7000/10000*100 = 70%
    expect(marginPercent(item, ingredients)).toBe(70);
  });

  it('ราคาขายเป็น 0 คืน null แทนที่จะหารด้วยศูนย์', () => {
    expect(marginPercent(menuItem(0, []), [])).toBeNull();
  });
});
