/**
 * ตรวจว่าตัดสต๊อกอัตโนมัติตอนปิดบิลทำงานถูกต้อง (backend/pb_hooks/stock_deduct.pb.js)
 *
 *   node backend/seed.mjs && node backend/verify-stock-deduct.mjs
 *
 * เหตุผลเดียวกับ verify-isolation.mjs — hook เขียนแล้วพังเงียบได้ ถ้าตัดสต๊อก
 * ผิดจำนวนหรือไม่คืนสต๊อกตอนยกเลิกบิล ยอดวัตถุดิบในระบบจะค่อยๆ เพี้ยนไปเรื่อยๆ
 * โดยไม่มี error ให้เห็นจนกว่าร้านจะนับสต๊อกจริงแล้วเจอว่าไม่ตรง
 */

const PB = process.env.PB_URL ?? 'http://127.0.0.1:8095';

let failures = 0;

function check(label, ok, detail = '') {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function api(path, opts = {}) {
  const res = await fetch(`${PB}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function loginStaff(username, password) {
  const { status, body } = await api('/api/collections/staff/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: username, password }),
  });
  if (status !== 200) {
    throw new Error(`ล็อกอิน ${username} ไม่ผ่าน (${status}) — รัน seed.mjs ก่อนหรือยัง?`);
  }
  return body;
}

async function getIngredient(id, token) {
  const { body } = await api(`/api/collections/ingredients/records/${id}`, {
    headers: { Authorization: token },
  });
  return body;
}

async function main() {
  console.log(`ตรวจการตัดสต๊อกอัตโนมัติที่ ${PB}\n`);

  const owner = await loginStaff('krua-nong-owner', '1234');
  const shopId = owner.record.shop;

  console.log('เตรียมข้อมูลทดสอบ — วัตถุดิบ + สูตรอาหาร');
  const ingredient = (
    await api('/api/collections/ingredients/records', {
      method: 'POST',
      headers: { Authorization: owner.token },
      body: JSON.stringify({
        shop: shopId,
        name: `กุ้ง (ทดสอบ ${Date.now()})`,
        unit: 'กรัม',
        stock_qty: 1000,
        cost_per_unit: 50,
        active: true,
      }),
    })
  ).body;
  console.log(`  วัตถุดิบ: ${ingredient.name} คงเหลือเริ่มต้น ${ingredient.stock_qty} กรัม`);

  const menuRes = await api(
    `/api/collections/menu_items/records?filter=${encodeURIComponent(`(shop="${shopId}" && name="ข้าวผัดกุ้ง")`)}`,
    { headers: { Authorization: owner.token } },
  );
  const item = menuRes.body.items[0];
  if (!item) throw new Error('ไม่พบเมนู "ข้าวผัดกุ้ง" — รัน seed.mjs ก่อน');

  const QTY_PER_SALE = 100; // กรัมต่อการขาย 1 หน่วย
  await api(`/api/collections/menu_items/records/${item.id}`, {
    method: 'PATCH',
    headers: { Authorization: owner.token },
    body: JSON.stringify({ recipe: [{ ingredientId: ingredient.id, qty: QTY_PER_SALE }] }),
  });
  console.log(`  ตั้งสูตร ${item.name}: ใช้วัตถุดิบ ${QTY_PER_SALE} กรัม/หน่วย\n`);

  console.log('ปิดบิล (status=paid) 2 หน่วย');
  const SALE_QTY = 2;
  const order = (
    await api('/api/collections/orders/records', {
      method: 'POST',
      headers: { Authorization: owner.token },
      body: JSON.stringify({
        client_uuid: crypto.randomUUID(),
        shop: shopId,
        order_no: 900000 + Math.floor(Math.random() * 90000),
        channel: 'pos',
        status: 'paid',
        lines: [
          {
            clientUuid: crypto.randomUUID(),
            menuItemId: item.id,
            nameSnapshot: item.name,
            unitPrice: item.price,
            qty: SALE_QTY,
            note: '',
            orderedBy: '',
          },
        ],
        subtotal: item.price * SALE_QTY,
        discount: 0,
        total: item.price * SALE_QTY,
        staff: owner.record.id,
      }),
    })
  ).body;
  check('สร้างบิลสำเร็จ', Boolean(order?.id), `id=${order?.id}`);

  const afterPaid = await getIngredient(ingredient.id, owner.token);
  const expectedAfterDeduct = ingredient.stock_qty - QTY_PER_SALE * SALE_QTY;
  check(
    'สต๊อกถูกตัดตามสูตร × จำนวนที่ขาย',
    afterPaid.stock_qty === expectedAfterDeduct,
    `คาดว่า ${expectedAfterDeduct} ได้ ${afterPaid.stock_qty}`,
  );

  const movementsAfterPaid = await api(
    `/api/collections/stock_movements/records?filter=${encodeURIComponent(`(order="${order.id}")`)}`,
    { headers: { Authorization: owner.token } },
  );
  const deductMovement = movementsAfterPaid.body.items.find((m) => m.type === 'deduct');
  check('มีเลดเจอร์ type=deduct ผูกกับบิลนี้', Boolean(deductMovement));
  check(
    'qty_delta ของเลดเจอร์ตรงกับที่ตัดจริง',
    deductMovement?.qty_delta === -(QTY_PER_SALE * SALE_QTY),
    `คาดว่า ${-(QTY_PER_SALE * SALE_QTY)} ได้ ${deductMovement?.qty_delta}`,
  );

  console.log('\nยกเลิกบิล (status=void) — ต้องคืนสต๊อก');
  const voided = await api(`/api/collections/orders/records/${order.id}`, {
    method: 'PATCH',
    headers: { Authorization: owner.token },
    body: JSON.stringify({ status: 'void' }),
  });
  check('เปลี่ยนสถานะเป็น void สำเร็จ', voided.status === 200, `ได้ HTTP ${voided.status}`);

  const afterVoid = await getIngredient(ingredient.id, owner.token);
  check(
    'สต๊อกคืนกลับเท่าค่าเริ่มต้น',
    afterVoid.stock_qty === ingredient.stock_qty,
    `คาดว่า ${ingredient.stock_qty} ได้ ${afterVoid.stock_qty}`,
  );

  const movementsAfterVoid = await api(
    `/api/collections/stock_movements/records?filter=${encodeURIComponent(`(order="${order.id}")`)}`,
    { headers: { Authorization: owner.token } },
  );
  const receiveMovement = movementsAfterVoid.body.items.find((m) => m.type === 'receive');
  check('มีเลดเจอร์ type=receive คืนสต๊อกผูกกับบิลนี้', Boolean(receiveMovement));
  check(
    'qty_delta ของเลดเจอร์คืนสต๊อกเป็นค่าบวกเท่ากับที่ตัดไป',
    receiveMovement?.qty_delta === QTY_PER_SALE * SALE_QTY,
    `คาดว่า ${QTY_PER_SALE * SALE_QTY} ได้ ${receiveMovement?.qty_delta}`,
  );

  console.log('\nกันคืนสต๊อกซ้ำ — สั่ง void อีกครั้งบนบิลที่ void ไปแล้ว');
  await api(`/api/collections/orders/records/${order.id}`, {
    method: 'PATCH',
    headers: { Authorization: owner.token },
    body: JSON.stringify({ status: 'void' }),
  });
  const afterSecondVoid = await getIngredient(ingredient.id, owner.token);
  check(
    'สต๊อกไม่ถูกคืนซ้ำ (ยังเท่าค่าเริ่มต้น)',
    afterSecondVoid.stock_qty === ingredient.stock_qty,
    `คาดว่า ${ingredient.stock_qty} ได้ ${afterSecondVoid.stock_qty}`,
  );

  console.log(
    failures === 0
      ? '\nผ่านทั้งหมด — ตัดสต๊อก/คืนสต๊อกอัตโนมัติทำงานถูกต้อง'
      : `\nไม่ผ่าน ${failures} ข้อ — ห้ามนำขึ้นเครื่องจริงจนกว่าจะแก้`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nตรวจไม่สำเร็จ:', err);
  process.exit(1);
});
