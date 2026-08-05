/**
 * ตรวจว่าพนักงาน (role != "owner") แก้ได้แค่ sold_out ของเมนู
 * ส่วนเจ้าของร้านยังแก้ทุกฟิลด์ได้ตามเดิม
 *
 *   node backend/seed.mjs && node backend/verify-menu-price-guard.mjs
 *
 * เหตุผลเดียวกับ verify-isolation.mjs — กฎ/hook สิทธิ์เขียนแล้วพังเงียบได้
 * (menu_items.updateRule เปิดให้ทั้งร้านแก้ record ได้ทั้งใบ field-level
 * restriction ทำผ่าน backend/pb_hooks/menu_item_price_guard.pb.js เท่านั้น
 * ถ้า hook พังหรือไม่ถูกโหลด พนักงานจะแก้ราคาได้เงียบๆ โดยไม่มี error ให้เห็น)
 */

const PB = process.env.PB_URL ?? 'http://127.0.0.1:8095';

let failures = 0;

function check(label, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function loginStaff(username, password) {
  const res = await fetch(`${PB}/api/collections/staff/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: username, password }),
  });
  if (!res.ok) {
    throw new Error(`ล็อกอิน ${username} ไม่ผ่าน (${res.status}) — รัน seed.mjs ก่อนหรือยัง?`);
  }
  return res.json();
}

async function patchMenuItem(id, token, body) {
  const res = await fetch(`${PB}/api/collections/menu_items/records/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function main() {
  console.log(`ตรวจการกันพนักงานแก้ราคาเมนูที่ ${PB}\n`);

  const owner = await loginStaff('krua-nong-owner', '1234');
  const staff = await loginStaff('krua-nong-staff', '1234');

  const list = await fetch(
    `${PB}/api/collections/menu_items/records?perPage=1&filter=${encodeURIComponent(`shop="${owner.record.shop}"`)}`,
  ).then((r) => r.json());
  const item = list.items[0];
  if (!item) throw new Error('ไม่พบเมนูให้ทดสอบ — รัน seed.mjs ก่อน');

  console.log(`เมนูทดสอบ: ${item.name} ราคาเดิม ${item.price} สตางค์\n`);

  // ── พนักงาน: แก้ sold_out ได้ ──
  console.log('พนักงานกด "ของหมด"');
  const soldOut = await patchMenuItem(item.id, staff.token, { sold_out: true });
  check('แก้ sold_out ได้', soldOut.status === 200, `ได้ HTTP ${soldOut.status}`);
  check('sold_out เปลี่ยนค่าจริง', soldOut.data?.sold_out === true, `ได้ ${soldOut.data?.sold_out}`);

  // ── พนักงาน: แก้ราคา/ชื่อพร้อมกันในคำขอเดียว ──
  console.log('\nพนักงานพยายามแก้ราคา/ชื่อพร้อม sold_out');
  const tamper = await patchMenuItem(item.id, staff.token, {
    price: 1,
    name: 'แก้ชื่อโดยพนักงาน',
    sold_out: false,
  });
  check('คำขอไม่ถูกปฏิเสธทั้งใบ (แค่ฟิลด์ถูก revert)', tamper.status === 200, `ได้ HTTP ${tamper.status}`);
  check('ราคาไม่เปลี่ยน', tamper.data?.price === item.price, `ได้ ${tamper.data?.price}`);
  check('ชื่อไม่เปลี่ยน', tamper.data?.name === item.name, `ได้ ${tamper.data?.name}`);
  check('sold_out ยังเปลี่ยนได้ตามที่ส่งมา', tamper.data?.sold_out === false, `ได้ ${tamper.data?.sold_out}`);

  // ── เจ้าของร้าน: แก้ราคาได้ตามปกติ ──
  console.log('\nเจ้าของร้านแก้ราคา');
  const newPrice = item.price + 500;
  const ownerEdit = await patchMenuItem(item.id, owner.token, { price: newPrice });
  check('เจ้าของร้านแก้ราคาได้', ownerEdit.status === 200, `ได้ HTTP ${ownerEdit.status}`);
  check('ราคาเปลี่ยนจริง', ownerEdit.data?.price === newPrice, `ได้ ${ownerEdit.data?.price}`);

  // คืนราคาเดิม กันรันซ้ำแล้วราคาขยับสะสม
  await patchMenuItem(item.id, owner.token, { price: item.price });

  console.log(
    failures === 0
      ? '\nผ่านทั้งหมด — พนักงานแก้ได้แค่ sold_out เจ้าของร้านแก้ได้ทุกฟิลด์'
      : `\nไม่ผ่าน ${failures} ข้อ — ห้ามนำขึ้นเครื่องจริงจนกว่าจะแก้`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nตรวจไม่สำเร็จ:', err.message);
  process.exit(1);
});
