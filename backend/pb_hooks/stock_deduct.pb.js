/// <reference path="../pb_data/types.d.ts" />

/**
 * ตัดสต๊อกอัตโนมัติตอนปิดบิล — เอกสารออกแบบหัวข้อ 06 ก้อนที่ 2
 * ("สต๊อกพื้นฐาน" — ค้างไว้เพราะต้องใช้ record hook ที่ยังไม่เคยทดสอบมาก่อน)
 *
 * ทริกเกอร์ที่ถูกต้องคือ `onRecordAfterCreateRequest('orders')` (ไม่ใช่
 * `onModelAfterCreate`) เพราะบิลที่ status เป็น "paid" เกิดจากไคลเอนต์เรียก
 * REST create ปกติผ่าน outbox/sender เท่านั้น (ขายหน้าร้านและ "รับเงินโต๊ะ QR"
 * ที่ประกอบบิลใหม่แล้ววิ่งผ่าน checkout() เดียวกันทั้งคู่) — ออร์เดอร์ช่อง QR
 * ที่สร้างผ่าน dao.saveRecord() ใน qr_order.pb.js (ข้าม request pipeline ไปเลย)
 * จะมี status เป็น pending/open เสมอ ไม่ใช่ paid จึงไม่ถูกจับที่ hook ระดับ
 * request แบบนี้ซ้ำอีกที — ถ้าใช้ onModelAfterCreate จะดักโดนออร์เดอร์ QR
 * ที่ยังไม่ได้ปิดบิลจริงไปด้วย ตัดสต๊อกก่อนเงินเข้าจริง ผิดเวลา
 *
 * สูตรอาหาร (recipe) เก็บเป็น JSON บนตัวเมนู ไม่ใช่ snapshot ในบิล — จึงต้อง
 * โหลดสูตร ณ ปัจจุบันของแต่ละเมนูตอนตัด (เมนูที่ถูกลบไปแล้วข้ามเงียบๆ)
 * ตรงกับหลักการเดียวกับ apps/pos/src/menu/cost.ts ที่ใช้ราคาวัตถุดิบปัจจุบัน
 * เสมอ ไม่ย้อนหลังตามราคา ณ วันขาย — ยอมแลกความง่าย
 *
 * ยอมให้ stock_qty ติดลบได้ ไม่ clamp ที่ 0 — ระบบออฟไลน์หลายเครื่องขายพร้อมกัน
 * ทำให้ยอดคลาดเคลื่อนได้อยู่แล้วโดยธรรมชาติ (ดูคอมเมนต์ apps/pos/src/db/outbox.ts)
 * การ clamp จะซ่อนปัญหาสต๊อกจริงมากกว่าช่วย
 */

