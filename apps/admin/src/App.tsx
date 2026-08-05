import { bahtToSatang, formatBaht } from '@prakaipos/shared';
import { ArrowLeft, LogOut, Store } from 'lucide-react';
import { useEffect, useState } from 'react';
import { loginAsAdmin, logout, pb } from './pb.js';

const PLAN_LABEL: Record<string, string> = { trial: 'Trial', core: 'Core', plus: 'Plus' };

/** ว่าง = ร้านเก่าก่อนมีระบบแผนสมาชิก ถือเหมือน trial */
function planLabel(plan: string, expiresAt: string): string {
  const label = PLAN_LABEL[plan] ?? 'Trial';
  if (plan === 'trial' || !plan) return label;
  return expiresAt ? `${label} (ถึง ${expiresAt.slice(0, 10)})` : label;
}

/**
 * แอดมินกลาง — ดูภาพรวมทุกร้านในระบบ
 *
 * v1: ดูอย่างเดียว (ไม่มีแก้ไข) — แก้ข้อมูลยังใช้หน้า PocketBase admin ปกติได้
 * (http://127.0.0.1:8095/_/) เพราะมีอยู่แล้วครบและปลอดภัยกว่าเขียนฟอร์มแก้เอง
 * ใหม่ทั้งหมด แอปนี้มีไว้ตอบคำถาม "ตอนนี้มีร้านอะไรบ้าง ร้านไหนใช้งานจริง"
 * ซึ่ง PocketBase admin ตอบยาก (ต้องกดดูทีละ collection ทีละร้าน)
 */

interface ShopRow {
  id: string;
  code: string;
  name: string;
  contact_phone: string;
  tables_enabled: boolean;
  plan: string;
  plan_expires_at: string;
  created: string;
}

interface PaymentRow {
  id: string;
  plan: string;
  amount: number;
  paid_at: string;
  note: string;
  recorded_by: string;
  created: string;
}

interface StaffRow {
  id: string;
  display_name: string;
  role: string;
  active: boolean;
}

interface OrderRow {
  id: string;
  order_no: number;
  status: string;
  total: number;
  channel: string;
  created: string;
}

export function App() {
  const [loggedIn, setLoggedIn] = useState(pb.authStore.isValid);

  useEffect(() => {
    return pb.authStore.onChange(() => setLoggedIn(pb.authStore.isValid));
  }, []);

  return loggedIn ? <AdminHome /> : <LoginScreen />;
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginAsAdmin(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <form className="panel" onSubmit={submit}>
        <h1>PrakaiPOS Admin</h1>
        <p className="muted">เข้าระบบด้วยบัญชีแอดมินของ PocketBase</p>

        <label className="field">
          <span>อีเมล</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>รหัสผ่าน</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <p className="alert">{error}</p>}

        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? 'กำลังเข้าระบบ…' : 'เข้าระบบ'}
        </button>
      </form>
    </div>
  );
}

