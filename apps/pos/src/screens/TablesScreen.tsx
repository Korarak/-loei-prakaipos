import { formatBaht } from '@prakaipos/shared';
import { useMemo } from 'react';
import { groupByTable, type OpenTableGroup } from '../components/IncomingOrdersPanel.js';
import type { IncomingOrdersState } from '../qr/useIncomingOrders.js';

interface TablesScreenProps {
  tableCount: number;
  incoming: IncomingOrdersState;
  onOpenEmpty: (tableNo: string) => void;
  onCharge: (group: OpenTableGroup) => void;
}

/**
 * ผังโต๊ะแบบง่าย — ตารางเลขโต๊ะ 1..N ไม่มีการลากวางตำแหน่ง
 *
 * สถานะมาจากออร์เดอร์ QR ที่เข้าครัวแล้วเท่านั้น (เหมือนแผงออร์เดอร์ QR)
 * บิลที่พนักงานเปิดเองจากตรงนี้โดยยังไม่ได้พิมพ์อะไรจะยังไม่นับว่า "มีคน"
 * จนกว่าจะปิดบิลจริง — เพราะระบบยังไม่มีแนวคิด "เปิดโต๊ะทิ้งไว้" ฝั่ง POS
 * (ต่างจากฝั่ง QR ที่มี table_sessions ผูกไว้ตั้งแต่ลูกค้าสแกน)
 */
export function TablesScreen({
  tableCount,
  incoming,
  onOpenEmpty,
  onCharge,
}: TablesScreenProps) {
  const groups = useMemo(() => groupByTable(incoming.open), [incoming.open]);
  const groupByNo = useMemo(() => new Map(groups.map((g) => [g.tableNo, g])), [groups]);
  const pendingTableNos = useMemo(
    () => new Set(incoming.pending.map((o) => o.tableNo)),
    [incoming.pending],
  );

  const tables = Array.from({ length: tableCount }, (_, i) => String(i + 1));

  return tableCount === 0 ? (
    <div className="panel">
      <h1>ยังไม่ได้ตั้งจำนวนโต๊ะ</h1>
      <p className="muted">ให้เจ้าของร้านตั้งค่าจำนวนโต๊ะในหน้า admin ก่อน</p>
    </div>
  ) : (
    <div className="tables__grid">
      {tables.map((tableNo) => {
        const group = groupByNo.get(tableNo);
        const blocked = pendingTableNos.has(tableNo);

        if (group) {
          return (
            <button
              key={tableNo}
              type="button"
              className={
                blocked ? 'tablecard tablecard--busy tablecard--pending' : 'tablecard tablecard--busy'
              }
              disabled={blocked}
              onClick={() => onCharge(group)}
            >
              <span className="tablecard__no">โต๊ะ {tableNo}</span>
              <span className="tablecard__status">
                {blocked ? 'รอยืนยันออร์เดอร์' : `มีบิล · ${formatBaht(group.total)}`}
              </span>
            </button>
          );
        }

        return (
          <button
            key={tableNo}
            type="button"
            className="tablecard"
            onClick={() => onOpenEmpty(tableNo)}
          >
            <span className="tablecard__no">โต๊ะ {tableNo}</span>
            <span className="tablecard__status">ว่าง</span>
          </button>
        );
      })}
    </div>
  );
}
