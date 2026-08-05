/**
 * ตรวจว่าออร์เดอร์ QR ผูกเข้ากับเลขใบเสร็จจริงได้ตามที่ออกแบบไว้
 * (backend/pb_migrations/1753900500_orders_linked_order.js)
 *
 *   node backend/seed.mjs && node backend/verify-qr-receipt-link.mjs
 *
 * จำลองขั้นตอนเดียวกับที่ apps/pos/src/screens/PayDialog.tsx ทำจริงตอน
 * พนักงานกด "รับเงิน" ที่โต๊ะ: สร้างบิลใหม่ channel="pos" ที่มีเลขบิลจริง
 * จากช่วงที่เครื่องจองไว้ แล้ว PATCH ออร์เดอร์ QR ต้นทางให้ status="paid"
 * พร้อมผูก linked_order_client_uuid ไว้ — ทดสอบตรงนี้เพื่อยืนยันว่า schema/
 * field รองรับ และการตามรอยจากออร์เดอร์ QR ไปหาใบเสร็จจริงทำได้จริง
 * (ตัวขั้นตอนเองไม่มี hook ฝั่งเซิร์ฟเวอร์บังคับ เพราะเป็นการออกแบบฝั่งไคลเอนต์
 * ล้วนๆ — เทสต์นี้จึงตรวจ "สัญญา" ที่ฝั่งแอปพึ่งพาอยู่ ไม่ใช่กฎสิทธิ์)
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

async function main() {
  console.log(`ตรวจการผูกออร์เดอร์ QR เข้ากับเลขใบเสร็จจริงที่ ${PB}\n`);

  const owner = await loginStaff('krua-nong-owner', '1234');
  const shopId = owner.record.shop;

  const shopRes = await api(`/api/collections/shops/records/${shopId}`, {
    headers: { Authorization: owner.token },
  });
  const shop = shopRes.body;

  const deviceRes = await api(
    `/api/collections/devices/records?filter=${encodeURIComponent(`(shop="${shopId}")`)}&perPage=1`,
    { headers: { Authorization: owner.token } },
  );
  const device = deviceRes.body.items[0];
  if (!device) throw new Error('ไม่พบเครื่องที่จองช่วงเลขบิลไว้ — รัน seed.mjs ก่อน');

  console.log('สั่งอาหารผ่าน QR ก่อน (ได้เลขบิลชั่วคราวติดลบ)');
  const { createHmac } = await import('node:crypto');
  const sig = createHmac('sha256', shop.qr_secret).update('krua-nong:60').digest('hex');
  const sess = await api(`/api/public/table-session/krua-nong/60?k=${sig}`);
  const menuRes = await api(
    `/api/collections/menu_items/records?filter=${encodeURIComponent(`(shop="${shopId}" && active=true)`)}&perPage=1`,
    { headers: { Authorization: owner.token } },
  );
  const item = menuRes.body.items[0];
  const qrOrder = (
    await api('/api/public/orders', {
      method: 'POST',
      body: JSON.stringify({ sessionId: sess.body.sessionId, lines: [{ menuItemId: item.id, qty: 1 }] }),
    })
  ).body;
  check('ได้ออร์เดอร์ QR เลขติดลบ', qrOrder.orderNo < 0, `order_no=${qrOrder.orderNo}`);

  console.log('\nพนักงานยืนยันออร์เดอร์ (pending → open)');
  await api(`/api/collections/orders/records/${qrOrder.orderId}`, {
    method: 'PATCH',
    headers: { Authorization: owner.token },
    body: JSON.stringify({ status: 'open' }),
  });

  console.log('\nพนักงานกด "รับเงิน" — จำลองสิ่งที่ PayDialog.tsx ทำจริง');
  const receiptClientUuid = crypto.randomUUID();
  // สุ่มเลขในช่วงที่เครื่องจองไว้ (เลี่ยงเลขแรกสุดที่ seed.mjs ใช้สร้างบิลตัวอย่างไปแล้ว)
  const rangeSize = device.order_no_end - device.order_no_start;
  const realOrderNo = device.order_no_start + 1 + Math.floor(Math.random() * rangeSize);
  const receipt = (
    await api('/api/collections/orders/records', {
      method: 'POST',
      headers: { Authorization: owner.token },
      body: JSON.stringify({
        client_uuid: receiptClientUuid,
        shop: shopId,
        order_no: realOrderNo,
        channel: 'pos',
        status: 'paid',
        table_no: '60',
        table_session: sess.body.sessionId,
        lines: [
          {
            clientUuid: crypto.randomUUID(),
            menuItemId: item.id,
            nameSnapshot: item.name,
            unitPrice: item.price,
            qty: 1,
            note: '',
            orderedBy: '',
          },
        ],
        subtotal: item.price,
        discount: 0,
        total: item.price,
        payment: { method: 'cash', amount: item.price, change: 0, paidAt: new Date().toISOString() },
        staff: owner.record.id,
      }),
    })
  ).body;
  check('สร้างใบเสร็จจริงสำเร็จ (order_no บวก จากช่วงที่เครื่องจองไว้)', receipt.order_no > 0, `order_no=${receipt.order_no}`);

  const linked = await api(`/api/collections/orders/records/${qrOrder.orderId}`, {
    method: 'PATCH',
    headers: { Authorization: owner.token },
    body: JSON.stringify({ status: 'paid', linked_order_client_uuid: receiptClientUuid }),
  });
  check('ออร์เดอร์ QR ต้นทางถูกปิดเป็น paid', linked.body?.status === 'paid', `ได้ ${linked.body?.status}`);
  check(
    'ออร์เดอร์ QR ผูก linked_order_client_uuid ไว้แล้ว',
    linked.body?.linked_order_client_uuid === receiptClientUuid,
    `ได้ "${linked.body?.linked_order_client_uuid}"`,
  );

  console.log('\nตามรอยจากออร์เดอร์ QR (เลขติดลบ) ไปหาใบเสร็จจริง');
  const resolved = await api(
    `/api/collections/orders/records?filter=${encodeURIComponent(`(client_uuid="${linked.body.linked_order_client_uuid}")`)}`,
    { headers: { Authorization: owner.token } },
  );
  const resolvedReceipt = resolved.body.items[0];
  check('หาใบเสร็จจริงเจอจาก client_uuid ที่ผูกไว้', Boolean(resolvedReceipt));
  check(
    'เลขบิลที่หาเจอตรงกับใบเสร็จจริงที่สร้างไว้',
    resolvedReceipt?.order_no === realOrderNo && resolvedReceipt?.id === receipt.id,
    `คาดว่า order_no=${realOrderNo} id=${receipt.id} ได้ order_no=${resolvedReceipt?.order_no} id=${resolvedReceipt?.id}`,
  );

  console.log(
    failures === 0
      ? '\nผ่านทั้งหมด — ผูกออร์เดอร์ QR เข้ากับเลขใบเสร็จจริงทำงานถูกต้อง'
      : `\nไม่ผ่าน ${failures} ข้อ — ห้ามนำขึ้นเครื่องจริงจนกว่าจะแก้`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nตรวจไม่สำเร็จ:', err);
  process.exit(1);
});
