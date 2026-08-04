import type { Ingredient, MenuItem, RecipeLine, Satang } from '@prakaipos/shared';

/**
 * ต้นทุนของเมนู 1 หน่วย จากสูตร (BOM) — ใช้ราคาวัตถุดิบ ณ ปัจจุบันเสมอ
 *
 * ไม่ได้บันทึกต้นทุน ณ เวลาขายไว้ในบิล (ต่างจากราคาขายที่ snapshot ไว้ใน
 * nameSnapshot/unitPrice) เพราะเป็นตัวเลขที่ใช้ดูภาพรวมสำหรับเจ้าของร้าน
 * ไม่ใช่ตัวเลขที่ผูกกับธุรกรรมเงินจริงแบบราคาขาย — ยอมรับว่าต้นทุนย้อนหลัง
 * จะคลาดเคลื่อนถ้าราคาวัตถุดิบเปลี่ยนไปหลังขาย เพื่อแลกกับความง่าย
 * (ไม่ต้องมี ledger ต้นทุนแยกอีกชุด) ตามหลัก "ทำเล็กก่อน" ของทั้งโครงการ
 *
 * วัตถุดิบที่หาไม่เจอ (ถูกลบไปแล้ว) ถือว่าไม่มีต้นทุนส่วนนั้น ไม่ทำให้คำนวณพัง
 *
 * รับ `recipe` ดิบแทนที่จะรับทั้ง MenuItem เพื่อให้เรียกใช้ได้จากที่อื่น
 * ที่ไม่มีอ็อบเจกต์ MenuItem เต็มรูปแบบด้วย เช่น รายงานยอดขายที่ดึงเฉพาะ
 * รายการบิล + สูตรมาคิดต้นทุนย้อนหลัง (ดู dashboard/useDailySummary.ts)
 */
export function recipeCost(recipe: readonly RecipeLine[], ingredients: readonly Ingredient[]): Satang {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  return recipe.reduce((sum, line) => {
    const ingredient = byId.get(line.ingredientId);
    if (!ingredient) return sum;
    return sum + line.qty * ingredient.costPerUnit;
  }, 0);
}

/** กำไรต่อหน่วย = ราคาขาย − ต้นทุน */
export function recipeMargin(item: MenuItem, ingredients: readonly Ingredient[]): Satang {
  return item.price - recipeCost(item.recipe, ingredients);
}

/** % กำไรต่อราคาขาย — ว่างเป็น null ถ้าราคาขายเป็น 0 (หารด้วยศูนย์ไม่มีความหมาย) */
export function marginPercent(item: MenuItem, ingredients: readonly Ingredient[]): number | null {
  if (item.price === 0) return null;
  return (recipeMargin(item, ingredients) / item.price) * 100;
}
