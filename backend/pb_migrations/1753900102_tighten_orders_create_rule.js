/// <reference path="../pb_data/types.d.ts" />

/**
 * ปิดช่องทางสร้างบิลผ่าน REST ตรงๆ แบบไม่ล็อกอิน
 *
 * กฎเดิมยอมให้ใครก็ได้ยิง POST /api/collections/orders/records ตรงๆ
 * โดยไม่ล็อกอิน ถ้าใส่ channel="qr" && status="pending" มา — ซึ่งเป็น
 * ประตูที่เปิดไว้ชั่วคราวก่อนจะมี pb_hooks/qr_order.pb.js
 *
 * ตอนนี้ทุกออร์เดอร์จาก QR ต้องผ่าน POST /api/public/orders เท่านั้น
 * เพราะ hook นั้นตรวจลายเซ็น HMAC, คำนวณราคาจากฐานข้อมูลจริง, และจำกัด
 * อัตราการสั่ง — ทั้งหมดนี้ REST ตรงไม่มีทางทำได้ การเขียนเข้าฐานข้อมูล
 * จากภายใน hook ใช้ dao.saveRecord() ซึ่งเป็นระดับแอดมิน ไม่ผ่าน createRule
 * นี้อยู่แล้ว จึงปิดประตู REST ตรงได้โดยไม่กระทบเส้นทาง QR ที่ถูกต้อง
 */

migrate(
  (db) => {
    const dao = new Dao(db);
    const orders = dao.findCollectionByNameOrId('orders');
    orders.createRule = '@request.auth.id != ""';
    dao.saveCollection(orders);
    return null;
  },
  (db) => {
    const dao = new Dao(db);
    const orders = dao.findCollectionByNameOrId('orders');
    orders.createRule =
      '@request.auth.id != "" || (@request.data.channel = "qr" && @request.data.status = "pending")';
    dao.saveCollection(orders);
    return null;
  },
);
