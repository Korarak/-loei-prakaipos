import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { initServiceWorker } from './pwa/updates.js';
import './styles.css';

// ลงทะเบียน Service Worker แบบไม่บล็อกหน้าจอ — รายละเอียดใน pwa/updates.ts
initServiceWorker();

const root = document.getElementById('root');
if (!root) throw new Error('ไม่พบ element #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
