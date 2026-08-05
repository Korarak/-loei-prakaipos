/**
 * ใส่ข้อมูลตัวอย่างลง PocketBase สำหรับพัฒนาในเครื่อง
 *
 *   node backend/seed.mjs
 *
 * สร้างสองร้านโดยตั้งใจ — ร้านที่สองมีไว้เพื่อทดสอบว่ากฎแยกข้อมูลทำงานจริง
 * (ดู backend/verify-isolation.mjs) ถ้ามีร้านเดียวจะทดสอบไม่ได้ว่าร้าน ก.
 * มองไม่เห็นข้อมูลร้าน ข.
 *
 * รันซ้ำได้ — ลบข้อมูลเดิมของร้านตัวอย่างก่อนสร้างใหม่ทุกครั้ง
 */

import { createHmac, randomBytes } from 'node:crypto';

const PB = process.env.PB_URL ?? 'http://127.0.0.1:8095';
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL ?? 'dev@prakaipos.local';
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD ?? 'devpassword123';

/**
 * ลายเซ็นของลิงก์โต๊ะ — ต้องคำนวณแบบเดียวกับฝั่ง pb_hooks/qr_order.pb.js เป๊ะ
 * ($security.hs256 ของ PocketBase คือ HMAC-SHA256 คืนค่าเป็น hex เหมือนกัน)
 */
function signTableLink(shopCode, tableNo, secret) {
  return createHmac('sha256', secret).update(`${shopCode}:${tableNo}`).digest('hex');
}

