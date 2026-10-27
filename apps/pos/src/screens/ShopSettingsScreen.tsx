import { Check, QrCode } from 'lucide-react';
import { useState } from 'react';
import type { QrOrderMode } from '@prakaipos/shared';
import { MAX_TABLES, saveShopSettings, validateShopSettings } from '../shop/shopActions.js';
import type { ShopSettings } from '../shop/shopSettings.js';

/**
 * หน้าตั้งค่าร้าน — เจ้าของร้านตั้งเลขพร้อมเพย์ ผังโต๊ะ และโหมดรับออร์เดอร์ QR เอง
 * (เดิมต้องให้ทีมงานตั้งให้ผ่านหลังบ้าน) ต้องมีเน็ตเพราะเป็นงานตอนว่าง ไม่ใช่ตอนขาย
 */

interface ShopSettingsScreenProps {
  shopId: string;
  shop: ShopSettings | null;
  onSaved: (shop: ShopSettings | null) => void;
  onOpenTableQr: () => void;
}

export function ShopSettingsScreen({ shopId, shop, onSaved, onOpenTableQr }: ShopSettingsScreenProps) {
  const [promptpayId, setPromptpayId] = useState(shop?.promptpayId ?? '');
  const [tablesEnabled, setTablesEnabled] = useState(shop?.tablesEnabled ?? false);
  const [tableCount, setTableCount] = useState(String(shop?.tableCount ?? 0));
  const [qrOrderMode, setQrOrderMode] = useState<QrOrderMode>(shop?.qrOrderMode ?? 'staff_confirm');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const input = { promptpayId, tablesEnabled, tableCount: Number(tableCount || 0), qrOrderMode };
    const invalid = validateShopSettings(input);
    if (invalid) {
      setError(invalid);
      return;
    }

    setBusy(true);
    try {
      onSaved(await saveShopSettings(shopId, input));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h1>ตั้งค่าร้าน</h1>

      <label className="field">
        <span>เลขพร้อมเพย์ของร้าน</span>
        <input
          value={promptpayId}
          onChange={(e) => setPromptpayId(e.target.value)}
          inputMode="numeric"
          placeholder="เบอร์มือถือ 10 หลัก หรือเลขบัตร 13 หลัก"
        />
        <small className="hint">
          ใช้สร้าง QR รับเงินตามยอดบิล เงินเข้าบัญชีร้านโดยตรง ปล่อยว่างถ้ารับแต่เงินสด
        </small>
      </label>

      <div className="field">
        <span>ผังโต๊ะ</span>
        <div className="chips">
          <button
            type="button"
            className={tablesEnabled ? 'chip chip--on' : 'chip'}
            onClick={() => setTablesEnabled(true)}
          >
            เปิด
          </button>
          <button
            type="button"
            className={tablesEnabled ? 'chip' : 'chip chip--on'}
            onClick={() => setTablesEnabled(false)}
          >
            ปิด
          </button>
        </div>
      </div>

      <label className="field">
        <span>จำนวนโต๊ะ (สูงสุด {MAX_TABLES})</span>
        <input
          value={tableCount}
          onChange={(e) => setTableCount(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          placeholder="เช่น 10"
        />
      </label>

      <div className="field">
        <span>เมื่อลูกค้าสั่งผ่าน QR</span>
        <div className="chips">
          <button
            type="button"
            className={qrOrderMode === 'staff_confirm' ? 'chip chip--on' : 'chip'}
            onClick={() => setQrOrderMode('staff_confirm')}
          >
            รอพนักงานยืนยัน
          </button>
          <button
            type="button"
            className={qrOrderMode === 'auto' ? 'chip chip--on' : 'chip'}
            onClick={() => setQrOrderMode('auto')}
          >
            เข้าครัวทันที
          </button>
        </div>
      </div>

      {error && <p className="alert">{error}</p>}
      {saved && <p className="hint">บันทึกแล้ว</p>}

      <div className="sheet__actions">
        <button type="button" className="btn" onClick={onOpenTableQr}>
          <QrCode size={16} aria-hidden="true" />
          QR สั่งอาหารประจำโต๊ะ
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          <Check size={16} aria-hidden="true" />
          {busy ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>
    </form>
  );
}
