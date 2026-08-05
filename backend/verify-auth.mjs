/**
 * ตรวจเส้นทางเข้าระบบกับ PocketBase จริง
 *
 *   node backend/seed.mjs && node backend/verify-auth.mjs
 *
 * ทดสอบสิ่งที่ unit test ทดสอบแทนไม่ได้ — ว่า username, PIN ความยาว 4
 * และกฎสิทธิ์ของ collection `staff` ตั้งไว้ถูกต้องจริงบนเซิร์ฟเวอร์
 */

const PB = process.env.PB_URL ?? 'http://127.0.0.1:8095';

let failures = 0;

function check(label, ok, detail = '') {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function auth(identity, password) {
  const res = await fetch(`${PB}/api/collections/staff/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity, password }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  console.log(`ตรวจการเข้าระบบที่ ${PB}\n`);

  console.log('เข้าระบบด้วย PIN');
  const ok = await auth('krua-nong-owner', '1234');
  check('PIN 4 หลักใช้ได้', ok.status === 200, `HTTP ${ok.status}`);
  check(
    'ได้ token กลับมา',
    typeof ok.body?.token === 'string' && ok.body.token.length > 0,
  );
  check('เรกคอร์ดมี shop ผูกอยู่', Boolean(ok.body?.record?.shop));
  check(
    'เรกคอร์ดบอกบทบาทได้',
    ok.body?.record?.role === 'owner',
    `role=${ok.body?.record?.role}`,
  );
  check(
    'ไม่ส่ง hash ของ PIN กลับมาให้ไคลเอนต์',
    !JSON.stringify(ok.body?.record ?? {}).includes('password'),
  );

  console.log('\nPIN ผิด');
  const bad = await auth('krua-nong-owner', '9999');
  check('ถูกปฏิเสธ', bad.status >= 400, `HTTP ${bad.status}`);
  check(
    'ตอบด้วยรหัสที่โค้ดฝั่งแอปแยกออกจาก error เครือข่ายได้',
    bad.status === 400 || bad.status === 401,
    `HTTP ${bad.status}`,
  );

  console.log('\nชื่อผู้ใช้ที่ไม่มีจริง');
  const nobody = await auth('ไม่มีคนนี้', '1234');
  check('ถูกปฏิเสธ', nobody.status >= 400, `HTTP ${nobody.status}`);

  console.log('\nพนักงานเห็นข้อมูลอะไรได้บ้างหลังเข้าระบบ');
  const staffAuth = await auth('krua-nong-staff', '1234');
  const token = staffAuth.body?.token;

  const devices = await (
    await fetch(`${PB}/api/collections/devices/records`, {
      headers: { Authorization: token },
    })
  ).json();
  check(
    'พนักงานอ่านข้อมูลเครื่องของร้านตัวเองได้ (ต้องใช้ตอนตั้งค่า)',
    Array.isArray(devices.items),
    `${devices.items?.length ?? 0} เครื่อง`,
  );

  const otherStaff = await auth('cafe-chiangkhan-owner', '1234');
  const crossShop = await (
    await fetch(`${PB}/api/collections/devices/records`, {
      headers: { Authorization: otherStaff.body?.token },
    })
  ).json();
  const leaked = (crossShop.items ?? []).filter(
    (d) => d.shop !== otherStaff.body?.record?.shop,
  );
  check('ร้านอื่นมองไม่เห็นเครื่องของร้านเรา', leaked.length === 0);

  console.log('\nพนักงานทั่วไปแก้ข้อมูลร้านไม่ได้');
  const tamper = await fetch(
    `${PB}/api/collections/shops/records/${staffAuth.body?.record?.shop}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({ name: 'ร้านโดนแฮก' }),
    },
  );
  check(
    'พนักงาน (ไม่ใช่เจ้าของ) แก้ชื่อร้านไม่ได้',
    tamper.status >= 400,
    `HTTP ${tamper.status}`,
  );

  console.log(
    failures === 0
      ? '\nผ่านทั้งหมด — เส้นทางเข้าระบบทำงานถูกต้อง'
      : `\nไม่ผ่าน ${failures} ข้อ`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nตรวจไม่สำเร็จ:', err.message);
  process.exit(1);
});
