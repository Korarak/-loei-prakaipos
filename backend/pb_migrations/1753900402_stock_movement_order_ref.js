/// <reference path="../pb_data/types.d.ts" />

/**
 * ผูก stock_movements กลับไปที่บิลที่ทำให้เกิดการตัดสต๊อกอัตโนมัติ
 * (backend/pb_hooks/stock_deduct.pb.js) — ใช้ 2 อย่าง:
 *
 * 1. กัน hook ยิงตัดสต๊อกซ้ำถ้าถูกเรียกมากกว่าหนึ่งครั้งสำหรับบิลเดียวกัน
 *    (เช็คว่ามีแถว type=deduct ที่ order นี้แล้วหรือยังก่อนตัดซ้ำ)
 * 2. ตอนยกเลิกบิล (void) ต้องหาแถวที่ตัดไปแล้วของบิลนั้นเพื่อคืนสต๊อก
 *
 * ไม่ผูก cascadeDelete เพราะ order ถูกลบจริงไม่ได้อยู่แล้ว (deleteRule: null)
 * แต่กันเผื่อไว้ไม่ให้การลบ order (ถ้ามีในอนาคต) ไปลบเลดเจอร์สต๊อกตามไปด้วย
 */

migrate(
  (db) => {
    const dao = new Dao(db);
    const orders = dao.findCollectionByNameOrId('orders');
    const movements = dao.findCollectionByNameOrId('stock_movements');
    movements.schema.addField(
      new SchemaField({
        name: 'order',
        type: 'relation',
        required: false,
        options: { collectionId: orders.id, maxSelect: 1, cascadeDelete: false },
      }),
    );
    dao.saveCollection(movements);
    return null;
  },
  (db) => {
    const dao = new Dao(db);
    const movements = dao.findCollectionByNameOrId('stock_movements');
    movements.schema.removeField(movements.schema.getFieldByName('order').id);
    dao.saveCollection(movements);
    return null;
  },
);
