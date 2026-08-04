/// <reference path="../pb_data/types.d.ts" />

/**
 * จำนวนโต๊ะของร้าน — ใช้วาดผังโต๊ะแบบตารางเลข 1..N (ไม่ลากวาง)
 *
 * แยกจาก `tables_enabled` (เปิด/ปิดฟีเจอร์) โดยตั้งใจ เพราะร้านอาจเปิดใช้
 * ผังโต๊ะไว้แต่ยังไม่ได้กรอกจำนวน — 0 = ยังไม่ได้ตั้งค่า หน้าจอฝั่งแอปต้อง
 * ตรวจทั้งสองฟิลด์ก่อนแสดงผังโต๊ะ ไม่ใช่แค่ tables_enabled อย่างเดียว
 *
 * ตั้งค่าผ่านหน้า admin ของ PocketBase เหมือนฟิลด์ตั้งค่าร้านตัวอื่น
 * (promptpay_id, qr_order_mode) ที่ยังไม่มีหน้าจอแก้ไขในแอปเอง
 */

migrate(
  (db) => {
    const dao = new Dao(db);
    const shops = dao.findCollectionByNameOrId('shops');
    shops.schema.addField(
      new SchemaField({
        name: 'table_count',
        type: 'number',
        required: false,
        options: { min: 0, max: 200, noDecimal: true },
      }),
    );
    dao.saveCollection(shops);
    return null;
  },
  (db) => {
    const dao = new Dao(db);
    const shops = dao.findCollectionByNameOrId('shops');
    shops.schema.removeField(shops.schema.getFieldByName('table_count').id);
    dao.saveCollection(shops);
    return null;
  },
);
