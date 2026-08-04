import { formatBaht } from '@prakaipos/shared';
import { useDailySummary } from '../dashboard/useDailySummary.js';

interface DashboardScreenProps {
  shopId: string;
}

export function DashboardScreen({ shopId }: DashboardScreenProps) {
  const { summary, loading, error, reload } = useDailySummary(shopId);

  return (
    <>
      <div className="app__toolbar">
        <div className="app__spacer" />
        <button type="button" className="btn" onClick={() => void reload()}>
          รีเฟรช
        </button>
      </div>

      {loading ? (
          <p className="muted">กำลังดึงยอดขายวันนี้…</p>
        ) : error ? (
          <div className="panel">
            <h1>ดูยอดขายไม่ได้ตอนนี้</h1>
            <p className="muted">{error}</p>
          </div>
        ) : summary ? (
          <>
            <div className="dash__grid">
              <div className="dash__card">
                <span className="dash__label">ยอดขายวันนี้</span>
                <span className="dash__value">{formatBaht(summary.totalRevenue)}</span>
              </div>
              <div className="dash__card">
                <span className="dash__label">จำนวนบิล</span>
                <span className="dash__value">{summary.billCount}</span>
              </div>
              <div className="dash__card">
                <span className="dash__label">เฉลี่ย/บิล</span>
                <span className="dash__value">{formatBaht(summary.averagePerBill)}</span>
              </div>
              <div className="dash__card">
                <span className="dash__label">กำไรวันนี้ (ประมาณ)</span>
                <span className="dash__value">{formatBaht(summary.totalProfit)}</span>
              </div>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              ต้นทุน/กำไรคิดจากสูตรอาหารและราคาวัตถุดิบปัจจุบัน — เมนูที่ยังไม่ได้ตั้งสูตร
              (BOM) จะนับต้นทุนเป็น 0
            </p>

            <h2 style={{ fontSize: 17, marginTop: 28 }}>เมนูขายดีวันนี้</h2>
            {summary.topItems.length === 0 ? (
              <p className="hint">ยังไม่มีบิลปิดวันนี้</p>
            ) : (
              <ul className="mlist">
                {summary.topItems.map((item) => (
                  <li key={item.name} className="mrow">
                    <div className="mrow__info">
                      <div className="mrow__name">{item.name}</div>
                      <div className="mrow__price">
                        {item.qty} ชิ้น · กำไร {formatBaht(item.profit)}
                      </div>
                    </div>
                    <div className="mrow__price">{formatBaht(item.revenue)}</div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
    </>
  );
}
