/// <reference path="../pb_data/types.d.ts" />

/**
 * กันพนักงาน (role != "owner") แก้ฟิลด์อื่นของเมนูนอกจาก sold_out
 *
 * `menu_items.updateRule` เปิดให้ทุกคนในร้าน (@request.auth.shop = shop) แก้
 * record เมนูได้ทั้งใบ เพราะพนักงานต้องกดปุ่ม "ของหมด" ได้เอง — แต่ PocketBase
 * ไม่มี field-level rule ในเวอร์ชันนี้ (updateRule ตรวจได้แค่ระดับ record ทั้งใบ)
 * แปลว่าถ้าไม่มี hook นี้ พนักงานจะ PATCH ราคา/ชื่อ/สูตรอาหารของเมนูได้เองผ่าน
 * REST ตรงๆ เลย ปัญหาเดียวกับที่แก้ไว้ใน shop_plan_guard.pb.js (ดูคอมเมนต์ที่นั่น
 * สำหรับที่มาของแพทเทิร์นนี้)
 *
 * ทางแก้: ก่อนบันทึกทุกครั้ง ถ้าคำขอไม่ใช่บัญชี PocketBase superuser (แอป admin)
 * และไม่ใช่พนักงานที่มี role="owner" ให้ดึงค่าเดิมของทุกฟิลด์ยกเว้น sold_out
 * กลับมาทับค่าที่ส่งมา ไม่ว่าไคลเอนต์จะพยายามส่งอะไรมาก็ตาม
 *
 * รายชื่อฟิลด์ประกาศอยู่ *ภายใน* callback เอง (ไม่ใช่ระดับบนสุดของไฟล์) เพราะ
 * ค่าคงที่ระดับบนสุดของไฟล์ .pb.js มองไม่เห็นจากภายใน callback ของ PocketBase
 * JSVM — ข้อจำกัดเดียวกับที่บันทึกไว้แล้วในหัวไฟล์ qr_order.pb.js (ทดสอบยืนยัน
 * แล้วว่าเจอ ReferenceError ทันทีถ้าประกาศไว้นอก callback)
 */

onRecordBeforeUpdateRequest((e) => {
  const info = $apis.requestInfo(e.httpContext);
  if (info.admin) return;

  const caller = info.authRecord;
  if (caller && caller.getString('role') === 'owner') return;

  const record = e.record;
  if (!record) return;

  let original;
  try {
    original = $app.dao().findRecordById('menu_items', record.id);
  } catch {
    return;
  }

  const ownerOnlyFields = [
    'shop',
    'category',
    'name',
    'price',
    'image',
    'sort_order',
    'active',
    'modifier_groups',
    'recipe',
  ];
  for (const field of ownerOnlyFields) {
    record.set(field, original.get(field));
  }
}, 'menu_items');
