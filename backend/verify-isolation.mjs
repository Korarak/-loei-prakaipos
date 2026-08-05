/**
 * ตรวจว่ากฎสิทธิ์แยกข้อมูลระหว่างร้านทำงานจริง
 *
 *   node backend/seed.mjs && node backend/verify-isolation.mjs
 *
 * ทำไมต้องมีไฟล์นี้: กฎสิทธิ์ของ PocketBase เขียนเป็นสตริง ไม่มี type checking
 * เขียนผิดแล้วจะ "เงียบ" — ไม่มี error ให้เห็น แต่ร้าน ก. มองเห็นยอดขายร้าน ข.
 * ซึ่งเป็นความเสียหายที่กู้ความเชื่อถือกลับไม่ได้ (เอกสารออกแบบหัวข้อ 12)
 *
 * ข้อควรระวังตอนอ่านผล: PocketBase ตอบ 200 พร้อมรายการว่าง เมื่อกฎกรองไม่เหลืออะไร
 * ไม่ได้ตอบ 403 ดังนั้นการเช็คแค่ status code ไม่พอ ต้องดูจำนวนรายการที่ได้จริง
 * และต้องมีข้อมูลอยู่ในระบบก่อน มิฉะนั้น "ว่าง" อาจแปลว่า "ยังไม่มีข้อมูล" ก็ได้
 */

const PB = process.env.PB_URL ?? 'http://127.0.0.1:8095';

let failures = 0;