/** บาท → สตางค์ (ข้อมูล seed เขียนเป็นบาทให้อ่านง่าย) */
const b = (baht) => Math.round(baht * 100);

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${PB}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}\n${JSON.stringify(data, null, 2)}`);
  }
  return data;
}

async function adminToken() {
  const auth = await api('/api/admins/auth-with-password', {
    method: 'POST',
    body: { identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  return auth.token;
}

/** ลบเรกคอร์ดเดิมของร้านตามรหัสร้าน เพื่อให้รัน seed ซ้ำได้ */
async function wipeShop(token, code) {
  const found = await api(`/api/collections/shops/records?filter=(code='${code}')`, { token });
  for (const shop of found.items) {
    // cascadeDelete บน relation จัดการลูกๆ ให้เอง (staff, categories, menu_items, orders)
    await api(`/api/collections/shops/records/${shop.id}`, { method: 'DELETE', token });
    console.log(`  ลบร้านเดิม ${code} (${shop.id})`);
  }
}

const MENU = [
  {
    category: 'ข้าว',
    items: [
      ['ข้าวผัดกุ้ง', 120],
      ['ข้าวผัดหมู', 60],
      ['ข้าวกะเพราหมูสับไข่ดาว', 70],
      ['ข้าวหมูกระเทียม', 65],
      ['ข้าวไข่เจียว', 45],
    ],
  },
  {
    category: 'เส้น',
    items: [
      ['ผัดไทยกุ้งสด', 90],
      ['ก๋วยเตี๋ยวหมูน้ำตก', 55],
      ['ราดหน้าหมู', 65],
    ],
  },
  {
    category: 'เครื่องดื่ม',
    items: [
      ['น้ำเปล่า', 10],
      ['ชาเย็น', 30],
      ['กาแฟเย็น', 35],
      ['โค้ก', 20],
    ],
  },
];

async function seedShop(token, { code, name, promptpayId, tablesEnabled, deviceIndex }) {
  const shop = await api('/api/collections/shops/records', {
    method: 'POST',
    token,
    body: {
      code,
      name,
      promptpay_id: promptpayId,
      qr_order_mode: 'staff_confirm',
      tables_enabled: tablesEnabled,
      table_count: tablesEnabled ? 12 : 0,
      // กุญแจลับสำหรับเซ็นลายเซ็นลิงก์โต๊ะ — ร้านจริงจะสุ่มครั้งเดียวตอนเปิดบัญชี
      qr_secret: randomBytes(24).toString('hex'),
    },
  });
  console.log(`  ร้าน ${name} (${code}) → ${shop.id}`);

  // PIN ของ dev ตั้งไว้ตัวเดียวกันหมดเพื่อความสะดวก — ห้ามใช้รูปแบบนี้บนเครื่องจริง
  const owner = await api('/api/collections/staff/records', {
    method: 'POST',
    token,
    body: {
      username: `${code}-owner`,
      password: '1234',
      passwordConfirm: '1234',
      shop: shop.id,
      display_name: 'เจ้าของร้าน',
      role: 'owner',
      active: true,
      verified: true,
    },
  });

  await api('/api/collections/staff/records', {
    method: 'POST',
    token,
    body: {
      username: `${code}-staff`,
      password: '1234',
      passwordConfirm: '1234',
      shop: shop.id,
      display_name: 'พนักงานหน้าร้าน',
      role: 'staff',
      active: true,
      verified: true,
    },
  });
  console.log(`    พนักงาน 2 คน (PIN 1234) — ${code}-owner, ${code}-staff`);

  let menuCount = 0;
  for (const [ci, group] of MENU.entries()) {
    const cat = await api('/api/collections/categories/records', {
      method: 'POST',
      token,
      body: { shop: shop.id, name: group.category, sort_order: ci, active: true },
    });
    for (const [mi, [itemName, priceBaht]] of group.items.entries()) {
      await api('/api/collections/menu_items/records', {
        method: 'POST',
        token,
        body: {
          shop: shop.id,
          category: cat.id,
          name: itemName,
          price: b(priceBaht),
          sold_out: false,
          sort_order: mi,
          active: true,
        },
      });
      menuCount++;
    }
  }
  console.log(`    เมนู ${menuCount} รายการ ใน ${MENU.length} หมวด`);

  // จองช่วงเลขบิลให้เครื่องแรกของร้าน
  const start = 1001 + (deviceIndex - 1) * 1000;
  await api('/api/collections/devices/records', {
    method: 'POST',
    token,
    body: {
      shop: shop.id,
      device_name: 'แท็บเล็ตหน้าร้าน',
      device_index: deviceIndex,
      order_no_start: start,
      order_no_end: start + 999,
      last_seen_at: new Date().toISOString(),
    },
  });

  // บิลตัวอย่างหนึ่งใบ ให้หน้ารายงานมีอะไรแสดง
  const lines = [
    { clientUuid: crypto.randomUUID(), menuItemId: '', nameSnapshot: 'ข้าวผัดกุ้ง', unitPrice: b(120), qty: 1, note: '', orderedBy: '' },
    { clientUuid: crypto.randomUUID(), menuItemId: '', nameSnapshot: 'ชาเย็น', unitPrice: b(30), qty: 2, note: 'หวานน้อย', orderedBy: '' },
  ];
  const subtotal = lines.reduce((a, l) => a + l.unitPrice * l.qty, 0);
  await api('/api/collections/orders/records', {
    method: 'POST',
    token,
    body: {
      client_uuid: crypto.randomUUID(),
      shop: shop.id,
      order_no: start,
      channel: 'pos',
      status: 'paid',
      table_no: tablesEnabled ? '3' : '',
      lines,
      subtotal,
      discount: 0,
      total: subtotal,
      payment: { method: 'cash', amount: b(200), change: b(200) - subtotal, paidAt: new Date().toISOString() },
      staff: owner.id,
    },
  });
  console.log(`    บิลตัวอย่าง 1 ใบ เลขที่ ${start}`);

  const sig = signTableLink(code, '5', shop.qr_secret);
  console.log(`    ลิงก์โต๊ะ 5 สำหรับทดสอบ: /t/${code}/5?k=${sig}`);

  return shop;
}

async function main() {
  console.log(`เชื่อมต่อ ${PB}`);
  const token = await adminToken();

  console.log('\nล้างข้อมูลเดิม');
  await wipeShop(token, 'krua-nong');
  await wipeShop(token, 'cafe-chiangkhan');

  console.log('\nสร้างข้อมูลตัวอย่าง');
  await seedShop(token, {
    code: 'krua-nong',
    name: 'ครัวน้อง',
    promptpayId: '0812345678',
    tablesEnabled: true,
    deviceIndex: 1,
  });
  await seedShop(token, {
    code: 'cafe-chiangkhan',
    name: 'คาเฟ่เชียงคาน',
    promptpayId: '0898765432',
    tablesEnabled: false,
    deviceIndex: 1,
  });

  console.log('\nเสร็จแล้ว · หน้า admin: http://127.0.0.1:8095/_/');
}

main().catch((err) => {
  console.error('\nseed ล้มเหลว:', err.message);
  process.exit(1);
});
