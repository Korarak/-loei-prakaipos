import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { knownStaff } from '../auth/credentials.js';
import type { DeviceInfo } from '../auth/device.js';
import { login, type Session } from '../auth/session.js';
import { PinPad } from '../components/PinPad.js';
import type { StaffCredential } from '../db/db.js';

/**
 * หน้าล็อก — เลือกชื่อตัวเองแล้วกด PIN
 *
 * สองแตะถึงหน้าขาย ตามหลักในเอกสารออกแบบหัวข้อ 12
 * ไม่มี dropdown ไม่ต้องพิมพ์ชื่อผู้ใช้
 */

interface LockScreenProps {
  device: DeviceInfo;
  onUnlock: (session: Session) => void;
}

export function LockScreen({ device, onUnlock }: LockScreenProps) {
  const [staff, setStaff] = useState<StaffCredential[] | null>(null);
  const [selected, setSelected] = useState<StaffCredential | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void knownStaff(device.shopId).then(setStaff);
  }, [device.shopId]);

  const handlePin = useCallback(
    async (pin: string) => {
      if (!selected) return;
      setBusy(true);
      setError(null);

      const result = await login(selected.username, pin, selected.staffId);

      setBusy(false);
      if (result.ok) {
        onUnlock(result.session);
        return;
      }

      switch (result.reason) {
        case 'wrong_pin':
          setError(
            result.attemptsLeft > 0
              ? `PIN ไม่ถูกต้อง เหลืออีก ${result.attemptsLeft} ครั้ง`
              : 'PIN ไม่ถูกต้อง',
          );
          break;
        case 'locked':
          setError(`กรอกผิดหลายครั้ง กรุณารออีก ${result.secondsLeft} วินาที`);
          break;
        case 'unknown_staff':
          setError('ต้องเข้าระบบครั้งแรกตอนมีอินเทอร์เน็ต');
          break;
        case 'server':
          setError(result.message);
          break;
        default:
          setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
      }
    },
    [selected, onUnlock],
  );

  if (staff === null) {
    return <div className="screen screen--center muted">กำลังโหลด…</div>;
  }

  // ยังไม่มีใครเคยเข้าระบบบนเครื่องนี้เลย — เกิดหลังตั้งค่าเครื่องใหม่ๆ
  if (staff.length === 0) {
    return (
      <div className="screen screen--center">
        <div className="panel">
          <h1>{device.shopName}</h1>
          <p className="muted">
            ยังไม่มีพนักงานคนใดเข้าระบบบนเครื่องนี้
            <br />
            พนักงานต้องเข้าระบบครั้งแรกตอนมีอินเทอร์เน็ต หลังจากนั้นเข้าได้ตลอดแม้เน็ตหลุด
          </p>
          <FirstTimeLogin device={device} onUnlock={onUnlock} />
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="screen screen--center">
        <div className="panel panel--wide">
          <div className="lock__shop">{device.shopName}</div>
          <h1>ใครกำลังใช้งาน</h1>
          <div className="lock__people">
            {staff.map((s) => (
              <button
                key={s.staffId}
                type="button"
                className="person"
                onClick={() => {
                  setSelected(s);
                  setError(null);
                }}
              >
                <span className="person__initial">{s.displayName.slice(0, 1)}</span>
                <span className="person__name">{s.displayName}</span>
                {s.role === 'owner' && <span className="person__role">เจ้าของ</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen screen--center">
      <div className="panel">
        <button
          type="button"
          className="lock__back"
          onClick={() => {
            setSelected(null);
            setError(null);
          }}
        >
          <ArrowLeft size={16} aria-hidden="true" /> เปลี่ยนคน
        </button>
        <h1 className="lock__who">{selected.displayName}</h1>
        <PinPad onSubmit={handlePin} disabled={busy} error={error} />
      </div>
    </div>
  );
}

/**
 * เข้าระบบครั้งแรกบนเครื่องนี้ — ต้องพิมพ์ชื่อผู้ใช้เอง เพราะเครื่องยังไม่รู้จักใคร
 * หลังจากนี้ชื่อจะขึ้นให้เลือกในหน้าล็อกปกติ
 */
function FirstTimeLogin({ device, onUnlock }: LockScreenProps) {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const result = await login(`${device.shopCode}-${username.trim()}`, pin);

    setBusy(false);
    if (result.ok) {
      onUnlock(result.session);
    } else if (result.reason === 'wrong_pin') {
      setError('ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง');
    } else if (result.reason === 'server') {
      setError(result.message);
    } else {
      setError('ต้องต่ออินเทอร์เน็ตเพื่อเข้าระบบครั้งแรก');
    }
  }

  return (
    <form className="setup" onSubmit={submit}>
      <label className="field">
        <span>ชื่อผู้ใช้</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="เช่น owner หรือ staff"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
        />
        <small className="hint">
          ชื่อเต็มคือ {device.shopCode}-{username.trim() || '…'}
        </small>
      </label>

      <label className="field">
        <span>PIN</span>
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

      {error && <p className="alert">{error}</p>}

      <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
        {busy ? 'กำลังเข้าระบบ…' : 'เข้าระบบ'}
      </button>
    </form>
  );
}
