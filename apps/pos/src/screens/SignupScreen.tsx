import { useState } from 'react';
import { pb } from '../sync/pb.js';

/**
 * สมัครร้านใหม่เอง — เปิดแพลตฟอร์มให้ผู้ประกอบการสมัครเองได้ ไม่ต้องรอทีมงานเปิดบัญชีให้
 *
 * ยังไม่มีระบบเก็บเงิน (ดู backend/README.md) ร้านที่สมัครใช้งานได้ฟรีไปก่อน
 * สมัครสำเร็จแล้วส่งกลับไปหน้าตั้งค่าเครื่องพร้อมรหัสร้าน+PIN ที่เพิ่งตั้ง
 * เพื่อให้ตั้งค่าเครื่องต่อได้เลยในขั้นตอนเดียว ไม่ต้องพิมพ์ซ้ำ
 */

interface SignupResult {
  shopCode: string;
}

export function SignupScreen({
  onDone,
  onCancel,
}: {
  onDone: (shopCode: string, ownerPin: string) => void;
  onCancel: () => void;
}) {
  const [shopName, setShopName] = useState('');
  const [shopCode, setShopCode] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [pin, setPin] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!navigator.onLine) {
      setError('การสมัครร้านต้องต่ออินเทอร์เน็ต');
      return;
    }
    if (pin.length < 4) {
      setError('PIN ต้องมีอย่างน้อย 4 หลัก');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`${pb.baseURL}/api/public/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopName: shopName.trim(),
          shopCode: shopCode.trim().toLowerCase(),
          ownerName: ownerName.trim(),
          ownerPin: pin,
          contactPhone: contactPhone.trim(),
        }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message ?? 'สมัครร้านไม่สำเร็จ กรุณาลองใหม่');
        return;
      }

      const result = body as SignupResult;
      onDone(result.shopCode, pin);
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen screen--center">
      <form className="panel setup" onSubmit={handleSubmit}>
        <h1>สมัครร้านใหม่</h1>
        <p className="muted">ใช้งานได้ฟรีตอนนี้ ยังไม่มีการเรียกเก็บเงิน</p>

        <label className="field">
          <span>ชื่อร้าน</span>
          <input
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="เช่น ครัวป้าหน่อย"
            required
          />
        </label>

        <label className="field">
          <span>รหัสร้าน (ใช้ในลิงก์ QR สั่งอาหาร)</span>
          <input
            value={shopCode}
            onChange={(e) => setShopCode(e.target.value)}
            placeholder="เช่น krua-pa-noi"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
          <small className="hint">ตัวพิมพ์เล็ก ตัวเลข หรือขีดกลางเท่านั้น แก้ทีหลังไม่ได้</small>
        </label>

        <label className="field">
          <span>ชื่อเจ้าของร้าน</span>
          <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required />
        </label>

        <label className="field">
          <span>ตั้ง PIN สำหรับเข้าระบบ</span>
          <input
            type="password"
            inputMode="numeric"
            pattern="\d*"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="4-8 หลัก"
            required
          />
        </label>

        <label className="field">
          <span>เบอร์ติดต่อ (ไม่บังคับ)</span>
          <input
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            inputMode="tel"
            placeholder="สำหรับติดต่อกลับถ้ามีปัญหา"
          />
        </label>

        {error && <p className="alert">{error}</p>}

        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? 'กำลังสมัคร…' : 'สมัครร้าน'}
        </button>
        <button type="button" className="btn btn--block" onClick={onCancel} disabled={busy}>
          มีร้านอยู่แล้ว
        </button>
      </form>
    </div>
  );
}
