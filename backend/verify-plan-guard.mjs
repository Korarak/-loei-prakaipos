/**
 * ตรวจว่าระบบแผนสมาชิก/จ่ายเงิน (เอกสารออกแบบหัวข้อ 11) ทำงานตามที่ตั้งใจ
 *
 *   node backend/seed.mjs && node backend/verify-plan-guard.mjs
 *
 * เหตุผลเดียวกับ verify-isolation.mjs — กฎ/hook สิทธิ์เขียนแล้วพังเงียบได้
 * ถ้า shop_plan_guard.pb.js พัง ร้านจะปลอมแผนตัวเองเป็น "plus" ได้ฟรีผ่าน
 * REST ตรงๆ ถ้าเช็คแผนทดลองใน qr_order.pb.js พัง ร้านแผนทดลองจะใช้
 * QR Order ได้ฟรีทั้งที่ไม่ควรรวมอยู่ในแผนนั้น — ทั้งสองจุดกระทบรายได้ตรงๆ
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

async function adminToken() {
  const { body } = await api('/api/admins/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: 'dev@prakaipos.local', password: 'devpassword123' }),
  });
  return body.token;
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

async function main() {
  console.log(`ตรวจระบบแผนสมาชิก/จ่ายเงินที่ ${PB}\n`);

  const adminTok = await adminToken();
  const owner = await loginStaff('krua-nong-owner', '1234');
  const shopId = owner.record.shop;

  console.log('เจ้าของร้านปลอมแผนตัวเองผ่าน REST ตรงๆ');
  const before = await api(`/api/collections/shops/records/${shopId}`, {
    headers: { Authorization: owner.token },
  });
  const originalPlan = before.body.plan;

  const forged = await api(`/api/collections/shops/records/${shopId}`, {
    method: 'PATCH',
    headers: { Authorization: owner.token },
    body: JSON.stringify({ plan: 'plus', plan_expires_at: '2099-01-01 00:00:00.000Z' }),
  });
  check('คำขอไม่ถูกปฏิเสธทั้งใบ (แค่ฟิลด์แผนถูก revert)', forged.status === 200, `ได้ HTTP ${forged.status}`);
  check(
    'plan ไม่เปลี่ยนแม้ส่ง "plus" มาตรงๆ',
    forged.body?.plan === originalPlan,
    `เดิม "${originalPlan}" ได้ "${forged.body?.plan}"`,
  );
  check('plan_expires_at ไม่เปลี่ยน', !forged.body?.plan_expires_at, `ได้ "${forged.body?.plan_expires_at}"`);

  console.log('\nแอป admin (บัญชี PocketBase superuser) ตั้งแผนได้ตามปกติ');
  const realExpiry = '2027-01-01 00:00:00.000Z';
  const setByAdmin = await api(`/api/collections/shops/records/${shopId}`, {
    method: 'PATCH',
    headers: { Authorization: adminTok },
    body: JSON.stringify({ plan: 'plus', plan_expires_at: realExpiry }),
  });
  check('admin ตั้ง plan=plus ได้', setByAdmin.status === 200 && setByAdmin.body?.plan === 'plus', `ได้ HTTP ${setByAdmin.status} plan="${setByAdmin.body?.plan}"`);

  console.log('\nแผน plus สั่ง QR Order ได้ตามปกติ');
  const shop = setByAdmin.body;
  const { createHmac } = await import('node:crypto');
  const sig = createHmac('sha256', shop.qr_secret).update('krua-nong:81').digest('hex');
  const sess = await api(`/api/public/table-session/krua-nong/81?k=${sig}`);
  const menuRes = await api(
    `/api/collections/menu_items/records?filter=${encodeURIComponent(`(shop="${shopId}" && active=true)`)}&perPage=1`,
    { headers: { Authorization: adminTok } },
  );
  const item = menuRes.body.items[0];
  const orderAsPlus = await api('/api/public/orders', {
    method: 'POST',
    body: JSON.stringify({ sessionId: sess.body.sessionId, lines: [{ menuItemId: item.id, qty: 1 }] }),
  });
  check('สั่งผ่าน QR ได้ตอนแผน plus', orderAsPlus.status === 201, `ได้ HTTP ${orderAsPlus.status}`);

  console.log('\nแผนทดลอง (trial) สั่ง QR Order ไม่ได้');
  await api(`/api/collections/shops/records/${shopId}`, {
    method: 'PATCH',
    headers: { Authorization: adminTok },
    body: JSON.stringify({ plan: 'trial', plan_expires_at: '' }),
  });
  const sig2 = createHmac('sha256', shop.qr_secret).update('krua-nong:82').digest('hex');
  const sess2 = await api(`/api/public/table-session/krua-nong/82?k=${sig2}`);
  const orderAsTrial = await api('/api/public/orders', {
    method: 'POST',
    body: JSON.stringify({ sessionId: sess2.body.sessionId, lines: [{ menuItemId: item.id, qty: 1 }] }),
  });
  check(
    'สั่งผ่าน QR ถูกปฏิเสธตอนแผน trial',
    orderAsTrial.status === 400 && orderAsTrial.body?.message?.includes('แผนทดลอง'),
    `ได้ HTTP ${orderAsTrial.status}: ${orderAsTrial.body?.message}`,
  );

  console.log('\nร้านเก่าที่ plan ว่างเปล่า (ก่อนมีระบบนี้) ยังสั่ง QR ได้เหมือนเดิม');
  await api(`/api/collections/shops/records/${shopId}`, {
    method: 'PATCH',
    headers: { Authorization: adminTok },
    body: JSON.stringify({ plan: '', plan_expires_at: '' }),
  });
  const sig3 = createHmac('sha256', shop.qr_secret).update('krua-nong:83').digest('hex');
  const sess3 = await api(`/api/public/table-session/krua-nong/83?k=${sig3}`);
  const orderAsLegacy = await api('/api/public/orders', {
    method: 'POST',
    body: JSON.stringify({ sessionId: sess3.body.sessionId, lines: [{ menuItemId: item.id, qty: 1 }] }),
  });
  check('สั่งผ่าน QR ได้ตอน plan ว่าง (ร้านเก่า)', orderAsLegacy.status === 201, `ได้ HTTP ${orderAsLegacy.status}`);

  // คืนค่าเดิมกันรันซ้ำแล้วข้อมูลค้าง
  await api(`/api/collections/shops/records/${shopId}`, {
    method: 'PATCH',
    headers: { Authorization: adminTok },
    body: JSON.stringify({ plan: originalPlan ?? '', plan_expires_at: '' }),
  });

  console.log(
    failures === 0
      ? '\nผ่านทั้งหมด — ระบบแผนสมาชิกทำงานถูกต้อง'
      : `\nไม่ผ่าน ${failures} ข้อ — ห้ามนำขึ้นเครื่องจริงจนกว่าจะแก้`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nตรวจไม่สำเร็จ:', err);
  process.exit(1);
});
