import type { Order } from '@prakaipos/shared';
import { formatBaht } from '@prakaipos/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { getCredential, type StaffProfile } from '../auth/credentials.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { isPrinterSupported, printBytes } from '../printing/bluetoothPrinter.js';
import { buildOrderReceipt } from '../printing/receipt.js';
import { ordersOfDay, voidOrder } from '../sell/checkout.js';

/**
 * บิลย้อนหลัง
 *
 * ใช้ `ordersOfDay`/`voidOrder` ที่มีอยู่แล้วใน sell/checkout.ts (เขียนไว้ตั้งแต่
 * ก้อนที่ 1 พร้อมดัชนี status+createdAt ใน db.ts) — เดิมมีแต่ตรรกะ ไม่มีหน้าจอ
 * ดึงจากเครื่องนี้เท่านั้น (ยังไม่มีซิงก์ขาลงของบิล) จึงเห็นเฉพาะบิลที่เครื่องนี้ขายเอง
 */

interface OrdersScreenProps {
  shopId: string;
  shopName: string;
  profile: StaffProfile;
  /** เปิดหน้าขายพร้อมตะกร้าจากบิลนี้ให้แก้ไข — บิลเดิมยกเลิกก็ต่อเมื่อบิลใหม่ปิดสำเร็จ */
  onEditBill: (order: Order) => void;
}

const CHANNEL_LABEL: Record<Order['channel'], string> = {
  pos: 'หน้าร้าน',
  qr: 'QR',
};

type StatusFilter = Order['status'] | 'all';

const STATUS_LABEL: Record<Order['status'], string> = {
  paid: 'ปิดบิลแล้ว',
  void: 'ยกเลิกแล้ว',
  open: 'ยังเปิดอยู่',
  pending: 'รอยืนยัน',
};