onRecordAfterCreateRequest((e) => {
  const record = e.record;
  if (!record || record.getString('status') !== 'paid') return;

  const dao = $app.dao();

  // idempotency — กัน hook ถูกยิงมากกว่าหนึ่งครั้งสำหรับบิลเดียวกัน
  let already;
  try {
    already = dao.findFirstRecordByFilter(
      'stock_movements',
      'order = {:order} && type = "deduct"',
      { order: record.id },
    );
  } catch {
    already = null;
  }
  if (already) return;

  const rawLines = record.get('lines');
  const lines = rawLines ? JSON.parse(String(rawLines)) : [];
  if (!Array.isArray(lines) || lines.length === 0) return;

  // รวมยอดที่ต้องตัดต่อวัตถุดิบก่อน (หลายเมนูในบิลอาจใช้วัตถุดิบร่วมกัน)
  const totalsByIngredient = {};

  for (const line of lines) {
    const menuItemId = line && typeof line.menuItemId === 'string' ? line.menuItemId : '';
    const qty = Number(line && line.qty);
    if (!menuItemId || !Number.isFinite(qty) || qty <= 0) continue;

    let item;
    try {
      item = dao.findRecordById('menu_items', menuItemId);
    } catch {
      continue; // เมนูถูกลบไปแล้ว — ไม่มีสูตรให้ตัด ข้าม
    }

    const rawRecipe = item.get('recipe');
    const recipe = rawRecipe ? JSON.parse(String(rawRecipe)) : [];
    if (!Array.isArray(recipe)) continue;

    for (const rline of recipe) {
      const ingredientId = rline && typeof rline.ingredientId === 'string' ? rline.ingredientId : '';
      const perUnitQty = Number(rline && rline.qty);
      if (!ingredientId || !Number.isFinite(perUnitQty)) continue;
      totalsByIngredient[ingredientId] = (totalsByIngredient[ingredientId] || 0) + perUnitQty * qty;
    }
  }

  const ingredientIds = Object.keys(totalsByIngredient);
  if (ingredientIds.length === 0) return; // ไม่มีเมนูไหนในบิลนี้ทำสูตรอาหารไว้

  const shopId = record.getString('shop');
  const staffId = record.getString('staff');
  const orderNo = record.getInt('order_no');

  dao.runInTransaction((txDao) => {
    const movementsCollection = txDao.findCollectionByNameOrId('stock_movements');

    for (const ingredientId of ingredientIds) {
      let ingredient;
      try {
        ingredient = txDao.findRecordById('ingredients', ingredientId);
      } catch {
        continue; // วัตถุดิบถูกลบไปแล้ว — ข้าม
      }

      const qtyDelta = -totalsByIngredient[ingredientId];
      const nextQty = ingredient.getFloat('stock_qty') + qtyDelta;
      ingredient.set('stock_qty', nextQty);
      txDao.saveRecord(ingredient);

      const movement = new Record(movementsCollection, {
        shop: shopId,
        ingredient: ingredientId,
        type: 'deduct',
        qty_delta: qtyDelta,
        note: `อัตโนมัติ: ปิดบิล #${orderNo}`,
        staff: staffId,
        order: record.id,
      });
      txDao.saveRecord(movement);
    }
  });
}, 'orders');

// ── ยกเลิกบิล (void) — คืนสต๊อกที่ตัดไปแล้วของบิลนั้น ──

onRecordAfterUpdateRequest((e) => {
  const record = e.record;
  if (!record || record.getString('status') !== 'void') return;

  const dao = $app.dao();

  let deducted;
  try {
    deducted = dao.findRecordsByFilter(
      'stock_movements',
      'order = {:order} && type = "deduct"',
      '-created',
      500,
      0,
      { order: record.id },
    );
  } catch {
    deducted = [];
  }
  if (deducted.length === 0) return; // บิลนี้ไม่มีเมนูที่ทำสูตรอาหารไว้ — ไม่มีอะไรต้องคืน

  // idempotency — กันคืนสต๊อกซ้ำถ้า hook นี้ถูกยิงมากกว่าหนึ่งครั้ง
  let alreadyReversed;
  try {
    alreadyReversed = dao.findFirstRecordByFilter(
      'stock_movements',
      'order = {:order} && type = "receive"',
      { order: record.id },
    );
  } catch {
    alreadyReversed = null;
  }
  if (alreadyReversed) return;

  const orderNo = record.getInt('order_no');
  const staffId = record.getString('staff');

  dao.runInTransaction((txDao) => {
    const movementsCollection = txDao.findCollectionByNameOrId('stock_movements');

    for (const movement of deducted) {
      const ingredientId = movement.getString('ingredient');
      const shopId = movement.getString('shop');
      const qtyDelta = -movement.getFloat('qty_delta'); // ของเดิมติดลบ กลับเป็นบวก

      let ingredient;
      try {
        ingredient = txDao.findRecordById('ingredients', ingredientId);
      } catch {
        continue;
      }

      const nextQty = ingredient.getFloat('stock_qty') + qtyDelta;
      ingredient.set('stock_qty', nextQty);
      txDao.saveRecord(ingredient);

      const reverse = new Record(movementsCollection, {
        shop: shopId,
        ingredient: ingredientId,
        type: 'receive',
        qty_delta: qtyDelta,
        note: `คืนสต๊อกอัตโนมัติ: ยกเลิกบิล #${orderNo}`,
        staff: staffId,
        order: record.id,
      });
      txDao.saveRecord(reverse);
    }
  });
}, 'orders');
