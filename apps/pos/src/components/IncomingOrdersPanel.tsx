import { formatBaht } from '@prakaipos/shared';
import { Bell, BellRing } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { IncomingOrder, IncomingOrdersState } from '../qr/useIncomingOrders.js';

/** รวมตัวเลือกที่เลือกกับหมายเหตุเป็นข้อความเดียว ไว้แสดงต่อท้ายชื่อเมนู */
function modifierSummary(line: IncomingOrder['lines'][number]): string {
  const parts = (line.modifiers ?? []).map((m) => m.optionName);
  if (line.note) parts.push(line.note);
  return parts.join(', ');
}

/** ออร์เดอร์ "เข้าครัวแล้ว" ทุกใบของรอบนั่งเดียวกัน รวมเป็นบิลเดียวตอนรับเงิน */
export interface OpenTableGroup {
  tableSessionId: string;
  tableNo: string;
  orders: IncomingOrder[];
  total: number;
}

/** จัดกลุ่มออร์เดอร์ที่เข้าครัวแล้วตามรอบนั่ง (โต๊ะเดียวกัน สั่งหลายรอบ = บิลเดียว) */
export function groupByTable(orders: IncomingOrder[]): OpenTableGroup[] {
  const groups = new Map<string, OpenTableGroup>();
  for (const o of orders) {
    const existing = groups.get(o.tableSessionId);
    if (existing) {
      existing.orders.push(o);
      existing.total += o.total;
    } else {
      groups.set(o.tableSessionId, {
        tableSessionId: o.tableSessionId,
        tableNo: o.tableNo,
        orders: [o],
        total: o.total,
      });
    }
  }
  return [...groups.values()];
}

/**
 * แผงออร์เดอร์จาก QR
 *
 * แยกสองส่วน: "รอยืนยัน" (โหมด staff_confirm — ต้องกดก่อนถึงจะเข้าครัว)
 * กับ "เข้าครัวแล้ว" (ยืนยันแล้วหรือโหมด auto — รวมเป็นบิลต่อโต๊ะ กดรับเงินได้)
 */
export function IncomingOrdersButton({
  state,
  onCharge,
}: {
  state: IncomingOrdersState;
  onCharge: (group: OpenTableGroup) => void;
}) {
  const [open, setOpen] = useState(false);
  const total = state.pending.length + state.open.length;
  const tableGroups = useMemo(() => groupByTable(state.open), [state.open]);
  // โต๊ะที่ยังมีออร์เดอร์รอยืนยันค้างอยู่ ต้องยืนยัน/ปฏิเสธให้ครบก่อน กันของตกหล่นตอนปิดบิล
  const pendingTables = useMemo(
    () => new Set(state.pending.map((o) => o.tableSessionId)),
    [state.pending],
  );

  if (total === 0) return null;

  return (
    <>
      <button
        type="button"
        className={state.pending.length > 0 ? 'app__user app__user--alert' : 'app__user'}
        onClick={() => setOpen(true)}
      >
        {state.pending.length > 0 ? <BellRing size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
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

            {tableGroups.length > 0 && (
              <section>
                <h3 className="orders__section">เข้าครัวแล้ว</h3>
                <ul className="orders__list">
                  {tableGroups.map((g) => (
                    <TableGroupCard
                      key={g.tableSessionId}
                      group={g}
                      blocked={pendingTables.has(g.tableSessionId)}
                      onCharge={() => {
                        onCharge(g);
                        setOpen(false);
                      }}
                    />
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
            {modifierSummary(l) && <span className="muted"> ({modifierSummary(l)})</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

function TableGroupCard({
  group,
  blocked,
  onCharge,
}: {
  group: OpenTableGroup;
  blocked: boolean;
  onCharge: () => void;
}) {
  return (
    <li className="ordercard">
      <div className="ordercard__head">
        <b>โต๊ะ {group.tableNo || '—'}</b>
        <span className="muted">{formatBaht(group.total)}</span>
      </div>
      <ul className="ordercard__lines">
        {group.orders.flatMap((o) =>
          o.lines.map((l, i) => (
            <li key={`${o.id}-${i}`}>
              {l.qty}× {l.nameSnapshot}
              {modifierSummary(l) && <span className="muted"> ({modifierSummary(l)})</span>}
            </li>
          )),
        )}
      </ul>
      <div className="ordercard__actions">
        {blocked ? (
          <span className="muted">มีออร์เดอร์รอยืนยันของโต๊ะนี้ค้างอยู่ — ยืนยันให้ครบก่อน</span>
        ) : (
          <button type="button" className="btn btn--primary" onClick={onCharge}>
            รับเงิน
          </button>
        )}
      </div>
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
