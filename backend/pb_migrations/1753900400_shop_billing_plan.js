/// <reference path="../pb_data/types.d.ts" />

/**
 * แผนสมาชิกของร้าน (Trial / Core / Plus) — เอกสารออกแบบหัวข้อ 11
 *
 * `plan_expires_at` ว่างสำหรับ trial (ไม่มีวันหมดอายุ แต่ถูกจำกัดด้วยฟีเจอร์
 * ไม่ใช่เวลา) ร้านที่จ่ายเงินจะมีวันหมดอายุจริงตั้งไว้ตอนบันทึกการจ่ายเงิน
 *
 * เขียนได้จากแอป admin เท่านั้น (auth ด้วยบัญชี PocketBase superuser ซึ่ง
 * ไม่ผ่าน updateRule ของ collection นี้อยู่แล้วตามพฤติกรรมปกติของ PocketBase)
 * ป้องกันร้านแก้แผนตัวเองผ่าน `shops.updateRule` เดิม (เปิดให้เจ้าของร้าน
 * แก้ record ตัวเองได้ทั้ง record เพราะ PocketBase ไม่มี field-level rule)
 * ด้วย hook แยกที่ backend/pb_hooks/shop_plan_guard.pb.js
 */

migrate(
  (db) => {
    const dao = new Dao(db);
    const shops = dao.findCollectionByNameOrId('shops');
    shops.schema.addField(
      new SchemaField({
        name: 'plan',
        type: 'select',
        required: false,
        options: { maxSelect: 1, values: ['trial', 'core', 'plus'] },
      }),
    );
    shops.schema.addField(
      new SchemaField({
        name: 'plan_expires_at',
        type: 'date',
        required: false,
        options: {},
      }),
    );
    dao.saveCollection(shops);
    return null;
  },
  (db) => {
    const dao = new Dao(db);
    const shops = dao.findCollectionByNameOrId('shops');
    shops.schema.removeField(shops.schema.getFieldByName('plan_expires_at').id);
    shops.schema.removeField(shops.schema.getFieldByName('plan').id);
    dao.saveCollection(shops);
    return null;
  },
);