function check(label, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function api(path, token) {
  const res = await fetch(`${PB}${path}`, {
    headers: token ? { Authorization: token } : {},
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
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

async function main() {
  console.log(`ตรวจการแยกข้อมูลระหว่างร้านที่ ${PB}\n`);

  const a = await loginStaff('krua-nong-owner', '1234');
  const b = await loginStaff('cafe-chiangkhan-owner', '1234');
  const shopA = a.record.shop;
  const shopB = b.record.shop;

  console.log(`ร้าน ก. = ครัวน้อง (${shopA})`);
  console.log(`ร้าน ข. = คาเฟ่เชียงคาน (${shopB})\n`);

  // ── ข้อมูลต้องมีอยู่จริงก่อน มิฉะนั้นการทดสอบไม่มีความหมาย ──
  console.log('ข้อมูลตั้งต้น');
  const allOrdersAdmin = await api('/api/collections/orders/records?perPage=200', a.token);
  check(
    'ร้าน ก. เห็นบิลของตัวเองอย่างน้อย 1 ใบ',
    (allOrdersAdmin.data?.items?.length ?? 0) > 0,
    `เห็น ${allOrdersAdmin.data?.items?.length ?? 0} ใบ`,
  );

  // ── บิล: ข้อมูลที่ห้ามรั่วที่สุด ──
  console.log('\nบิล (orders)');
  const ordersA = await api('/api/collections/orders/records?perPage=200', a.token);
  const leakedToA = (ordersA.data?.items ?? []).filter((o) => o.shop !== shopA);
  check('ร้าน ก. เห็นเฉพาะบิลร้านตัวเอง', leakedToA.length === 0, `รั่ว ${leakedToA.length} ใบ`);

  const ordersB = await api('/api/collections/orders/records?perPage=200', b.token);
  const leakedToB = (ordersB.data?.items ?? []).filter((o) => o.shop !== shopB);
  check('ร้าน ข. เห็นเฉพาะบิลร้านตัวเอง', leakedToB.length === 0, `รั่ว ${leakedToB.length} ใบ`);

  const anonOrders = await api('/api/collections/orders/records?perPage=200');
  check(
    'คนไม่ล็อกอินเห็นบิล 0 ใบ',
    (anonOrders.data?.items?.length ?? 0) === 0,
    `เห็น ${anonOrders.data?.items?.length ?? 0} ใบ`,
  );

  // ── เจาะจงทีละใบ: กรองรายการได้ ไม่ได้แปลว่ากันการดูตรง id ได้ ──
  console.log('\nเปิดดูบิลร้านอื่นด้วย id ตรงๆ');
  const oneOrderOfB = (ordersB.data?.items ?? [])[0];
  if (oneOrderOfB) {
    const stolen = await api(`/api/collections/orders/records/${oneOrderOfB.id}`, a.token);
    check(
      'ร้าน ก. เปิดบิลร้าน ข. ด้วย id ไม่ได้',
      stolen.status === 404 || stolen.status === 403,
      `ได้ HTTP ${stolen.status}`,
    );
  } else {
    check('มีบิลของร้าน ข. ให้ทดสอบ', false, 'ไม่พบบิล');
  }

  // ── ยอดขาย ──
  console.log('\nข้อมูลร้าน (shops)');
  const shopsA = await api('/api/collections/shops/records', a.token);
  check(
    'ร้าน ก. เห็นข้อมูลร้านตัวเองร้านเดียว',
    (shopsA.data?.items ?? []).every((s) => s.id === shopA) &&
      (shopsA.data?.items?.length ?? 0) === 1,
    `เห็น ${shopsA.data?.items?.length ?? 0} ร้าน`,
  );

  const anonShops = await api('/api/collections/shops/records');
  check(
    'คนไม่ล็อกอินเห็นข้อมูลร้าน 0 ร้าน',
    (anonShops.data?.items?.length ?? 0) === 0,
    `เห็น ${anonShops.data?.items?.length ?? 0} ร้าน`,
  );

  // ── พนักงาน: รายชื่อพนักงานร้านอื่นก็ไม่ควรเห็น ──
  console.log('\nพนักงาน (staff)');
  const staffA = await api('/api/collections/staff/records', a.token);
  const staffLeak = (staffA.data?.items ?? []).filter((s) => s.shop !== shopA);
  check('ร้าน ก. เห็นเฉพาะพนักงานร้านตัวเอง', staffLeak.length === 0, `รั่ว ${staffLeak.length} คน`);

  const anonStaff = await api('/api/collections/staff/records');
  check(
    'คนไม่ล็อกอินเห็นรายชื่อพนักงาน 0 คน',
    (anonStaff.data?.items?.length ?? 0) === 0,
    `เห็น ${anonStaff.data?.items?.length ?? 0} คน`,
  );

  // ── เมนู: ตั้งใจให้อ่านสาธารณะ เพราะหน้าลูกค้าสแกน QR ไม่ล็อกอิน ──
  console.log('\nเมนู (ตั้งใจเปิดสาธารณะ — หน้าลูกค้า QR ไม่มีล็อกอิน)');
  const anonMenu = await api('/api/collections/menu_items/records?perPage=200');
  check(
    'คนไม่ล็อกอินอ่านเมนูได้',
    (anonMenu.data?.items?.length ?? 0) > 0,
    `เห็น ${anonMenu.data?.items?.length ?? 0} รายการ`,
  );

  // เมนูเปิดอ่านได้ แต่ต้องแก้ไม่ได้
  const tamper = await fetch(
    `${PB}/api/collections/menu_items/records/${anonMenu.data.items[0].id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: 1 }),
    },
  );
  check(
    'คนไม่ล็อกอินแก้ราคาเมนูไม่ได้',
    tamper.status === 403 || tamper.status === 404,
    `ได้ HTTP ${tamper.status}`,
  );

  // ── กันบิลซ้ำ: unique index บน client_uuid ──
  console.log('\nกันบิลซ้ำด้วย client_uuid');
  const existing = (ordersA.data?.items ?? [])[0];
  const dup = await fetch(`${PB}/api/collections/orders/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: a.token },
    body: JSON.stringify({
      client_uuid: existing.client_uuid,
      shop: shopA,
      order_no: 9999,
      channel: 'pos',
      status: 'paid',
      lines: [],
      subtotal: 0,
      total: 0,
    }),
  });
  check(
    'ส่งบิล client_uuid ซ้ำแล้วถูกปฏิเสธ',
    dup.status >= 400,
    `ได้ HTTP ${dup.status}`,
  );

  console.log(
    failures === 0
      ? '\nผ่านทั้งหมด — กฎแยกข้อมูลระหว่างร้านทำงานถูกต้อง'
      : `\nไม่ผ่าน ${failures} ข้อ — ห้ามนำขึ้นเครื่องจริงจนกว่าจะแก้`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nตรวจไม่สำเร็จ:', err.message);
  process.exit(1);
});
