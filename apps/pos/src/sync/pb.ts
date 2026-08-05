import PocketBase from 'pocketbase';

/**
 * ตัวเชื่อมกับ PocketBase
 *
 * แอปหน้าขายเรียกใช้ผ่าน outbox เป็นหลัก ไม่เรียกตรงตอนผู้ใช้กดปุ่ม
 * เพราะทุกการกระทำต้องเขียนลงเครื่องก่อนเสมอ แล้วค่อยส่งทีหลัง
 */

const baseUrl = import.meta.env.VITE_PB_URL ?? 'http://127.0.0.1:8095';

export const pb = new PocketBase(baseUrl);

// ปิด auto-cancel: PocketBase SDK ยกเลิกคำขอเดิมเมื่อมีคำขอซ้ำเส้นทาง
// ซึ่งเหมาะกับหน้าเว็บทั่วไป แต่กับคิวส่งบิลจะทำให้บิลถูกยกเลิกกลางทาง
pb.autoCancellation(false);
