import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { TablePage } from './TablePage.js';
import './styles.css';

/**
 * เส้นทางเดียวที่ใช้จริงคือ /t/{รหัสร้าน}/{เลขโต๊ะ}
 * ซึ่งตรงกับที่พิมพ์ลงสติกเกอร์ QR ประจำโต๊ะ (เอกสารออกแบบหัวข้อ 07)
 *
 * ค้างไว้: ยังไม่ตรวจพารามิเตอร์ ?k= ที่เป็นลายเซ็น HMAC
 * ต้องทำก่อนเปิดให้ร้านจริงใช้
 */
function NotFound() {
  return (
    <div className="center">
      <p>ลิงก์ไม่ถูกต้อง</p>
      <p className="muted">กรุณาสแกน QR ที่โต๊ะของคุณอีกครั้ง</p>
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('ไม่พบ element #root');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/t/:shopCode/:tableNo" element={<TablePage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
