/// <reference path="../pb_data/types.d.ts" />

/**
 * เส้นทางสาธารณะสำหรับหน้าลูกค้าที่สแกน QR
 *
 * ทำไมต้องมีไฟล์นี้แทนการเปิด collection `shops` ให้อ่านสาธารณะ:
 *
 * หน้าลูกค้าได้แค่ "รหัสร้าน" มาจาก URL ของ QR แต่ต้องใช้ id ของร้าน
 * เพื่อไปดึงเมนูต่อ ถ้าเปิด listRule ของ `shops` เป็นสาธารณะเพื่อให้ค้นด้วย code ได้
 * ใครก็ตามจะดึง **รายชื่อร้านลูกค้าทั้งหมดของเรา** ออกไปได้ในคำขอเดียว
 * ซึ่งเป็นข้อมูลธุรกิจที่ไม่ควรหลุด
 *
 * เส้นทางนี้ค้นได้ทีละร้านจากรหัสที่ต้องรู้อยู่ก่อน และคืนเฉพาะฟิลด์ที่หน้าลูกค้า
 * ต้องใช้จริง — ไม่คืน promptpay_id หรืออะไรที่ลูกค้าไม่ได้ใช้
 */

routerAdd('GET', '/api/public/shop/:code', (c) => {
  const code = c.pathParam('code');

  let shop;
  try {
    shop = $app.dao().findFirstRecordByFilter('shops', 'code = {:code}', { code });
  } catch {
    // ไม่บอกว่า "ไม่พบร้าน" ต่างจาก error อื่น เพื่อไม่ให้ใช้เส้นทางนี้
    // ไล่เดารหัสร้านทีละตัวได้ง่ายเกินไป
    throw new NotFoundError('ไม่พบร้านนี้');
  }

  return c.json(200, {
    id: shop.id,
    code: shop.getString('code'),
    name: shop.getString('name'),
    qrOrderMode: shop.getString('qr_order_mode'),
    tablesEnabled: shop.getBool('tables_enabled'),
  });
});