function AdminHome() {
  const [shops, setShops] = useState<ShopRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ShopRow | null>(null);

  useEffect(() => {
    void pb
      .collection('shops')
      .getFullList<ShopRow>({ sort: '-created' })
      .then(setShops)
      .catch((err) => setError(err instanceof Error ? err.message : 'โหลดรายชื่อร้านไม่สำเร็จ'));
  }, []);

  return (
    <div className="app">
      <header className="bar">
        <Store size={20} aria-hidden="true" className="bar__icon" />
        <h1>PrakaiPOS Admin</h1>
        <div className="spacer" />
        <button type="button" className="btn" onClick={logout}>
          <LogOut size={16} aria-hidden="true" /> ออกจากระบบ
        </button>
      </header>

      <main className="main">
        {error && <p className="alert">{error}</p>}

        {selected ? (
          <ShopDetail shop={selected} onBack={() => setSelected(null)} />
        ) : (
          <>
            <h2>ร้านทั้งหมด {shops ? `(${shops.length})` : ''}</h2>
            {!shops ? (
              <p className="muted">กำลังโหลด…</p>
            ) : shops.length === 0 ? (
              <div className="empty">
                <Store size={32} aria-hidden="true" className="empty__icon" />
                <p className="muted">ยังไม่มีร้านในระบบ</p>
              </div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>ชื่อร้าน</th>
                    <th>รหัสร้าน</th>
                    <th>แผน</th>
                    <th>เบอร์ติดต่อ</th>
                    <th>ผังโต๊ะ</th>
                    <th>สมัครเมื่อ</th>
                  </tr>
                </thead>
                <tbody>
                  {shops.map((s) => (
                    <tr key={s.id} className="tbl__row" onClick={() => setSelected(s)}>
                      <td>{s.name}</td>
                      <td className="mono">{s.code}</td>
                      <td>{planLabel(s.plan, s.plan_expires_at)}</td>
                      <td>{s.contact_phone || '—'}</td>
                      <td>{s.tables_enabled ? 'เปิด' : 'ปิด'}</td>
                      <td className="mono">{s.created.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ShopDetail({ shop: initialShop, onBack }: { shop: ShopRow; onBack: () => void }) {
  // เก็บ state ของตัวเองแยกจาก props — อัปเดตทันทีหลังบันทึกการจ่ายเงินสำเร็จ
  // โดยไม่ต้องรีเฟรชรายชื่อร้านทั้งหน้า (ตาราง "ร้านทั้งหมด" จะเห็นค่าใหม่ตอนกลับไปโหลดใหม่)
  const [shop, setShop] = useState(initialShop);
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);

  useEffect(() => {
    void pb
      .collection('staff')
      .getFullList<StaffRow>({ filter: `shop="${shop.id}"`, sort: 'display_name' })
      .then(setStaff);
    void pb
      .collection('orders')
      .getList<OrderRow>(1, 10, { filter: `shop="${shop.id}"`, sort: '-created' })
      .then((res) => setOrders(res.items));
    void pb
      .collection('payments')
      .getFullList<PaymentRow>({ filter: `shop="${shop.id}"`, sort: '-paid_at' })
      .then(setPayments)
      .catch(() => setPayments([]));
  }, [shop.id]);

  const paidOrders = orders?.filter((o) => o.status === 'paid') ?? [];
  const totalRevenue = paidOrders.reduce((sum, o) => sum + o.total, 0);

  return (
    <div>
      <button type="button" className="linkbtn linkbtn--back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" /> กลับไปรายชื่อร้าน
      </button>
      <h2>{shop.name}</h2>
      <p className="muted mono">รหัสร้าน: {shop.code}</p>

      <h3>แผน/การชำระเงิน — {planLabel(shop.plan, shop.plan_expires_at)}</h3>
      {!payments ? (
        <p className="muted">กำลังโหลด…</p>
      ) : payments.length === 0 ? (
        <p className="muted">ยังไม่มีการจ่ายเงิน</p>
      ) : (
        <ul className="list">
          {payments.map((p) => (
            <li key={p.id}>
              {p.plan === 'plus' ? 'Plus' : 'Core'} · {formatBaht(p.amount)} · จ่ายเมื่อ{' '}
              {p.paid_at.slice(0, 10)}
              {p.note && <span className="muted"> · {p.note}</span>}
            </li>
          ))}
        </ul>
      )}
      <RecordPaymentForm
        shop={shop}
        onRecorded={(updatedShop, payment) => {
          setShop(updatedShop);
          setPayments((cur) => [payment, ...(cur ?? [])]);
        }}
      />

      <h3>พนักงาน</h3>
      {!staff ? (
        <p className="muted">กำลังโหลด…</p>
      ) : staff.length === 0 ? (
        <p className="muted">ยังไม่มีพนักงาน</p>
      ) : (
        <ul className="list">
          {staff.map((s) => (
            <li key={s.id}>
              {s.display_name} · {s.role === 'owner' ? 'เจ้าของร้าน' : 'พนักงาน'}
              {!s.active && <span className="muted"> (ปิดใช้งาน)</span>}
            </li>
          ))}
        </ul>
      )}

      <h3>บิลล่าสุด {orders && `(รวม ${paidOrders.length} บิลที่จ่ายแล้วจาก 10 ใบล่าสุด · ${formatBaht(totalRevenue)})`}</h3>
      {!orders ? (
        <p className="muted">กำลังโหลด…</p>
      ) : orders.length === 0 ? (
        <p className="muted">ยังไม่มีบิล</p>
      ) : (
        <ul className="list">
          {orders.map((o) => (
            <li key={o.id}>
              #{o.order_no} · {o.channel === 'pos' ? 'หน้าร้าน' : 'QR'} · {o.status} ·{' '}
              {formatBaht(o.total)} · <span className="muted">{o.created.slice(0, 16)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * บันทึกการจ่ายเงินรายปี — เก็บเงินแบบ manual ตามเอกสารออกแบบหัวข้อ 11
 * (โอน/พร้อมเพย์เก็บเอง ไม่มี payment gateway) แอปนี้เป็นแค่ที่บันทึกว่า
 * ใครจ่ายแล้วเท่าไรเมื่อไร — เขียนตรงผ่าน PocketBase SDK ด้วยบัญชี superuser
 * ที่ล็อกอินอยู่แล้ว (ดู pb.ts) ไม่ต้องเปิด hook route ใหม่
 */
function RecordPaymentForm({
  shop,
  onRecorded,
}: {
  shop: ShopRow;
  onRecorded: (shop: ShopRow, payment: PaymentRow) => void;
}) {
  const [plan, setPlan] = useState<'core' | 'plus'>('core');
  const [amountBaht, setAmountBaht] = useState('1900');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const amount = bahtToSatang(Number(amountBaht));
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('จำนวนเงินไม่ถูกต้อง');
      }

      const payment = await pb.collection('payments').create<PaymentRow>({
        shop: shop.id,
        plan,
        amount,
        paid_at: paidAt,
        note,
      });

      // ต่ออายุซ้อนจากวันหมดอายุเดิม (ไม่ใช่จากวันนี้เสมอ) กันเสียเปรียบถ้า
      // จ่ายก่อนหมดอายุจริง — แผนเดิมยังไม่หมดอายุก็บวกเพิ่มจากวันนั้นไปเลย
      const currentExpiry = shop.plan_expires_at ? new Date(shop.plan_expires_at) : null;
      const base =
        currentExpiry && currentExpiry.getTime() > Date.now() ? currentExpiry : new Date();
      const nextExpiry = new Date(base);
      nextExpiry.setUTCDate(nextExpiry.getUTCDate() + 365);

      const updatedShop = await pb.collection('shops').update<ShopRow>(shop.id, {
        plan,
        plan_expires_at: nextExpiry.toISOString(),
      });

      setAmountBaht(plan === 'plus' ? '3500' : '1900');
      setNote('');
      onRecorded(updatedShop, payment);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกการจ่ายเงินไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" style={{ maxWidth: 420 }} onSubmit={submit}>
      <label className="field">
        <span>แผน</span>
        <select value={plan} onChange={(e) => setPlan(e.target.value as 'core' | 'plus')}>
          <option value="core">Core (1,900 ฿/ปี)</option>
          <option value="plus">Plus (3,500 ฿/ปี)</option>
        </select>
      </label>
      <label className="field">
        <span>จำนวนเงิน (บาท)</span>
        <input
          type="number"
          min="0"
          step="1"
          value={amountBaht}
          onChange={(e) => setAmountBaht(e.target.value)}
          required
        />
      </label>
      <label className="field">
        <span>วันที่จ่าย</span>
        <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
      </label>
      <label className="field">
        <span>หมายเหตุ</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="เช่น โอนผ่านพร้อมเพย์"
        />
      </label>

      {error && <p className="alert">{error}</p>}

      <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
        {busy ? 'กำลังบันทึก…' : 'บันทึกการจ่ายเงิน'}
      </button>
    </form>
  );
}
