import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * แอปแอดมินกลาง — สำหรับทีมงาน PrakaiPOS ดูแลหลายร้านในบัญชีเดียว
 *
 * ล็อกอินด้วยบัญชีแอดมินของ PocketBase เอง (ตัวเดียวกับที่เข้า
 * http://127.0.0.1:8095/_/) ไม่ใช่บัญชีพนักงานร้าน — แยกแอปออกมาต่างหาก
 * เพราะสิทธิ์ต่างกันคนละระดับ ไม่ควรปนกับแอปหน้าร้าน (apps/pos) หรือ
 * แอปลูกค้า (apps/order)
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
    port: 5185,
    host: true,
  },
});
