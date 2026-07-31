/**
 * ตรวจเส้นทาง QR Order ที่ pb_hooks/qr_order.pb.js ทำงานถูกต้อง
 *
 *   node backend/seed.mjs && node backend/verify-qr-order.mjs
 *
 * เน้นตรวจจุดที่เป็นความปลอดภัยล้วนๆ — ถ้าพลาดข้อไหน ลูกค้าจะสั่งอาหาร
 * ที่ราคาที่ตัวเองกำหนดเองได้ หรือแกล้งสั่งจากนอกร้านได้ (ดู backend/README.md)
 */

const PB = process.env.PB_URL ?? 'http://127.0.0.1:8090';

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

async function adminToken() {
  const { body } = await api('/api/admins/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: 'dev@prakaipos.local', password: 'devpassword123' }),
  });
  return body.token;
}

async function main() {
  console.log(`ตรวจเส้นทาง QR Order ที่ ${PB}\n`);

  const adminTok = await adminToken();
  const shopRes = await api(
    `/api/collections/shops/records?filter=${encodeURIComponent('(code="krua-nong")')}`,
    { headers: { Authorization: adminTok } },
  );
  const shop = shopRes.body.items[0];
  const menuRes = await api(
    `/api/collections/menu_items/records?filter=${encodeURIComponent(`(shop="${shop.id}" && active=true)`)}&perPage=50`,
    { headers: { Authorization: adminTok } },
  );
  const items = menuRes.body.items;
  const kungFried = items.find((i) => i.name === 'ข้าวผัดกุ้ง');
  const iceTea = items.find((i) => i.name === 'ชาเย็น');

  // สร้างลายเซ็นด้วยกุญแจลับจริง (อ่านจากฐานข้อมูลตรงๆ เพราะทดสอบในเครื่อง
  // — ของจริงลิงก์นี้พิมพ์ไว้ล่วงหน้าตอนติดสติกเกอร์ที่โต๊ะ)
  const { createHmac } = await import('node:crypto');
  const sign = (code, table, secret) =>
    createHmac('sha256', secret).update(`${code}:${table}`).digest('hex');
  const goodSig = sign('krua-nong', '9', shop.qr_secret);

  console.log('ลายเซ็นลิงก์โต๊ะ');
  const wrongSig = await api(`/api/public/table-session/krua-nong/9?k=wrongsignature00`);
  check('ลายเซ็นผิดถูกปฏิเสธ', wrongSig.status === 403, `HTTP ${wrongSig.status}`);

  const noSig = await api(`/api/public/table-session/krua-nong/9`);
  check('ไม่มีลายเซ็นเลยถูกปฏิเสธ', noSig.status === 403, `HTTP ${noSig.status}`);

  // ลายเซ็นของโต๊ะ 9 ต้องใช้กับโต๊ะ 10 ไม่ได้ — กันการ "ยืมลายเซ็น" ข้ามโต๊ะ
  const wrongTable = await api(`/api/public/table-session/krua-nong/10?k=${goodSig}`);
  check(
    'ลายเซ็นของโต๊ะอื่นใช้ข้ามโต๊ะไม่ได้',
    wrongTable.status === 403,
    `HTTP ${wrongTable.status}`,
  );

  const good = await api(`/api/public/table-session/krua-nong/9?k=${goodSig}`);
  check('ลายเซ็นถูกต้องผ่าน', good.status === 200, `HTTP ${good.status}`);
  const sessionId = good.body?.sessionId;
  check('ได้ sessionId กลับมา', typeof sessionId === 'string' && sessionId.length > 0);

  const again = await api(`/api/public/table-session/krua-nong/9?k=${goodSig}`);
  check(
    'สแกนซ้ำได้รอบนั่งเดิม ไม่สร้างรอบใหม่ซ้อน',
    again.body?.sessionId === sessionId,
  );

  console.log('\nคำนวณยอดฝั่งเซิร์ฟเวอร์ (ห้ามเชื่อไคลเอนต์)');
  const cheat = await api('/api/public/orders', {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      lines: [{ menuItemId: kungFried.id, qty: 3, unitPrice: 1, note: '' }],
    }),
  });
  check('สั่งสำเร็จแม้ไคลเอนต์ส่งราคาปลอมมา', cheat.status === 201, `HTTP ${cheat.status}`);
  const expectedTotal = kungFried.price * 3;
  check(
    'ยอดที่คำนวณจริงตรงกับราคาในฐานข้อมูล ไม่ใช่ราคาที่ไคลเอนต์ส่งมา',
    cheat.body?.total === expectedTotal,
    `ได้ ${cheat.body?.total} คาดว่า ${expectedTotal}`,
  );

  const stored = await api(`/api/collections/orders/records/${cheat.body.orderId}`, {
    headers: { Authorization: adminTok },
  });
  check(
    'ชื่อเมนูที่บันทึกมาจากฐานข้อมูลจริง',
    stored.body?.lines?.[0]?.nameSnapshot === 'ข้าวผัดกุ้ง',
  );
  check(
    'เลขบิลของ QR order เป็นค่าติดลบ — แยกพื้นที่จากเลขบิล POS',
    stored.body?.order_no < 0,
    `order_no=${stored.body?.order_no}`,
  );
  check('channel บันทึกเป็น qr', stored.body?.channel === 'qr');
  check(
    'สถานะเป็น pending ตามโหมด staff_confirm ของร้าน',
    stored.body?.status === 'pending',
  );

  console.log('\nของหมด');
  await api(`/api/collections/menu_items/records/${iceTea.id}`, {
    method: 'PATCH',
    headers: { Authorization: adminTok },
    body: JSON.stringify({ sold_out: true }),
  });
  const soldOutOrder = await api('/api/public/orders', {
    method: 'POST',
    body: JSON.stringify({ sessionId, lines: [{ menuItemId: iceTea.id, qty: 1 }] }),
  });
  check(
    'สั่งเมนูที่หมดแล้วถูกปฏิเสธ พร้อมบอกชื่อเมนู',
    soldOutOrder.status === 400 && soldOutOrder.body?.message?.includes('ชาเย็น'),
    `HTTP ${soldOutOrder.status}: ${soldOutOrder.body?.message}`,
  );
  await api(`/api/collections/menu_items/records/${iceTea.id}`, {
    method: 'PATCH',
    headers: { Authorization: adminTok },
    body: JSON.stringify({ sold_out: false }),
  });

  console.log('\nเมนูข้ามร้าน');
  const otherShopRes = await api(
    `/api/collections/shops/records?filter=${encodeURIComponent('(code="cafe-chiangkhan")')}`,
    { headers: { Authorization: adminTok } },
  );
  const otherMenuRes = await api(
    `/api/collections/menu_items/records?filter=${encodeURIComponent(`(shop="${otherShopRes.body.items[0].id}")`)}&perPage=1`,
    { headers: { Authorization: adminTok } },
  );
  const crossShopItem = otherMenuRes.body.items[0];
  const crossShopOrder = await api('/api/public/orders', {
    method: 'POST',
    body: JSON.stringify({ sessionId, lines: [{ menuItemId: crossShopItem.id, qty: 1 }] }),
  });
  check(
    'สั่งเมนูของร้านอื่นผ่าน session ร้านนี้ถูกปฏิเสธ',
    crossShopOrder.status === 400,
    `HTTP ${crossShopOrder.status}`,
  );

  console.log('\nรอบนั่งที่ปิดแล้ว');
  await api(`/api/collections/table_sessions/records/${sessionId}`, {
    method: 'PATCH',
    headers: { Authorization: adminTok },
    body: JSON.stringify({ closed_at: new Date().toISOString() }),
  });
  const afterClose = await api('/api/public/orders', {
    method: 'POST',
    body: JSON.stringify({ sessionId, lines: [{ menuItemId: kungFried.id, qty: 1 }] }),
  });
  check(
    'สั่งหลังรอบนั่งปิดแล้วถูกปฏิเสธ',
    afterClose.status === 400,
    `HTTP ${afterClose.status}`,
  );

  const rescan = await api(`/api/public/table-session/krua-nong/9?k=${goodSig}`);
  check(
    'สแกน QR ซ้ำหลังปิดรอบได้รอบนั่งใหม่ ไม่ใช่รอบเดิมที่ปิดไปแล้ว',
    rescan.body?.sessionId !== sessionId,
  );

  console.log('\nจำกัดอัตราการสั่ง');
  const rateSession = rescan.body.sessionId;
  let limited = false;
  for (let i = 0; i < 8; i++) {
    const r = await api('/api/public/orders', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: rateSession,
        lines: [{ menuItemId: kungFried.id, qty: 1 }],
      }),
    });
    if (r.status === 429) {
      limited = true;
      break;
    }
  }
  check('สั่งรัวเกินโควตาแล้วถูกจำกัดอัตรา (429)', limited);

  console.log('\nพนักงานยืนยัน/ปฏิเสธออร์เดอร์ที่ POS');
  // นี่คือจุดที่เคยพังจริง: client_uuid ที่ hook สร้างตอน create ยาวแค่ 32 ตัว
  // แม้ตอน create จะผ่าน (เขียนผ่าน dao.saveRecord() ไม่ผ่านการตรวจสอบฟิลด์
  // แบบ REST) แต่พอ PATCH ผ่าน REST ปกติจากหน้า POS การตรวจสอบทุกฟิลด์
  // (รวมที่ไม่ได้แก้) จะย้อนมาจับ ทำให้ยืนยัน/ปฏิเสธออร์เดอร์ไม่ได้เลย
  const ownerAuth = await api('/api/collections/staff/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: 'krua-nong-owner', password: '1234' }),
  });
  const staffTok = ownerAuth.body?.token;

  // ใช้รอบนั่งใหม่ ไม่ใช่ rateSession เดิม — รอบนั้นเพิ่งโดนจำกัดอัตราไปแล้ว
  // ในหัวข้อก่อนหน้า สั่งซ้ำจะติด 429 ทันทีไม่เกี่ยวกับสิ่งที่ทดสอบตรงนี้
  const confirmSess = await api(
    `/api/public/table-session/krua-nong/20?k=${sign('krua-nong', '20', shop.qr_secret)}`,
  );

  const forConfirm = await api('/api/public/orders', {
    method: 'POST',
    body: JSON.stringify({
      sessionId: confirmSess.body.sessionId,
      lines: [{ menuItemId: kungFried.id, qty: 1 }],
    }),
  });
  const confirmRes = await api(`/api/collections/orders/records/${forConfirm.body.orderId}`, {
    method: 'PATCH',
    headers: { Authorization: staffTok },
    body: JSON.stringify({ status: 'open' }),
  });
  check(
    'พนักงานกดยืนยันออร์เดอร์ได้ (pending → open)',
    confirmRes.status === 200 && confirmRes.body?.status === 'open',
    `HTTP ${confirmRes.status}: ${JSON.stringify(confirmRes.body?.data ?? confirmRes.body)}`,
  );

  const rejectSess = await api(
    `/api/public/table-session/krua-nong/21?k=${sign('krua-nong', '21', shop.qr_secret)}`,
  );
  const forReject = await api('/api/public/orders', {
    method: 'POST',
    body: JSON.stringify({
      sessionId: rejectSess.body.sessionId,
      lines: [{ menuItemId: kungFried.id, qty: 1 }],
    }),
  });
  const rejectRes = await api(`/api/collections/orders/records/${forReject.body.orderId}`, {
    method: 'PATCH',
    headers: { Authorization: staffTok },
    body: JSON.stringify({ status: 'void' }),
  });
  check(
    'พนักงานกดปฏิเสธออร์เดอร์ได้ (pending → void)',
    rejectRes.status === 200 && rejectRes.body?.status === 'void',
    `HTTP ${rejectRes.status}`,
  );

  console.log('\nโหมด auto — ไม่ต้องรอพนักงานยืนยัน');
  await api(`/api/collections/shops/records/${shop.id}`, {
    method: 'PATCH',
    headers: { Authorization: adminTok },
    body: JSON.stringify({ qr_order_mode: 'auto' }),
  });
  const autoSess = await api(`/api/public/table-session/krua-nong/11?k=${sign('krua-nong', '11', shop.qr_secret)}`);
  const autoOrder = await api('/api/public/orders', {
    method: 'POST',
    body: JSON.stringify({
      sessionId: autoSess.body.sessionId,
      lines: [{ menuItemId: kungFried.id, qty: 1 }],
    }),
  });
  check('โหมด auto สร้างออร์เดอร์สถานะ open ทันที', autoOrder.body?.status === 'open');
  await api(`/api/collections/shops/records/${shop.id}`, {
    method: 'PATCH',
    headers: { Authorization: adminTok },
    body: JSON.stringify({ qr_order_mode: 'staff_confirm' }),
  });

  console.log(
    failures === 0
      ? '\nผ่านทั้งหมด — เส้นทาง QR Order ปลอดภัยตามที่ออกแบบไว้'
      : `\nไม่ผ่าน ${failures} ข้อ — ห้ามนำขึ้นเครื่องจริงจนกว่าจะแก้`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nตรวจไม่สำเร็จ:', err);
  process.exit(1);
});
