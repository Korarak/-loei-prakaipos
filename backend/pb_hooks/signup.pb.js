/// <reference path="../pb_data/types.d.ts" />

/**
 * สมัครร้านใหม่เอง — จุดเริ่มของการเปิดแพลตฟอร์มให้ผู้ประกอบการหลายร้าน
 *
 * เดิมเอกสารออกแบบหัวข้อ 01 ตั้งใจให้ "เราเปิดบัญชีให้ลูกค้าเอง ไม่มีสมัครใช้เอง"
 * (30 ร้านแรกคือคนที่รู้จัก) เพราะยังไม่มั่นใจเรื่องขนาด ตอนนี้เปลี่ยนนโยบายแล้ว
 * เปิดให้สมัครเองได้ผ่านเส้นทางนี้ — ยังไม่มีระบบเก็บเงิน (ดู README) ร้านที่
 * สมัครจะใช้งานได้ฟรีจนกว่าจะต่อระบบชำระเงินเสร็จ
 *
 * ไม่ต้องล็อกอิน (สมัครร้านใหม่ จึงยังไม่มีบัญชี) เขียนข้อมูลด้วย dao.saveRecord()
 * ระดับแอดมิน ข้าม createRule ปกติของ shops/staff ที่ล็อกไว้เป็น null โดยตั้งใจ
 * (กันไม่ให้ใครสร้างร้าน/พนักงานผ่าน REST ตรงๆ) เหมือนแพทเทิร์นเดียวกับ
 * pb_hooks/qr_order.pb.js
 */

routerAdd('POST', '/api/public/signup', (c) => {
  // ค่าคงที่ประกาศในนี้ตรงๆ — routerAdd callback มองไม่เห็นตัวแปรระดับไฟล์
  // (ข้อจำกัดของ PocketBase JSVM ที่บันทึกไว้แล้วในหัวไฟล์ qr_order.pb.js)
  const RATE_LIMIT_WINDOW_SECONDS = 3600;
  const RATE_LIMIT_MAX_SIGNUPS = 20;

  const body = $apis.requestInfo(c).data;
  const shopName = typeof body.shopName === 'string' ? body.shopName.trim().slice(0, 120) : '';
  const shopCodeRaw = typeof body.shopCode === 'string' ? body.shopCode.trim().toLowerCase() : '';
  const ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim().slice(0, 60) : '';
  const ownerPin = typeof body.ownerPin === 'string' ? body.ownerPin : '';
  const contactPhone = typeof body.contactPhone === 'string' ? body.contactPhone.trim().slice(0, 20) : '';

  if (!shopName) throw new BadRequestError('กรอกชื่อร้าน');
  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(shopCodeRaw)) {
    throw new BadRequestError('รหัสร้านต้องเป็นตัวพิมพ์เล็ก ตัวเลข หรือขีดกลาง ยาว 2-32 ตัว เช่น krua-nong');
  }
  if (!ownerName) throw new BadRequestError('กรอกชื่อเจ้าของร้าน');
  if (!/^\d{4,8}$/.test(ownerPin)) throw new BadRequestError('PIN ต้องเป็นตัวเลข 4-8 หลัก');

  const dao = $app.dao();

  // จำกัดอัตราการสมัคร กันบอทหรือสคริปต์ยิงสร้างร้านรัวๆ — ดูตัวเลขรวมทั้งระบบ
  // ไม่แยกตาม IP เพราะ PocketBase JSVM ไม่มีทางอ่าน IP ผู้เรียกได้สะดวกในเวอร์ชันนี้
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000)
    .toISOString()
    .replace('T', ' ');
  const recentSignups = dao.findRecordsByFilter(
    'shops',
    'created >= {:since}',
    '-created',
    RATE_LIMIT_MAX_SIGNUPS + 1,
    0,
    { since },
  );
  if (recentSignups.length >= RATE_LIMIT_MAX_SIGNUPS) {
    throw new ApiError(429, 'มีการสมัครร้านถี่เกินไปในระบบตอนนี้ กรุณาลองใหม่ภายหลัง');
  }

  let existing;
  try {
    existing = dao.findFirstRecordByFilter('shops', 'code = {:code}', { code: shopCodeRaw });
  } catch {
    existing = null;
  }
  if (existing) {
    throw new BadRequestError('รหัสร้านนี้มีคนใช้แล้ว กรุณาตั้งรหัสอื่น');
  }

  let created;
  dao.runInTransaction((txDao) => {
    const shopsCollection = txDao.findCollectionByNameOrId('shops');
    const shop = new Record(shopsCollection, {
      code: shopCodeRaw,
      name: shopName,
      promptpay_id: '',
      qr_order_mode: 'staff_confirm',
      tables_enabled: false,
      table_count: 0,
      // กุญแจลับต่อร้าน สุ่มครั้งเดียวตอนเปิดบัญชี ไม่เคยส่งออกไปนอกเซิร์ฟเวอร์
      qr_secret: $security.randomString(48),
      contact_phone: contactPhone,
    });
    txDao.saveRecord(shop);

    const staffCollection = txDao.findCollectionByNameOrId('staff');
    const owner = new Record(staffCollection, {
      username: `${shopCodeRaw}-owner`,
      shop: shop.id,
      display_name: ownerName,
      role: 'owner',
      active: true,
      verified: true,
    });
    owner.setPassword(ownerPin);
    txDao.saveRecord(owner);

    created = shop;
  });

  return c.json(201, {
    shopCode: created.getString('code'),
    shopId: created.id,
  });
});
