/// <reference path="../pb_data/types.d.ts" />

/**
 * เพิ่มฟิลด์ที่ต้องใช้สำหรับ QR Order:
 *
 * - `shops.qr_secret` — กุญแจลับต่อร้าน ใช้เซ็นลายเซ็น HMAC ของลิงก์โต๊ะ
 *   ไม่เคยส่งออกไปนอกเซิร์ฟเวอร์ (เส้นทางสาธารณะ /api/public/shop/:code
 *   ไม่คืนฟิลด์นี้ — ดู pb_hooks/public_shop.pb.js)
 *
 * - `shops.next_qr_order_no` — ตัวนับสำหรับออกเลขบิลของออร์เดอร์จาก QR
 *   เดินหน้าลง (ลบ 1 ทุกครั้ง) แยกคนละพื้นที่ตัวเลขกับเลขบิลของ POS
 *   โดยตั้งใจ — ดูเหตุผลเต็มใน pb_hooks/qr_order.pb.js
 *
 * - แก้ `orders.order_no` ให้รับเลขติดลบได้ (เดิมบังคับ min: 1)
 *   เพราะ QR order ใช้เลขติดลบ
 */

migrate(
  (db) => {
    const dao = new Dao(db);

    const shops = dao.findCollectionByNameOrId('shops');
    shops.schema.addField(
      new SchemaField({
        name: 'qr_secret',
        type: 'text',
        required: false,
        options: { max: 64 },
      }),
    );
    shops.schema.addField(
      new SchemaField({
        name: 'next_qr_order_no',
        type: 'number',
        required: false,
        options: { noDecimal: true },
      }),
    );
    dao.saveCollection(shops);

    const orders = dao.findCollectionByNameOrId('orders');
    const orderNoField = orders.schema.getFieldByName('order_no');
    // เลขบิลจาก QR เป็นค่าติดลบ (ดูเหตุผลใน qr_order.pb.js) จึงต้องเอา
    // ขอบล่าง min:1 เดิมออก — ยังคง noDecimal ไว้เหมือนเดิม
    orderNoField.options.min = null;
    dao.saveCollection(orders);

    return null;
  },
  (db) => {
    const dao = new Dao(db);

    const shops = dao.findCollectionByNameOrId('shops');
    shops.schema.removeField(shops.schema.getFieldByName('qr_secret').id);
    shops.schema.removeField(shops.schema.getFieldByName('next_qr_order_no').id);
    dao.saveCollection(shops);

    const orders = dao.findCollectionByNameOrId('orders');
    const orderNoField = orders.schema.getFieldByName('order_no');
    orderNoField.options.min = 1;
    dao.saveCollection(orders);

    return null;
  },
);
