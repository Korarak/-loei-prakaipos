/// <reference path="../pb_data/types.d.ts" />

/**
 * เส้นทาง QR Order — ลูกค้าสแกน QR ที่โต๊ะแล้วสั่งอาหารโดยไม่ล็อกอิน
 *
 * ปิดช่องโหว่สองข้อที่บันทึกไว้ใน backend/README.md:
 *
 * 1. **ตรวจลายเซ็น HMAC ของลิงก์โต๊ะ** กันคนแกล้งสั่งจากนอกร้าน
 *    ลิงก์ QR ประจำโต๊ะมีรูปแบบ /t/{รหัสร้าน}/{เลขโต๊ะ}?k={ลายเซ็น}
 *    ลายเซ็น = HMAC-SHA256(`${รหัสร้าน}:${เลขโต๊ะ}`, กุญแจลับของร้าน)
 *    พิมพ์ครั้งเดียวตอนติดเป็นสติกเกอร์ที่โต๊ะ ไม่เปลี่ยนอีก
 *
 * 2. **คำนวณยอดเงินฝั่งเซิร์ฟเวอร์เสมอ** ไม่เชื่อ unitPrice/nameSnapshot
 *    ที่ไคลเอนต์ส่งมา — ดึงราคาจริงจากฐานข้อมูล ณ เวลาสั่งทุกครั้ง
 *    มิฉะนั้นไคลเอนต์กำหนดราคาเองได้
 *
 * ทั้งสองเส้นทางนี้ **ไม่ต้องล็อกอิน** โดยตั้งใจ — ลูกค้าที่สแกน QR ไม่มีบัญชี
 * ความปลอดภัยจึงอยู่ที่การตรวจลายเซ็นและการจำกัดอัตราแทน
 *
 * ## ข้อจำกัดของ PocketBase JSVM ที่ต้องรู้ไว้ — ทดสอบยืนยันแล้วจริง
 *
 * ทุกอย่างที่ประกาศไว้ที่ **ระดับบนสุดของไฟล์** (ทั้ง `function` และ `const`)
 * มองไม่เห็นจากภายใน callback ของ `routerAdd` เลย แม้จะประกาศไว้ก่อนหน้า
 * ในไฟล์เดียวกันก็ตาม — เรียกแล้วได้ ReferenceError "is not defined" ทันที
 *
 * เข้าใจว่า PocketBase รัน callback แต่ละตัวผ่าน VM ที่ดึงจาก pool คนละตัว
 * กับตอนไฟล์ถูกโหลดครั้งแรก closure จึงไปหาตัวแปร/ฟังก์ชันพี่น้องไม่เจอ
 *
 * **ทางแก้ที่ใช้ในไฟล์นี้:** ทุกอย่างที่ callback ต้องใช้ต้องประกาศ
 * "อยู่ภายใน callback เดียวกัน" เท่านั้น — ค่าคงที่ก็ต้องเป็นตัวเลขดิบ
 * ในเนื้อโค้ด ไม่ใช่ตัวแปรระดับไฟล์ ยอมรับโค้ดซ้ำเล็กน้อยแลกกับความแน่นอน
 */

// ─────────────────────────────────────────────────────────────
// GET /api/public/table-session/:shopCode/:tableNo?k=ลายเซ็น
//
// ลูกค้าสแกน QR แล้วเรียกเส้นทางนี้ก่อนเสมอ เพื่อ:
//   - ยืนยันว่าลิงก์นี้ถูกต้อง (ลายเซ็นตรง)
//   - ได้รอบนั่งปัจจุบันของโต๊ะ (เปิดใหม่ถ้ายังไม่มี)
// ─────────────────────────────────────────────────────────────

routerAdd('GET', '/api/public/table-session/:shopCode/:tableNo', (c) => {
  const shopCode = c.pathParam('shopCode');
  const tableNo = c.pathParam('tableNo');
  const signature = c.queryParam('k');

  let shop;
  try {
    shop = $app.dao().findFirstRecordByFilter('shops', 'code = {:code}', { code: shopCode });
  } catch {
    throw new NotFoundError('ไม่พบร้านนี้');
  }

  const secret = shop.getString('qr_secret');
  // ร้านที่ยังไม่ได้ตั้งกุญแจลับสั่งผ่าน QR ไม่ได้เลย ดีกว่าเงียบแล้ว
  // ยอมให้ทุกคำขอผ่าน ซึ่งเท่ากับปิดการป้องกันทั้งหมด
  const expected = secret
    ? $security.hs256(`${shop.getString('code')}:${tableNo}`, secret)
    : '';
  const sigOk = Boolean(secret) && Boolean(signature) && $security.equal(signature, expected);

  if (!sigOk) {
    // ไม่บอกรายละเอียดว่าลายเซ็นผิดตรงไหน กันการไล่เดา
    throw new ForbiddenError('ลิงก์นี้ไม่ถูกต้อง กรุณาสแกน QR ที่โต๊ะอีกครั้ง');
  }

  const dao = $app.dao();
  let session;

  dao.runInTransaction((txDao) => {
    let existing;
    try {
      existing = txDao.findFirstRecordByFilter(
        'table_sessions',
        'shop = {:shop} && table_no = {:tableNo} && closed_at = ""',
        { shop: shop.id, tableNo },
      );
    } catch {
      existing = null;
    }

    if (existing) {
      session = existing;
      return;
    }

    const collection = txDao.findCollectionByNameOrId('table_sessions');
    const record = new Record(collection, {
      shop: shop.id,
      table_no: tableNo,
      opened_at: new Date().toISOString(),
      closed_at: '',
    });
    txDao.saveRecord(record);
    session = record;
  });

  return c.json(200, {
    sessionId: session.id,
    shopId: shop.id,
    shopName: shop.getString('name'),
    tableNo,
    openedAt: session.getString('opened_at'),
    qrOrderMode: shop.getString('qr_order_mode'),
  });
});

