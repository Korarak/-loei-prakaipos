/// <reference path="../pb_data/types.d.ts" />

/**
 * ตั้ง PIN ใหม่ให้พนักงาน (เฉพาะเจ้าของร้าน)
 *
 * PocketBase ไม่ยอมให้เปลี่ยนฟิลด์ password ของเรกคอร์ดคนอื่นผ่าน REST update
 * ธรรมดา แม้ updateRule ของ collection จะอนุญาตก็ตาม — auth collection บังคับ
 * ว่าแก้ password ได้แค่จากเรกคอร์ดเจ้าของเองหรือแอดมินเท่านั้น การตั้ง PIN ใหม่
 * ให้พนักงานคนอื่น (เช่นตอนลืม PIN) จึงต้องผ่าน hook นี้ที่เขียนด้วย dao.saveRecord()
 * ระดับแอดมิน ข้ามข้อจำกัดนั้นได้ หลังจากตรวจสิทธิ์ผู้เรียกเองก่อนทุกครั้ง
 *
 * ทุกอย่างที่ callback ต้องใช้ต้องประกาศอยู่ภายใน callback เดียวกันเท่านั้น —
 * ข้อจำกัดของ PocketBase JSVM ที่บันทึกไว้แล้วในหัวไฟล์ qr_order.pb.js
 */

routerAdd(
  'POST',
  '/api/staff/:id/reset-pin',
  (c) => {
    const info = $apis.requestInfo(c);
    const caller = info.authRecord;

    if (!caller || caller.getString('role') !== 'owner') {
      throw new ForbiddenError('เฉพาะเจ้าของร้านเท่านั้นที่ตั้ง PIN ใหม่ได้');
    }

    const dao = $app.dao();
    const targetId = c.pathParam('id');

    let target;
    try {
      target = dao.findRecordById('staff', targetId);
    } catch {
      throw new NotFoundError('ไม่พบพนักงานคนนี้');
    }

    // กันเจ้าของร้านหนึ่งตั้ง PIN ให้พนักงานร้านอื่น
    if (target.getString('shop') !== caller.getString('shop')) {
      throw new ForbiddenError('พนักงานคนนี้ไม่ได้อยู่ร้านเดียวกัน');
    }

    const pin = info.data.pin;
    if (typeof pin !== 'string' || pin.length < 4 || pin.length > 8) {
      throw new BadRequestError('PIN ต้องเป็นตัวเลข 4-8 หลัก');
    }

    target.setPassword(pin);
    dao.saveRecord(target);

    return c.json(200, { ok: true });
  },
  // จำกัดว่า token ที่ยิงเข้ามาต้องเป็นบัญชีจาก collection "staff" เท่านั้น
  // (เจ้าของร้านที่ล็อกอินอยู่) กันไม่ให้ token จาก auth collection อื่นเรียกได้
  $apis.requireRecordAuth('staff'),
);
