import { buildPromptPayPayload, formatBaht, type Satang } from '@prakaipos/shared';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/**
 * QR รับเงินพร้อมเพย์
 *
 * สร้าง payload และวาดภาพ QR **ในเครื่องทั้งหมด** ไม่เรียก API ธนาคาร
 * จึงใช้ได้ตอนเน็ตหลุด ซึ่งเป็นเหตุผลหลักที่เลือกวิธีนี้
 * (เอกสารออกแบบหัวข้อ 04)
 *
 * ระบบเรา **ไม่เคยถือเงินของร้าน** — เงินโอนเข้าบัญชีร้านตรง
 * เราเป็นแค่คนสร้าง QR ซึ่งเลี่ยงการเข้าข่ายต้องขอใบอนุญาต e-Money
 * จาก ธปท. (เอกสารออกแบบหัวข้อ 12)
 */

interface PromptPayQRProps {
  promptpayId: string;
  amount: Satang;
  size?: number;
}

export function PromptPayQR({ promptpayId, amount, size = 260 }: PromptPayQRProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    try {
      const payload = buildPromptPayPayload({ promptpayId, amount });

      void QRCode.toDataURL(payload, {
        width: size,
        margin: 1,
        // ระดับ M ทนรอยเปื้อนได้พอสมควรโดยไม่ทำให้ลายถี่จนกล้องมือถือรุ่นเก่าอ่านยาก
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#ffffff' },
      })
        .then((url) => {
          if (!cancelled) setDataUrl(url);
        })
        .catch(() => {
          if (!cancelled) setError('สร้างภาพ QR ไม่สำเร็จ');
        });
    } catch (err) {
      // เลขพร้อมเพย์ผิดรูปแบบ — ต้องบอกให้ชัด ดีกว่าโชว์ QR ที่เงินไปผิดบัญชี
      setError(err instanceof Error ? err.message : 'เลขพร้อมเพย์ไม่ถูกต้อง');
    }

    return () => {
      cancelled = true;
    };
  }, [promptpayId, amount, size]);

  if (error) {
    return (
      <div className="ppq">
        <p className="alert">{error}</p>
        <p className="hint">
          ตั้งเลขพร้อมเพย์ของร้านให้ถูกต้องก่อน แล้วรับเงินสดไปก่อนในระหว่างนี้
        </p>
      </div>
    );
  }

  return (
    <div className="ppq">
      {dataUrl ? (
        <img className="ppq__img" src={dataUrl} alt="QR พร้อมเพย์" width={size} height={size} />
      ) : (
        <div className="ppq__placeholder" style={{ width: size, height: size }} />
      )}
      <div className="ppq__amount">{formatBaht(amount)}</div>
      <p className="hint">ให้ลูกค้าสแกนด้วยแอปธนาคาร · เงินเข้าบัญชีร้านโดยตรง</p>
    </div>
  );
}
