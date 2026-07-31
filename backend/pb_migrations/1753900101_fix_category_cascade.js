/// <reference path="../pb_data/types.d.ts" />

/**
 * แก้บั๊ก: ลบร้านทั้งร้านไม่ได้ เพราะ menu_items.category บล็อกการลบหมวด
 *
 * migration แรกตั้ง `menu_items.category` เป็น `cascadeDelete: false` โดยไม่ตั้งใจ
 * (คัดลอกจาก template แล้วลืมแก้) ทำให้เกิดปัญหาตอนลบร้านทั้งร้าน:
 * การลบ shop คาสเคดไปลบ categories และ menu_items แยกกันตามความสัมพันธ์
 * แต่ละอย่าง ถ้าระบบพยายามลบ category ก่อนที่ menu_items ที่อ้างถึงมัน
 * จะถูกลบ จะเจอ error "ไม่สามารถลบเรกคอร์ดที่ยังมี required relation ชี้มา"
 * ทันที — ลบร้านทั้งร้านไม่ได้เลย (พบตอนรัน backend/seed.mjs ซ้ำ)
 *
 * เปลี่ยนเป็น cascadeDelete: true — ไม่กระทบการป้องกัน "ลบหมวดที่ยังมีเมนู
 * ไม่ได้" ที่ทำไว้ในแอป (apps/pos/src/menu/menuActions.ts:deleteCategory)
 * เพราะจุดนั้นเป็นการตรวจสอบระดับแอปก่อนยิง API ไม่ใช่ constraint นี้
 * cascadeDelete ที่แก้ตรงนี้มีผลเฉพาะตอนลบทั้งร้าน (เคสที่ควร cascade จริง)
 */

migrate(
  (db) => {
    const dao = new Dao(db);
    const menuItems = dao.findCollectionByNameOrId('menu_items');
    menuItems.schema.getFieldByName('category').options.cascadeDelete = true;
    dao.saveCollection(menuItems);
    return null;
  },
  (db) => {
    const dao = new Dao(db);
    const menuItems = dao.findCollectionByNameOrId('menu_items');
    menuItems.schema.getFieldByName('category').options.cascadeDelete = false;
    dao.saveCollection(menuItems);
    return null;
  },
);
