/// <reference path="../pb_data/types.d.ts" />

/**
 * เบอร์ติดต่อร้าน — เก็บไว้ตอนสมัครเองผ่าน /api/public/signup
 *
 * ใช้ติดต่อกลับตอนต้องช่วยเหลือ (ลืมรหัสร้าน, ปัญหาเรื่องชำระเงิน ฯลฯ)
 * ไม่บังคับกรอก เพราะร้านที่เปิดให้ทีมงานสมัครแทน (เอกสารออกแบบหัวข้อ 01 เดิม)
 * อาจไม่มีข้อมูลนี้
 */

migrate(
  (db) => {
    const dao = new Dao(db);
    const shops = dao.findCollectionByNameOrId('shops');
    shops.schema.addField(
      new SchemaField({
        name: 'contact_phone',
        type: 'text',
        required: false,
        options: { max: 20 },
      }),
    );
    dao.saveCollection(shops);
    return null;
  },
  (db) => {
    const dao = new Dao(db);
    const shops = dao.findCollectionByNameOrId('shops');
    shops.schema.removeField(shops.schema.getFieldByName('contact_phone').id);
    dao.saveCollection(shops);
    return null;
  },
);
