/// <reference path="../pb_data/types.d.ts" />

/**
 * เปิดช่องให้เจ้าของร้านสร้างพนักงานเองได้จากในแอป
 *
 * เดิม createRule เป็น null — ไม่มีใครสร้างพนักงานผ่าน REST ได้เลย แม้แต่เจ้าของ
 * ต้องใช้ backend/seed.mjs กับสิทธิ์แอดมินเท่านั้น ตอนนี้เพิ่มหน้าจัดการพนักงาน
 * ในแอปแล้ว จึงเปิดให้ owner สร้างพนักงานของร้านตัวเองได้ตรงๆ ผ่าน REST create
 * (เงื่อนไข shop = @request.auth.shop กันไม่ให้สร้างพนักงานให้ร้านอื่น)
 *
 * updateRule/deleteRule ไม่แตะ — ปิดใช้งานทำผ่าน update (active=false) ได้อยู่แล้ว
 * ไม่รองรับลบถาวรโดยตั้งใจ ตรงกับหลัก "ไม่ลบทิ้ง เปลี่ยนสถานะ" ของทั้งโปรเจกต์
 */

migrate(
  (db) => {
    const dao = new Dao(db);
    const staff = dao.findCollectionByNameOrId('staff');
    staff.createRule = 'shop = @request.auth.shop && @request.auth.role = "owner"';
    dao.saveCollection(staff);
    return null;
  },
  (db) => {
    const dao = new Dao(db);
    const staff = dao.findCollectionByNameOrId('staff');
    staff.createRule = null;
    dao.saveCollection(staff);
    return null;
  },
);
