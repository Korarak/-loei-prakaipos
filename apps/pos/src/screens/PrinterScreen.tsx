import { Unplug } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  forgetPrinter,
  getPrinterPairing,
  isPrinterSupported,
  pairPrinter,
  type PrinterPairing,
} from '../printing/bluetoothPrinter.js';

/**
 * ตั้งค่าเครื่องพิมพ์ใบเสร็จ — จับคู่ครั้งเดียวต่อแท็บเล็ต ใช้ได้ทุกบิลหลังจากนั้น
 *
 * เป็นค่าตั้งของ "เครื่องนี้" ไม่ใช่ของร้าน เพราะเครื่องพิมพ์ Bluetooth จับคู่กับ
 * แท็บเล็ตเครื่องเดียว ร้านที่มีหลายเครื่องต้องจับคู่แยกทุกเครื่อง
 */
export function PrinterScreen() {
  const supported = isPrinterSupported();
  const [pairing, setPairing] = useState<PrinterPairing | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getPrinterPairing().then((p) => {
      setPairing(p);
      setLoading(false);
    });
  }, []);

  async function handlePair() {
    setBusy(true);
    setError(null);
    try {
      const result = await pairPrinter();
      setPairing(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'จับคู่เครื่องพิมพ์ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function handleForget() {
    await forgetPrinter();
    setPairing(null);
  }

  return (
    <>
        {!supported ? (
          <div className="panel">
            <h1>เครื่องนี้พิมพ์ใบเสร็จไม่ได้</h1>
            <p className="muted">
              การพิมพ์ผ่าน Bluetooth ใช้ได้เฉพาะ Chrome บน Android เท่านั้น
              iPad และ Safari ไม่รองรับ — ใช้แสดงใบเสร็จบนหน้าจอแทนได้
            </p>
          </div>
        ) : loading ? (
          <p className="muted">กำลังตรวจสอบ…</p>
        ) : pairing ? (
          <div className="panel">
            <h1>จับคู่แล้ว</h1>
            <p className="muted">เครื่องพิมพ์: {pairing.deviceName}</p>
            {error && <p className="alert">{error}</p>}
            <div className="sheet__actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn" onClick={() => void handleForget()}>
                <Unplug size={16} aria-hidden="true" />
                เลิกจับคู่
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void handlePair()}
              >
                {busy ? 'กำลังจับคู่…' : 'จับคู่เครื่องใหม่'}
              </button>
            </div>
          </div>
        ) : (
          <div className="panel">
            <h1>ยังไม่ได้จับคู่เครื่องพิมพ์</h1>
            <p className="muted">
              เปิดเครื่องพิมพ์ Bluetooth ให้พร้อมจับคู่ก่อน แล้วกดปุ่มด้านล่าง —
              เบราว์เซอร์จะแสดงรายชื่ออุปกรณ์ให้เลือก
            </p>
            {error && <p className="alert">{error}</p>}
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => void handlePair()}
            >
              {busy ? 'กำลังค้นหา…' : 'จับคู่เครื่องพิมพ์'}
            </button>
          </div>
        )}
    </>
  );
}
