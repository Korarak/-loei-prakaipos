/// <reference path="../pb_data/types.d.ts" />

/**
 * ประเภทของหมวด — อาหาร (`food`) หรือเครื่องดื่ม (`drink`)
 *
 * ติดที่ระดับ "หมวด" ไม่ใช่ "เมนูรายตัว" โดยตั้งใจ (ดูเหตุผลเต็มใน
 * packages/shared/src/types.ts) หน้าขายและหน้าลูกค้าใช้ค่านี้จัดกลุ่ม
 * อาหารขึ้นก่อนเครื่องดื่ม และใส่ไอคอนกำกับให้กวาดตาหาเร็วขึ้น
 *
 * ## การเติมค่าให้ร้านเดิม
 *
 * ฟิลด์ select แบบ required:false — แถวเก่าจะได้ค่าว่าง ไม่ใช่ 'food'
 * จึงตั้งทุกหมวดเดิมเป็น 'food' ไว้ก่อน แล้วเจ้าของร้าน (หรือทีมงานผ่านแอป admin)
 * มาแก้หมวดเครื่องดื่มเป็น 'drink' เอง — ไม่เดาจากชื่อเพราะพลาดง่าย ("น้ำพริก")
 * และตอนนี้แก้ได้ในไม่กี่คลิกอยู่แล้ว
 *
 * ค่า ['food', 'drink'] ตรงกับ MENU_KINDS ใน packages/shared/src/menuKind.ts
 * (PB JSVM import ไฟล์นั้นตรงๆ ไม่ได้ จึงเขียนซ้ำที่นี่ ถ้าเพิ่มประเภทใหม่ต้องแก้ทั้งสองที่)
 */

migrate(
  (db) => {
    const dao = new Dao(db);
    const categories = dao.findCollectionByNameOrId('categories');
    categories.schema.addField(
      new SchemaField({
        name: 'kind',
        type: 'select',
        required: false,
        options: { maxSelect: 1, values: ['food', 'drink'] },
      }),
    );
    dao.saveCollection(categories);

    db.newQuery("UPDATE categories SET kind = 'food' WHERE kind = '' OR kind IS NULL").execute();

    return null;
  },
  (db) => {
    const dao = new Dao(db);
    const categories = dao.findCollectionByNameOrId('categories');
    categories.schema.removeField(categories.schema.getFieldByName('kind').id);
    dao.saveCollection(categories);
    return null;
  },
);
