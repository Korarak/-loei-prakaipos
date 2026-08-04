/// <reference path="../pb_data/types.d.ts" />

/**
 * ตัวเลือก/ท็อปปิ้งต่อเมนู เช่น ระดับความเผ็ด, ใส่ไข่ดาว
 *
 * เก็บเป็น JSON ก้อนเดียวต่อเมนู (ไม่แยกเป็น collection ใหม่) เพราะเป็นข้อมูล
 * ที่แก้พร้อมกับเมนูเสมอ ไม่มีใครอ่าน/ค้นตัวเลือกแยกจากเมนูของมัน
 * เหมือนเหตุผลเดียวกับที่ `orders.lines` เก็บเป็น JSON ไม่ใช่ตารางแยก
 */

migrate(
  (db) => {
    const dao = new Dao(db);
    const menuItems = dao.findCollectionByNameOrId('menu_items');
    menuItems.schema.addField(
      new SchemaField({
        name: 'modifier_groups',
        type: 'json',
        required: false,
        options: { maxSize: 16384 },
      }),
    );
    dao.saveCollection(menuItems);
    return null;
  },
  (db) => {
    const dao = new Dao(db);
    const menuItems = dao.findCollectionByNameOrId('menu_items');
    menuItems.schema.removeField(menuItems.schema.getFieldByName('modifier_groups').id);
    dao.saveCollection(menuItems);
    return null;
  },
);
