import { useState } from 'react';
import { buildDevice, saveDevice } from '../auth/device.js';
import { login } from '../auth/session.js';
import { pb } from '../sync/pb.js';

/**
 * หน้าตั้งค่าเครื่องครั้งแรก — ทำครั้งเดียวตอนไปติดตั้งที่ร้าน
 *
 * ต้องมีเน็ต เพราะต้องยืนยันกับเซิร์ฟเวอร์ว่ารหัสร้านและ PIN เจ้าของถูกต้อง
 * และต้องรู้ว่าร้านนี้มีเครื่องอยู่แล้วกี่เครื่อง เพื่อจองช่วงเลขบิลไม่ให้ชนกัน
 */

interface PublicShop {
  id: string;
  code: string;
  name: string;
}

interface DeviceRecord {
  device_index: number;
}

export function SetupScreen({ onDone }: { onDone: () => void }) {
  const [shopCode, setShopCode] = useState('');
  const [pin, setPin] = useState('');
  const [deviceName, setDeviceName] = useState('แท็บเล็ตหน้าร้าน');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!navigator.onLine) {
      setError('การตั้งค่าเครื่องครั้งแรกต้องต่ออินเทอร์เน็ต');
      return;
    }

    setBusy(true);
    try {
      const code = shopCode.trim().toLowerCase();

      // 1. หาร้านจากรหัส — ใช้เส้นทางสาธารณะ เพราะยังไม่ได้เข้าระบบ
      const res = await fetch(`${pb.baseURL}/api/public/shop/${encodeURIComponent(code)}`);
      if (!res.ok) {
        setError('ไม่พบรหัสร้านนี้ กรุณาตรวจสอบอีกครั้ง');
        return;
      }
      const shop = (await res.json()) as PublicShop;

      // 2. เข้าระบบด้วย PIN เจ้าของ — ยืนยันว่าคนตั้งค่ามีสิทธิ์จริง
      const result = await login(`${code}-owner`, pin);
      if (!result.ok) {
        setError(
          result.reason === 'wrong_pin'
            ? 'PIN ไม่ถูกต้อง'
            : result.reason === 'locked'
              ? `กรอกผิดหลายครั้ง กรุณารออีก ${result.secondsLeft} วินาที`
              : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่',
        );
        return;
      }

      // 3. ดูว่าร้านนี้มีเครื่องอยู่แล้วกี่เครื่อง เพื่อไม่ให้ช่วงเลขบิลชนกัน
      const existing = await pb.collection('devices').getFullList<DeviceRecord>({
        filter: `shop="${shop.id}"`,
      });
      const deviceIndex =
        existing.reduce((max, d) => Math.max(max, d.device_index), 0) + 1;

      const device = buildDevice({
        shopId: shop.id,
        shopCode: shop.code,
        shopName: shop.name,
        deviceIndex,
        deviceName: deviceName.trim() || `เครื่องที่ ${deviceIndex}`,
      });

      // 4. จองที่เซิร์ฟเวอร์ก่อน แล้วค่อยบันทึกลงเครื่อง
      // ถ้าสองเครื่องตั้งค่าพร้อมกันจะได้ device_index เดียวกัน
      // unique index ฝั่งเซิร์ฟเวอร์จะปฏิเสธเครื่องที่สอง แล้วเราให้ลองใหม่
      try {
        await pb.collection('devices').create({
          shop: shop.id,
          device_name: device.deviceName,
          device_index: deviceIndex,
          order_no_start: device.orderNoRange.start,
          order_no_end: device.orderNoRange.end,
          last_seen_at: new Date().toISOString(),
        });
      } catch {
        setError('มีเครื่องอื่นกำลังตั้งค่าพร้อมกัน กรุณากดยืนยันอีกครั้ง');
        return;
      }

      await saveDevice(device);
      onDone();
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen screen--center">
      <form className="panel setup" onSubmit={handleSubmit}>
        <h1>ตั้งค่าเครื่องครั้งแรก</h1>
        <p className="muted">
          ทำครั้งเดียวตอนติดตั้งที่ร้าน หลังจากนี้พนักงานเข้าระบบด้วย PIN ได้เลย
        </p>

        <label className="field">
          <span>รหัสร้าน</span>
          <input
            value={shopCode}
            onChange={(e) => setShopCode(e.target.value)}
            placeholder="เช่น krua-nong"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </label>

        <label className="field">
          <span>PIN ของเจ้าของร้าน</span>
          <input
            type="password"
            inputMode="numeric"
            pattern="\d*"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
            required
          />
        </label>

        <label className="field">
          <span>ชื่อเครื่องนี้</span>
          <input
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="เช่น แท็บเล็ตหน้าร้าน"
          />
        </label>

        {error && <p className="alert">{error}</p>}

        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? 'กำลังตั้งค่า…' : 'ตั้งค่าเครื่อง'}
        </button>

        <p className="hint">ขั้นตอนนี้ต้องต่ออินเทอร์เน็ต</p>
      </form>
    </div>
  );
}
