import PocketBase from 'pocketbase';

/**
 * ตัวเชื่อมกับ PocketBase สำหรับหน้าลูกค้า
 *
 * ไม่มีการล็อกอิน — ลูกค้าที่สแกน QR ไม่ต้องสมัครสมาชิก
 * ทุกขั้นตอนที่เพิ่มเข้ามาทำให้ลูกค้าเลิกกลางทาง (เอกสารออกแบบหัวข้อ 07)
 */
export const pb = new PocketBase(import.meta.env.VITE_PB_URL ?? 'http://127.0.0.1:8095');