const STATUS_BADGE: Record<Order['status'], string> = {
  paid: 'badge badge--ok',
  void: 'badge badge--off',
  open: 'badge badge--warn',
  pending: 'badge badge--warn',
};

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function OrdersScreen({ shopId, shopName, profile, onEditBill }: OrdersScreenProps) {
  const isOwner = profile.role === 'owner';
  const [day, setDay] = useState(() => new Date());
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [confirmVoid, setConfirmVoid] = useState<Order | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    setOrders(null);
    setOrders(await ordersOfDay(shopId, day));
  }, [shopId, day]);

  useEffect(() => {
    void load();
  }, [load]);

  // ค้นด้วยเลขบิลหรือเลขโต๊ะ — พิมพ์บางส่วนก็เจอ (เช่น "12" เจอบิล #112 ด้วย)
  // ไม่ค้นในรายการเมนู เพราะพนักงานมักจำเลขบิล/โต๊ะได้ ไม่ได้จำว่าใครสั่งอะไร
  const filtered = (orders ?? []).filter((o) => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    const q = query.trim();
    if (!q) return true;
    return String(o.orderNo).includes(q) || (o.tableNo ?? '').includes(q);
  });

  async function printReceipt(order: Order) {
    setPrinting(true);
    setPrintError(null);
    try {
      // ชื่อพนักงานที่ขายมาจากแคชในเครื่อง (StaffCredential) ไม่ใช่คนที่ล็อกอินอยู่ตอนนี้
      // เพราะพิมพ์ซ้ำอาจเกิดคนละกะ — หาไม่เจอก็พิมพ์ต่อได้ แค่ไม่มีชื่อพนักงานบนใบเสร็จ
      const seller = await getCredential(order.staffId);
      await printBytes(
        buildOrderReceipt(order, shopName, { staffName: seller?.displayName }),
      );
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'พิมพ์ใบเสร็จไม่สำเร็จ');
    } finally {
      setPrinting(false);
    }
  }

  async function handleVoid(order: Order) {
    setVoidError(null);
    try {
      await voidOrder(order.clientUuid);
      setConfirmVoid(null);
      setSelected(null);
      await load();
    } catch (err) {
      setVoidError(err instanceof Error ? err.message : 'ยกเลิกบิลไม่สำเร็จ');
    }
  }

  const today = isSameDay(day, new Date());

  return (
    <>
      <div className="app__toolbar hist__toolbar">
        <button type="button" className="linkbtn" onClick={() => setDay((d) => addDays(d, -1))}>
          <ChevronLeft size={18} aria-hidden="true" /> ก่อนหน้า
        </button>
        <div className="hist__day">
          <b>
            {day.toLocaleDateString('th-TH', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </b>
          {!today && (
            <button type="button" className="linkbtn" onClick={() => setDay(new Date())}>
              วันนี้
            </button>
          )}
        </div>
        <button
          type="button"
          className="linkbtn"
          disabled={today}
          onClick={() => setDay((d) => addDays(d, 1))}
        >
          ถัดไป <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      {orders !== null && orders.length > 0 && (
        <div className="hist__filters">
          <input
            type="search"
            inputMode="numeric"
            className="hist__search"
            placeholder="ค้นเลขบิลหรือเลขโต๊ะ"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="hist__chips">
            {(['all', 'paid', 'void', 'open', 'pending'] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={s === statusFilter ? 'chipbtn chipbtn--on' : 'chipbtn'}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? 'ทั้งหมด' : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      {orders === null ? (
        <p className="muted">กำลังโหลดบิล…</p>
      ) : orders.length === 0 ? (
        <p className="hint">ไม่มีบิลของวันนี้</p>
      ) : filtered.length === 0 ? (
        <p className="hint">ไม่พบบิลที่ตรงกับที่ค้นหา</p>
      ) : (
        <ul className="orders__list">
          {filtered.map((o) => (
            <li key={o.clientUuid}>
              <button
                type="button"
                className={o.status === 'void' ? 'orderrow orderrow--void' : 'orderrow'}
                onClick={() => setSelected(o)}
              >
                <div className="orderrow__info">
                  <div className="orderrow__no">
                    #{o.orderNo}
                    {o.tableNo && ` · โต๊ะ ${o.tableNo}`}
                  </div>
                  <div className="orderrow__meta">
                    <span>
                      {new Date(o.createdAt).toLocaleTimeString('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · {CHANNEL_LABEL[o.channel]}
                    </span>
                    <span className={STATUS_BADGE[o.status]}>{STATUS_LABEL[o.status]}</span>
                  </div>
                </div>
                <b className="orderrow__total">{formatBaht(o.total)}</b>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="sheet" onClick={() => setSelected(null)}>
          <div
            className="sheet__panel sheet__panel--orders"
            role="dialog"
            aria-label={`บิลเลขที่ ${selected.orderNo}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>บิลเลขที่ {selected.orderNo}</h2>
            <p className="muted">
              {new Date(selected.createdAt).toLocaleString('th-TH')}
              {selected.tableNo && ` · โต๊ะ ${selected.tableNo}`} ·{' '}
              ช่องทาง {CHANNEL_LABEL[selected.channel]}
            </p>
            <span className={STATUS_BADGE[selected.status]}>{STATUS_LABEL[selected.status]}</span>

            <ul className="mlist" style={{ marginTop: 14 }}>
              {selected.lines.map((l) => (
                <li key={l.clientUuid} className="mrow">
                  <div className="mrow__info">
                    <div className="mrow__name">
                      {l.qty}× {l.nameSnapshot}
                    </div>
                    {l.note && <div className="mrow__price">หมายเหตุ: {l.note}</div>}
                  </div>
                  <div className="mrow__price">{formatBaht(l.unitPrice * l.qty)}</div>
                </li>
              ))}
            </ul>

            <div className="cart__foot" style={{ marginTop: 14 }}>
              {selected.discount > 0 && (
                <div className="cart__row cart__row--discount">
                  <span>ส่วนลด</span>
                  <span>−{formatBaht(selected.discount)}</span>
                </div>
              )}
              <div className="cart__total">
                <span>ยอดรวม</span>
                <b>{formatBaht(selected.total)}</b>
              </div>
            </div>

            {selected.payment && (
              <p className="hint">
                {selected.payment.method === 'cash' ? 'เงินสด' : 'พร้อมเพย์'}
                {selected.payment.method === 'cash' &&
                  ` · รับมา ${formatBaht(selected.payment.amount)} · ทอน ${formatBaht(selected.payment.change)}`}
              </p>
            )}

            {printError && <p className="alert">{printError}</p>}
            {voidError && <p className="alert">{voidError}</p>}

            <div className="sheet__actions">
              <button type="button" className="btn" onClick={() => setSelected(null)}>
                ปิด
              </button>
              {isPrinterSupported() && (
                <button
                  type="button"
                  className="btn"
                  disabled={printing}
                  onClick={() => void printReceipt(selected)}
                >
                  {printing ? 'กำลังพิมพ์…' : 'พิมพ์ซ้ำ'}
                </button>
              )}
              {/* เฉพาะเจ้าของร้าน กันพนักงานขายแล้วรับเงินสดเองแล้วแก้/ยกเลิกบิลลบร่องรอย */}
              {isOwner && selected.status === 'paid' && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    onEditBill(selected);
                    setSelected(null);
                  }}
                >
                  แก้ไขบิล
                </button>
              )}
              {isOwner && selected.status === 'paid' && (
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => setConfirmVoid(selected)}
                >
                  ยกเลิกบิล
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmVoid && (
        <ConfirmDialog
          title={`ยกเลิกบิลเลขที่ ${confirmVoid.orderNo}`}
          detail={`ยอด ${formatBaht(confirmVoid.total)} — ยกเลิกแล้วนำกลับไม่ได้ ใช้ตอนคีย์ผิดหรือลูกค้าไม่รับของเท่านั้น`}
          confirmLabel="ยกเลิกบิล"
          danger
          onCancel={() => setConfirmVoid(null)}
          onConfirm={() => void handleVoid(confirmVoid)}
        />
      )}
    </>
  );
}
