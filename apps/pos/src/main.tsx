import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App.js';
import './styles.css';

/**
 * ลงทะเบียน Service Worker แบบถามก่อนอัปเดต
 *
 * ไม่รีโหลดเองอัตโนมัติ เพราะถ้ารีโหลดตอนพนักงานกำลังกดบิลอยู่
 * รายการในตะกร้าจะหาย ซึ่งทำลายความเชื่อถือเร็วกว่าการได้เวอร์ชันใหม่ช้าไปหนึ่งวัน
 */
const updateSW = registerSW({
  onNeedRefresh() {
    // TODO: เปลี่ยนเป็นแถบแจ้งเตือนในแอปตอนทำหน้าขายจริง
    // confirm() บล็อกทั้งหน้าจอ ซึ่งไม่เหมาะกับการใช้งานหน้าร้าน
    if (window.confirm('มีเวอร์ชันใหม่ ต้องการอัปเดตตอนนี้หรือไม่?')) {
      void updateSW(true);
    }
  },
  onOfflineReady() {
    console.info('พร้อมใช้งานแบบออฟไลน์แล้ว');
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('ไม่พบ element #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
