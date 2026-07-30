import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // ไม่อัปเดตอัตโนมัติกลางคัน — ถ้ารีโหลดเองตอนพนักงานกำลังเปิดบิลอยู่
      // รายการในตะกร้าอาจหาย ให้ขึ้นปุ่มถามก่อนแทน (ดู UpdatePrompt)
      includeAssets: ['favicon.svg', 'icon-maskable.svg'],
      manifest: {
        name: 'PrakaiPOS — หน้าขาย',
        short_name: 'PrakaiPOS',
        description: 'ระบบขายหน้าร้านสำหรับร้านอาหารเล็ก',
        lang: 'th',
        start_url: '/',
        display: 'standalone',
        // แท็บเล็ตหน้าร้านวางตามแนวนอนเสมอ
        orientation: 'landscape',
        background_color: '#fbfaf8',
        theme_color: '#b8562f',
        // ใช้ SVG แบบ sizes:"any" — Chrome ยอมรับสำหรับเกณฑ์การติดตั้ง PWA
        // และไม่ต้องดูแลไฟล์ภาพหลายขนาด
        //
        // ค้างไว้: iOS ไม่อ่าน manifest icons ต้องเพิ่ม apple-touch-icon เป็น PNG
        // ก่อนทดสอบบน iPad จริง (ก้อนที่ 1 งานทดสอบร้านนำร่อง)
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          {
            src: 'icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // หน้าขายต้องเปิดได้แม้เน็ตหลุดสนิท จึงแคชทุกอย่างที่จำเป็นไว้ล่วงหน้า
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // รูปเมนูจาก PocketBase — แคชไว้ใช้ตอนออฟไลน์ได้
            urlPattern: /\/api\/files\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'menu-images',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // ข้อมูลจาก API ห้ามเสิร์ฟจากแคช — ความจริงอยู่ที่ IndexedDB ในเครื่อง
            // ถ้าปล่อยให้ Service Worker คืนข้อมูลเก่าจะเกิดสภาพ "เห็นยอดไม่ตรง"
            // ที่หาสาเหตุยากมาก
            urlPattern: /\/api\/collections\/.*/,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        // เปิดไว้เพื่อทดสอบพฤติกรรมออฟไลน์ตอน dev ได้โดยไม่ต้อง build ก่อน
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      // ชี้ไปที่ซอร์สโดยตรง เพื่อให้แก้ shared แล้ว hot reload ทันที
      // ไม่ต้องรัน build ของ shared คั่นระหว่างพัฒนา
      '@prakaipos/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    // เปิดให้เข้าจากแท็บเล็ตในวงแลนได้ — ต้องทดสอบบนเครื่องจริงตั้งแต่แรก
    // เพราะปัญหาเรื่องขนาดปุ่มและการตอบสนองไม่โผล่บนเดสก์ท็อป
    host: true,
  },
});
