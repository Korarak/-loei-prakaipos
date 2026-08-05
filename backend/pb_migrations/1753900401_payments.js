/// <reference path="../pb_data/types.d.ts" />

/**
 * เลดเจอร์การจ่ายเงินรายปี — เอกสารออกแบบหัวข้อ 11
 *
 * เก็บเงินแบบ manual (โอน/พร้อมเพย์เก็บเอง ไม่มี payment gateway ตามที่
 * เอกสารตั้งใจไว้เพื่อลดจำนวนครั้งที่ต้องตามเก็บสำหรับคนทำคนเดียว) — ที่นี่
 * เก็บแค่ "บันทึกว่าใครจ่ายแล้วเท่าไรเมื่อไร" ไม่ใช่ตัวประมวลผลการจ่ายเงินจริง
 *
 * เขียนได้จากแอป admin เท่านั้น (บัญชี PocketBase superuser) — createRule/
 * updateRule/deleteRule/listRule/viewRule ทั้งหมดเป็น null โดยตั้งใจ เพราะ
 * เป็นข้อมูลการเงินที่ไม่ควรเปิดให้ร้านอ่าน/เขียนเองผ่าน REST เลย
 */

migrate(
  (db) => {
    const dao = new Dao(db);
    const shops = dao.findCollectionByNameOrId('shops');

    const payments = new Collection({
      name: 'payments',
      type: 'base',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      schema: [
        {
          name: 'shop',
          type: 'relation',
          required: true,
          options: { collectionId: shops.id, maxSelect: 1, cascadeDelete: true },
        },
        {
          name: 'plan',
          type: 'select',
          required: true,
          options: { maxSelect: 1, values: ['core', 'plus'] },
        },
        // หน่วยสตางค์ — ตรงกับกติกาเงินทุกจำนวนในระบบ (ดู packages/shared/src/types.ts)
        // เพื่อให้ formatBaht()/การรวมยอดในอนาคตใช้ฟังก์ชันเดียวกับยอดขายได้เลย
        { name: 'amount', type: 'number', required: true, options: { min: 0, noDecimal: true } },
        { name: 'paid_at', type: 'date', required: true, options: {} },
        { name: 'note', type: 'text', required: false, options: { max: 200 } },
        // ชื่อคนบันทึก — เก็บเป็นข้อความอิสระเพราะแอป admin ล็อกอินด้วยบัญชี
        // PocketBase superuser ไม่มี context พนักงาน/เจ้าของร้านให้ relate
        { name: 'recorded_by', type: 'text', required: false, options: { max: 80 } },
      ],
      indexes: ['CREATE INDEX idx_payments_shop ON payments (shop, created)'],
    });
    dao.saveCollection(payments);
    return null;
  },
  (db) => {
    const dao = new Dao(db);
    dao.deleteCollection(dao.findCollectionByNameOrId('payments'));
    return null;
  },
);
