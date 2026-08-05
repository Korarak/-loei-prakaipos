/// <reference path="../pb_data/types.d.ts" />

/**
 * กันร้านแก้แผนสมาชิกของตัวเองผ่าน shops.updateRule เดิม
 *
 * `shops.updateRule` เปิดให้เจ้าของร้าน (@request.auth.role = "owner") แก้
 * record ร้านตัวเองได้ — แต่ PocketBase ไม่มี field-level rule ในเวอร์ชันนี้
 * (updateRule ตรวจได้แค่ระดับ record ทั้งใบ) แปลว่าถ้าไม่มี hook นี้ เจ้าของร้าน
 * จะ PATCH ฟิลด์ `plan`/`plan_expires_at` ของตัวเองผ่าน REST ตรงๆได้เลย
 * (เช่นตั้งเป็น "plus" เอง) ซึ่งเท่ากับปลอมแผนสมาชิกได้ฟรี
 *
 * ทางแก้: ก่อนบันทึกทุกครั้ง ถ้าคำขอ**ไม่ใช่**บัญชี PocketBase superuser
 * (แอป admin เท่านั้นที่ล็อกอินแบบนี้ — ดู apps/admin/src/pb.ts) ให้ดึงค่า
 * เดิมจากฐานข้อมูลกลับมาทับค่าที่ส่งมา ไม่ว่าไคลเอนต์จะพยายามส่งอะไรมาก็ตาม
 * ฟิลด์อื่นของ shops ที่เจ้าของร้านแก้เองได้ (ชื่อร้าน, พร้อมเพย์, ฯลฯ) ไม่กระทบ
 */

onRecordBeforeUpdateRequest((e) => {
  const info = $apis.requestInfo(e.httpContext);
  if (info.admin) return;

  const record = e.record;
  if (!record) return;

  let original;
  try {
    original = $app.dao().findRecordById('shops', record.id);
  } catch {
    return;
  }

  record.set('plan', original.getString('plan'));
  record.set('plan_expires_at', original.getString('plan_expires_at'));
}, 'shops');
