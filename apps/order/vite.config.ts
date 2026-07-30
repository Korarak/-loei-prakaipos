import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * แอปสำหรับลูกค้าที่สแกน QR ที่โต๊ะ
 *
 * แยกออกจากแอปหน้าขายโดยตั้งใจ เพราะหน้านี้ต้องเปิดเร็วบนสัญญาณอ่อน
 * ถ้ารวมอยู่ในบันเดิลเดียวกับ POS ลูกค้าจะต้องโหลดโค้ด Dexie, ระบบซิงก์
 * และหน้าจัดการเมนูทั้งหมดโดยไม่ได้ใช้เลย — คนที่รอโหลดนานจะเลิกกลางทาง
 * (เอกสารออกแบบหัวข้อ 07)
 *
 * **ไม่มี Service Worker โดยตั้งใจ** ลูกค้าเปิดหน้านี้ครั้งเดียวแล้วจบ
 * การติดตั้ง SW ลงเครื่องลูกค้าไม่ได้ประโยชน์ แต่สร้างปัญหาเรื่องแคชค้าง
 * เวลาร้านแก้เมนูแล้วลูกค้ายังเห็นของเก่า
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@prakaipos/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5174,
    host: true,
  },
});
