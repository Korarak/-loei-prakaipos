/// <reference path="../pb_data/types.d.ts" />

/**
 * ผูกออร์เดอร์ QR เข้ากับเลขใบเสร็จจริง — เอกสารออกแบบหัวข้อ 07
 * ("เลขบิลของ QR order เป็นค่าติดลบ ... ยังไม่ถูกผูกเข้ากับเลขใบเสร็จจริง")
 *
 * ตอนพนักงานกด "รับเงิน" ที่โต๊ะ (apps/pos/src/screens/PayDialog.tsx)
 * ระบบสร้างบิลใหม่ channel="pos" ที่มีเลขบิลจริงจากช่วงที่เครื่องจองไว้
 * (checkout() เดียวกับบิลหน้าร้านทุกใบ) แล้วปิดออร์เดอร์ QR ต้นทางเป็น
 * status="paid" — แต่ก่อนหน้านี้ไม่มีอะไรผูกออร์เดอร์ QR (เลขติดลบ) เข้ากับ
 * บิลจริงใบนั้นเลย ทำให้ตามย้อนไม่ได้ว่าออร์เดอร์ QR ใบนี้จบที่ใบเสร็จเลขอะไร
 *
 * field นี้เก็บ `client_uuid` ของบิลจริง ไม่ใช่ PocketBase record id ตรงๆ
 * เพราะ id ของบิลใหม่ยังไม่ถูกสร้างบนเซิร์ฟเวอร์ ณ ตอนที่ต้องเขียนค่านี้ลง
 * ออร์เดอร์ QR (ทั้งสองอย่างเข้าคิว outbox พร้อมกัน อาจส่งถึงเซิร์ฟเวอร์คนละ
 * รอบถ้าเน็ตหลุดกลางทาง) — `client_uuid` สร้างขึ้นฝั่งเครื่องตั้งแต่ก่อนเรียก
 * เซิร์ฟเวอร์เลย (ดู checkout.ts) จึงรู้ค่าล่วงหน้าได้แน่นอน ต่างจาก record id
 * ที่ต้องรอเซิร์ฟเวอร์ตอบกลับก่อน ใช้ relation field ตรงๆ ไม่ได้กับสถาปัตยกรรม
 * offline-first นี้ — หาบิลจริงจาก field นี้ทำได้ด้วย
 * `orders?filter=(client_uuid="<ค่านี้>")` ซึ่งมี unique index รองรับอยู่แล้ว
 */

migrate(
  (db) => {
    const dao = new Dao(db);
    const orders = dao.findCollectionByNameOrId('orders');
    orders.schema.addField(
      new SchemaField({
        name: 'linked_order_client_uuid',
        type: 'text',
        required: false,
        options: { max: 36 },
      }),
    );
    dao.saveCollection(orders);
    return null;
  },
  (db) => {
    const dao = new Dao(db);
    const orders = dao.findCollectionByNameOrId('orders');
    orders.schema.removeField(orders.schema.getFieldByName('linked_order_client_uuid').id);
    dao.saveCollection(orders);
    return null;
  },
);