// ─────────────────────────────────────────────────────────────
// POST /api/public/orders
// body: { sessionId, lines: [{ menuItemId, qty, note, orderedBy }] }
//
// สร้างออร์เดอร์จริง — ราคาและชื่อเมนูดึงจากฐานข้อมูล ไม่เชื่อค่าจากไคลเอนต์
// ─────────────────────────────────────────────────────────────

routerAdd('POST', '/api/public/orders', (c) => {
  // ค่าคงที่ทั้งหมดประกาศในนี้ตรงๆ — อ้างตัวแปรระดับไฟล์จาก callback ไม่ได้
  // (ดูคำอธิบายข้อจำกัดของ PocketBase JSVM ที่หัวไฟล์)
  const RATE_LIMIT_WINDOW_SECONDS = 60;
  const RATE_LIMIT_MAX_ORDERS = 6;
  const MAX_LINES_PER_ORDER = 40;
  const MAX_QTY_PER_LINE = 50;

  const body = $apis.requestInfo(c).data;
  const sessionId = body.sessionId;
  const inputLines = Array.isArray(body.lines) ? body.lines : [];

  if (typeof sessionId !== 'string' || !sessionId) {
    throw new BadRequestError('ไม่พบรอบนั่ง กรุณาสแกน QR ใหม่');
  }
  if (inputLines.length === 0) {
    throw new BadRequestError('ยังไม่ได้เลือกเมนู');
  }
  if (inputLines.length > MAX_LINES_PER_ORDER) {
    throw new BadRequestError('สั่งครั้งเดียวได้ไม่เกิน 40 รายการ กรุณาแบ่งสั่งหลายรอบ');
  }

  const dao = $app.dao();

  let session;
  try {
    session = dao.findRecordById('table_sessions', sessionId);
  } catch {
    throw new NotFoundError('ไม่พบรอบนั่งนี้ กรุณาสแกน QR ใหม่');
  }
  if (session.getString('closed_at')) {
    throw new BadRequestError('รอบนั่งนี้ปิดแล้ว กรุณาสแกน QR ที่โต๊ะใหม่อีกครั้ง');
  }

  const shop = dao.findRecordById('shops', session.getString('shop'));

  // จำกัดอัตรา — กันสั่งรัวๆ จากบอทหรือความผิดพลาดของแอปฝั่งลูกค้า
  //
  // ต้องใช้รูปแบบเวลาแบบเว้นวรรค "YYYY-MM-DD HH:MM:SS.sssZ" ไม่ใช่ ISO 8601
  // แบบมี "T" คั่น — ทดสอบแล้วว่า dbx (ตัวสร้าง query ของ PocketBase)
  // เทียบกับฟิลด์ created ด้วยรูปแบบนี้เท่านั้น ใช้ "T" แล้ว filter เงียบๆ
  // ไม่ match อะไรเลย (คืน 0 แถวเสมอ โดยไม่มี error ให้เห็น) ซึ่งอันตราย
  // มากสำหรับโค้ดจำกัดอัตรา เพราะแปลว่าการจำกัดอัตราจะไม่ทำงานเงียบๆ
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000)
    .toISOString()
    .replace('T', ' ');
  const recent = dao.findRecordsByFilter(
    'orders',
    'table_session = {:session} && created >= {:since}',
    '-created',
    RATE_LIMIT_MAX_ORDERS + 1,
    0,
    { session: sessionId, since },
  );
  if (recent.length >= RATE_LIMIT_MAX_ORDERS) {
    throw new ApiError(429, 'สั่งถี่เกินไป กรุณารอสักครู่แล้วลองใหม่');
  }

  // ── ตรวจแต่ละรายการกับฐานข้อมูลจริง ห้ามเชื่อราคา/ชื่อจากไคลเอนต์ ──
  const lines = [];
  const soldOutNames = [];

  for (const raw of inputLines) {
    const menuItemId = typeof raw?.menuItemId === 'string' ? raw.menuItemId : '';
    const qty = Number(raw?.qty);

    if (!menuItemId || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      throw new BadRequestError('ข้อมูลรายการอาหารไม่ถูกต้อง');
    }

    let item;
    try {
      item = dao.findRecordById('menu_items', menuItemId);
    } catch {
      throw new BadRequestError('มีเมนูที่ไม่พบในระบบ กรุณาโหลดหน้าใหม่');
    }

    if (item.getString('shop') !== shop.id || !item.getBool('active')) {
      throw new BadRequestError('มีเมนูที่ไม่ใช่ของร้านนี้หรือถูกปิดไปแล้ว');
    }
    if (item.getBool('sold_out')) {
      soldOutNames.push(item.getString('name'));
      continue;
    }

    const note = typeof raw?.note === 'string' ? raw.note.slice(0, 200) : '';
    const orderedBy = typeof raw?.orderedBy === 'string' ? raw.orderedBy.slice(0, 40) : '';

    lines.push({
      clientUuid: $security.randomString(32),
      menuItemId: item.id,
      // ชื่อและราคามาจากฐานข้อมูล ณ เวลานี้เท่านั้น — จุดที่กันไคลเอนต์โกงราคา
      nameSnapshot: item.getString('name'),
      unitPrice: item.getInt('price'),
      qty,
      note,
      orderedBy,
    });
  }

  if (soldOutNames.length > 0) {
    throw new BadRequestError(
      `ของหมดแล้ว: ${soldOutNames.join(', ')} กรุณาเอาออกจากตะกร้าแล้วลองใหม่`,
    );
  }
  if (lines.length === 0) {
    throw new BadRequestError('ทุกรายการที่สั่งของหมดแล้ว');
  }

  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const status = shop.getString('qr_order_mode') === 'auto' ? 'open' : 'pending';

  let created;
  dao.runInTransaction((txDao) => {
    // เลขบิลของ QR order เดินหน้า "ลง" (ติดลบ) แยกพื้นที่ตัวเลขจากเลขบิล
    // ของ POS ที่เดินหน้า "ขึ้น" จากช่วงที่แต่ละเครื่องจองไว้ (1001–2000, ...)
    //
    // ทำแบบนี้เพราะ POS ทำงานออฟไลน์ได้ ต้องรู้ช่วงเลขของตัวเองล่วงหน้า
    // โดยไม่ถามเซิร์ฟเวอร์ทุกครั้ง ส่วน QR order ต้องออนไลน์อยู่แล้ว
    // (ลูกค้าใช้เน็ตของตัวเอง) จึงถามเซิร์ฟเวอร์ได้ทุกครั้งอย่างปลอดภัย
    // ถ้าใช้เลขบวกร่วมพื้นที่เดียวกัน จะมีโอกาสชนกับเลขที่เครื่อง POS
    // จองไว้ล่วงหน้าแต่ยังไม่ได้ใช้ (ออฟไลน์อยู่)
    //
    // แลกมาด้วย: นี่คือ "เลขออร์เดอร์" ชั่วคราว ไม่ใช่เลขที่ใบเสร็จควรใช้
    // ตอนพนักงานปิดบิลจริงที่เคาน์เตอร์ (ก้อนถัดไป: ผูกเลขใบเสร็จจริง
    // เข้ากับ order นี้ตอนแปลงเป็นบิลที่ POS)
    const freshShop = txDao.findRecordById('shops', shop.id);
    const orderNo = (freshShop.getInt('next_qr_order_no') || 0) - 1;
    freshShop.set('next_qr_order_no', orderNo);
    txDao.saveRecord(freshShop);

    const collection = txDao.findCollectionByNameOrId('orders');
    const record = new Record(collection, {
      // orders.client_uuid บังคับความยาว 36 ตัวพอดี (min:max:36 — ตั้งไว้
      // ให้พอดีกับความยาวของ UUID v4 ที่แท็บเล็ต POS สร้าง) ต้องยาวเท่านี้
      // เป๊ะ ไม่งั้นแม้ตอนสร้างจะผ่าน (เขียนผ่าน dao.saveRecord() ในนี้
      // ไม่ผ่านการตรวจสอบฟิลด์แบบ REST ปกติ) แต่พอพนักงานกดยืนยัน/ปฏิเสธ
      // ที่ POS ซึ่งอัปเดตผ่าน REST ปกติ การตรวจสอบจะย้อนมาจับที่ฟิลด์นี้
      // ทำให้อัปเดตอะไรก็ไม่ผ่านเลยแม้จะแก้แค่ status (พบและแก้แล้วจากการทดสอบจริง)
      client_uuid: $security.randomString(36),
      shop: shop.id,
      order_no: orderNo,
      channel: 'qr',
      status,
      table_no: session.getString('table_no'),
      table_session: session.id,
      lines,
      subtotal,
      discount: 0,
      total: subtotal,
      payment: null,
    });
    txDao.saveRecord(record);
    created = record;
  });

  return c.json(201, {
    orderId: created.id,
    orderNo: created.getInt('order_no'),
    status: created.getString('status'),
    total: created.getInt('total'),
  });
});
