import { Check, KeyRound, Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { StaffProfile } from '../auth/credentials.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { createStaff, resetStaffPin, updateStaff } from '../staff/staffActions.js';
import { useStaffData, type StaffRecord } from '../staff/useStaffData.js';

/**
 * หน้าจัดการพนักงาน — เข้าได้เฉพาะเจ้าของร้าน (การ์ดนี้ไม่โผล่ในหน้าแรกให้พนักงาน
 * เห็นด้วยซ้ำ ดู HomeScreen.tsx) ฝั่งเซิร์ฟเวอร์ก็บังคับด้วย createRule/updateRule
 * ที่จำกัดไว้เป็น role=owner อยู่แล้ว หน้านี้จึงเป็นแค่ทางเข้าที่สะดวก
 * ไม่ใช่จุดเดียวที่กันสิทธิ์
 */

interface StaffScreenProps {
  shopId: string;
  shopCode: string;
  profile: StaffProfile;
}

/**
 * แปลงชื่อเป็น username ที่ผ่านการตรวจของ PocketBase ได้แน่นอน
 *
 * PocketBase บังคับ username เป็นตัวอักษรละติน/ตัวเลขเท่านั้น (ไม่รับอักษรไทย)
 * ชื่อพนักงานร้านอาหารไทยส่วนใหญ่เป็นภาษาไทยล้วน ตัดอักษรที่ไม่ใช่ ASCII ออกแล้ว
 * มักไม่เหลืออะไรเลย จึงเดาเป็นรหัสสั้นๆ แทนในกรณีนั้น — เจ้าของร้านแก้เป็น
 * username ที่ต้องการเองได้เสมอ ช่องนี้แก้ไขได้อยู่แล้วก่อนกดบันทึก
 */
function slugify(text: string): string {
  const ascii = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii || Math.random().toString(36).slice(2, 6);
}

export function StaffScreen({ shopId, shopCode, profile }: StaffScreenProps) {
  const data = useStaffData(shopId);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffRecord | 'new' | null>(null);
  const [resettingPin, setResettingPin] = useState<StaffRecord | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<StaffRecord | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      await data.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ทำรายการไม่สำเร็จ');
    }
  }

  if (data.loading) {
    return <div className="screen screen--center muted">กำลังโหลดรายชื่อพนักงาน…</div>;
  }

  return (
    <>
      <div className="app__toolbar">
        <div className="app__spacer" />
        <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
          <Plus size={16} aria-hidden="true" />
          เพิ่มพนักงาน
        </button>
      </div>

      {(error ?? data.error) && <p className="alert">{error ?? data.error}</p>}

        {data.staff.length === 0 ? (
          <div className="panel">
            <h1>ยังไม่มีพนักงาน</h1>
            <p className="muted">เพิ่มพนักงานคนแรก ตั้ง PIN ให้แล้วบอกเขาไปล็อกอินได้เลย</p>
          </div>
        ) : (
          <ul className="mlist">
            {data.staff.map((s) => (
              <li key={s.id} className={s.active ? 'mrow' : 'mrow mrow--out'}>
                <div className="mrow__info">
                  <div className="mrow__name">
                    {s.displayName}
                    {s.id === profile.staffId && ' (คุณ)'}
                  </div>
                  <div className="mrow__price">{s.username}</div>
                </div>

                <span className={s.role === 'owner' ? 'badge badge--owner' : 'badge badge--staff'}>
                  {s.role === 'owner' ? 'เจ้าของร้าน' : 'พนักงาน'}
                </span>
                {!s.active && <span className="badge badge--off">ปิดใช้งานอยู่</span>}

                <button type="button" className="linkbtn" onClick={() => setEditing(s)}>
                  <Pencil size={16} aria-hidden="true" />
                  แก้ไข
                </button>
                <button type="button" className="linkbtn" onClick={() => setResettingPin(s)}>
                  <KeyRound size={16} aria-hidden="true" />
                  ตั้ง PIN ใหม่
                </button>
                {s.id !== profile.staffId && (
                  <button
                    type="button"
                    className="linkbtn linkbtn--danger"
                    onClick={() => setConfirmToggle(s)}
                  >
                    {s.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

      {confirmToggle && (
        <ConfirmDialog
          title={
            confirmToggle.active
              ? `ปิดใช้งาน "${confirmToggle.displayName}"`
              : `เปิดใช้งาน "${confirmToggle.displayName}"`
          }
          detail={
            confirmToggle.active
              ? 'คนนี้จะล็อกอินเข้าระบบไม่ได้อีก จนกว่าจะเปิดใช้งานใหม่'
              : undefined
          }
          confirmLabel={confirmToggle.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
          danger={confirmToggle.active}
          onCancel={() => setConfirmToggle(null)}
          onConfirm={() =>
            void run(async () => {
              await updateStaff(confirmToggle.id, { active: !confirmToggle.active });
              setConfirmToggle(null);
            })
          }
        />
      )}

      {resettingPin && (
        <ResetPinDialog
          staff={resettingPin}
          onCancel={() => setResettingPin(null)}
          onSave={(pin) =>
            void run(async () => {
              await resetStaffPin(resettingPin.id, pin);
              setResettingPin(null);
            })
          }
        />
      )}

      {editing && (
        <StaffDialog
          staff={editing === 'new' ? null : editing}
          shopCode={shopCode}
          onCancel={() => setEditing(null)}
          onSave={(input) =>
            void run(async () => {
              if (editing === 'new') {
                await createStaff(shopId, input);
              } else {
                await updateStaff(editing.id, { displayName: input.displayName, role: input.role });
              }
              setEditing(null);
            })
          }
        />
      )}
    </>
  );
}

function StaffDialog({
  staff,
  shopCode,
  onCancel,
  onSave,
}: {
  staff: StaffRecord | null;
  shopCode: string;
  onCancel: () => void;
  onSave: (input: {
    username: string;
    displayName: string;
    role: 'owner' | 'staff';
    pin: string;
  }) => void;
}) {
  const [displayName, setDisplayName] = useState(staff?.displayName ?? '');
  const [username, setUsername] = useState(staff?.username ?? '');
  const [usernameTouched, setUsernameTouched] = useState(Boolean(staff));
  const [role, setRole] = useState<'owner' | 'staff'>(staff?.role ?? 'staff');
  const [pin, setPin] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);

  function changeDisplayName(value: string) {
    setDisplayName(value);
    if (!usernameTouched) {
      setUsername(value.trim() ? `${shopCode}-${slugify(value)}` : '');
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();

    if (!displayName.trim()) {
      setInvalid('กรอกชื่อที่แสดง');
      return;
    }
    if (!username.trim()) {
      setInvalid('กรอก username');
      return;
    }
    if (!staff && (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin))) {
      setInvalid('PIN ต้องเป็นตัวเลข 4-8 หลัก');
      return;
    }

    onSave({ username: username.trim(), displayName: displayName.trim(), role, pin });
  }

  return (
    <div className="sheet">
      <form className="sheet__panel" onSubmit={submit}>
        <h2>{staff ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน'}</h2>

        <label className="field">
          <span>ชื่อที่แสดง</span>
          <input
            value={displayName}
            onChange={(e) => changeDisplayName(e.target.value)}
            placeholder="เช่น น้อง"
            required
          />
        </label>

        {!staff && (
          <label className="field">
            <span>Username (ใช้ล็อกอิน)</span>
            <input
              value={username}
              onChange={(e) => {
                setUsernameTouched(true);
                setUsername(e.target.value);
              }}
              placeholder={`${shopCode}-nong`}
              required
            />
          </label>
        )}

        <div className="field">
          <span>บทบาท</span>
          <div className="chips">
            <button
              type="button"
              className={role === 'staff' ? 'chip chip--on' : 'chip'}
              onClick={() => setRole('staff')}
            >
              พนักงาน
            </button>
            <button
              type="button"
              className={role === 'owner' ? 'chip chip--on' : 'chip'}
              onClick={() => setRole('owner')}
            >
              เจ้าของร้าน
            </button>
          </div>
        </div>

        {!staff && (
          <label className="field">
            <span>PIN เริ่มต้น (4-8 หลัก)</span>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder="1234"
              required
            />
          </label>
        )}

        {invalid && <p className="alert">{invalid}</p>}

        <div className="sheet__actions">
          <button type="button" className="btn" onClick={onCancel}>
            <X size={16} aria-hidden="true" />
            ยกเลิก
          </button>
          <button type="submit" className="btn btn--primary">
            <Check size={16} aria-hidden="true" />
            บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}

function ResetPinDialog({
  staff,
  onCancel,
  onSave,
}: {
  staff: StaffRecord;
  onCancel: () => void;
  onSave: (pin: string) => void;
}) {
  const [pin, setPin] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
      setInvalid('PIN ต้องเป็นตัวเลข 4-8 หลัก');
      return;
    }
    onSave(pin);
  }

  return (
    <div className="sheet">
      <form className="sheet__panel" onSubmit={submit}>
        <h2>ตั้ง PIN ใหม่ — {staff.displayName}</h2>
        <p className="muted">PIN เดิมจะใช้ไม่ได้ทันที บอก PIN ใหม่นี้ให้พนักงานคนนี้เอง</p>

        <label className="field">
          <span>PIN ใหม่ (4-8 หลัก)</span>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="1234"
            autoFocus
            required
          />
        </label>

        {invalid && <p className="alert">{invalid}</p>}

        <div className="sheet__actions">
          <button type="button" className="btn" onClick={onCancel}>
            <X size={16} aria-hidden="true" />
            ยกเลิก
          </button>
          <button type="submit" className="btn btn--primary">
            <Check size={16} aria-hidden="true" />
            บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}
