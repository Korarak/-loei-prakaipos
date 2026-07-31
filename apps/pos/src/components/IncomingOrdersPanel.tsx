import { formatBaht } from '@prakaipos/shared';
import { useState } from 'react';
import type { IncomingOrder, IncomingOrdersState } from '../qr/useIncomingOrders.js';

/**
 * แผงออร์เดอร์จาก QR
 *
 * แยกสองส่วน: "รอยืนยัน" (โหมด staff_confirm — ต้องกดก่อนถึงจะเข้าครัว)
 * กับ "เข้าครัวแล้ว" (ยืนยันแล้วหรือโหมด auto — ไว้ให้ดูเฉยๆ)
 */
export function IncomingOrdersButton({ state }: { state: IncomingOrdersState }) {
  const [open, setOpen] = useState(false);
  const total = state.pending.length + state.open.length;

  if (total === 0) return null;

  return (
    <>
      <button
        type="button"
        className={state.pending.length > 0 ? 'app__user app__user--alert' : 'app__user'}
        onClick={() => setOpen(true)}
      >
        ออร์เดอร์ QR
        {state.pending.length > 0 ? ` · รอยืนยัน ${state.pending.length}` : ` · ${total}`}
      </button>

      {open && (
        <div className="sheet" onClick={() => setOpen(false)}>
          <div
            className="sheet__panel sheet__panel--orders"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>ออร์เดอร์จาก QR</h2>

            {state.pending.length > 0 && (
              <section>
                <h3 className="orders__section">รอยืนยัน</h3>
                <ul className="orders__list">
                  {state.pending.map((o) => (
                    <PendingRow key={o.id} order={o} state={state} />
                  ))}
                </ul>
              </section>
            )}

            {state.open.length > 0 && (
              <section>
                <h3 className="orders__section">เข้าครัวแล้ว</h3>
                <ul className="orders__list">
                  {state.open.map((o) => (
                    <OrderCard key={o.id} order={o} />
                  ))}
                </ul>
              </section>
            )}

            <div className="sheet__actions">
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function OrderCardBody({ order }: { order: IncomingOrder }) {
  return (
    <>
      <div className="ordercard__head">
        <b>โต๊ะ {order.tableNo || '—'}</b>
        <span className="muted">{formatBaht(order.total)}</span>
      </div>
      <ul className="ordercard__lines">
        {order.lines.map((l, i) => (
          <li key={i}>
            {l.qty}× {l.nameSnapshot}
            {l.note && <span className="muted"> ({l.note})</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

function OrderCard({ order }: { order: IncomingOrder }) {
  return (
    <li className="ordercard">
      <OrderCardBody order={order} />
    </li>
  );
}

function PendingRow({ order, state }: { order: IncomingOrder; state: IncomingOrdersState }) {
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="ordercard ordercard--pending">
      <OrderCardBody order={order} />
      <div className="ordercard__actions">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void run(() => state.reject(order.id))}
        >
          ปฏิเสธ
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() => void run(() => state.confirm(order.id))}
        >
          ยืนยัน
        </button>
      </div>
    </li>
  );
}
