import { formatBaht } from '@prakaipos/shared';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  addLine,
  cartCount,
  cartTotal,
  loadCart,
  saveCart,
  setQty,
  type CartLine,
} from './cart.js';
import { submitOrder } from './submitOrder.js';
import { useMenu } from './useMenu.js';
import { useTableSession } from './useTableSession.js';

/**
 * หน้าสั่งอาหารประจำโต๊ะ
 *
 * ลำดับตามเอกสารออกแบบหัวข้อ 07: ยืนยันลายเซ็นของลิงก์ก่อน (กันคนแกล้งสแกน
 * URL มั่วๆ) → ยืนยันเลขโต๊ะกับลูกค้า (กันสแกนผิดโต๊ะ) → แสดงเมนู
 */
export function TablePage() {
  const { shopCode = '', tableNo = '' } = useParams();
  const [searchParams] = useSearchParams();
  const signature = searchParams.get('k');

  const session = useTableSession(shopCode, tableNo, signature);
  const menu = useMenu(session.session?.shopId ?? '');

  const [confirmed, setConfirmed] = useState(false);
  const [lines, setLines] = useState<CartLine[]>(() => loadCart(shopCode, tableNo));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<{ orderNo: number; status: string } | null>(
    null,
  );

  // เก็บตะกร้าทุกครั้งที่เปลี่ยน เพื่อให้สลับไปตอบแชทแล้วกลับมาของยังอยู่
  useEffect(() => {
    saveCart(shopCode, tableNo, lines);
  }, [shopCode, tableNo, lines]);

  if (session.loading) {
    return <div className="center">กำลังตรวจสอบลิงก์…</div>;
  }

  // ลิงก์ไม่ถูกต้อง — จบตรงนี้เลย ไม่แสดงเมนูหรือข้อมูลร้านใดๆ ต่อ
  // เพราะลายเซ็นคือสิ่งเดียวที่ยืนยันว่าลูกค้ากำลังนั่งอยู่ที่โต๊ะนี้จริง
  if (session.error || !session.session) {
    return (
      <div className="center">
        <p className="error">{session.error ?? 'ลิงก์นี้ไม่ถูกต้อง'}</p>
      </div>
    );
  }

  if (menu.loading) {
    return <div className="center">กำลังโหลดเมนู…</div>;
  }

  if (menu.error) {
    return (
      <div className="center">
        <p className="error">{menu.error}</p>
      </div>
    );
  }

  // ยืนยันเลขโต๊ะก่อน — สแกนผิดโต๊ะแล้วอาหารไปผิดที่ แก้ยากกว่าถามหนึ่งครั้ง
  if (!confirmed) {
    return (
      <div className="center confirm">
        <p className="confirm__shop">{session.session.shopName}</p>
        <p className="confirm__label">คุณนั่งอยู่ที่โต๊ะ</p>
        <p className="confirm__table">{session.session.tableNo}</p>
        <button type="button" className="btn btn--primary" onClick={() => setConfirmed(true)}>
          ใช่ ถูกต้อง
        </button>
        <p className="confirm__hint">ถ้าไม่ใช่โต๊ะนี้ กรุณาสแกน QR ที่โต๊ะของคุณ</p>
      </div>
    );
  }

  const count = cartCount(lines);

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);

    const result = await submitOrder(session.session!.sessionId, lines);

    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }

    setLastOrder({ orderNo: result.orderNo, status: result.status });
    setLines([]);
    saveCart(shopCode, tableNo, []);
  }

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <div className="page__shop">{session.session.shopName}</div>
          <div className="page__table">โต๊ะ {session.session.tableNo}</div>
        </div>
      </header>

      <main className="page__body">
        {lastOrder && (
          <div className="notice">
            {lastOrder.status === 'pending'
              ? 'ส่งออร์เดอร์แล้ว กำลังรอร้านยืนยัน'
              : 'ส่งออร์เดอร์เข้าครัวแล้ว'}
            <br />
            สั่งเพิ่มได้เลยถ้ายังหิว — จะไปรวมบิลเดียวกันตอนจ่ายเงิน
          </div>
        )}

        {menu.categories.map((cat) => (
          <section key={cat.id} className="cat">
            <h2 className="cat__name">{cat.name}</h2>
            <ul className="items">
              {cat.items.map((item) => (
                <li key={item.id} className={item.soldOut ? 'item item--out' : 'item'}>
                  {item.imageUrl && (
                    <img className="item__img" src={item.imageUrl} alt="" loading="lazy" />
                  )}
                  <div className="item__info">
                    <div className="item__name">{item.name}</div>
                    <div className="item__price">{formatBaht(item.price)}</div>
                  </div>
                  {item.soldOut ? (
                    <span className="item__out">ของหมด</span>
                  ) : (
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        setLines((cur) =>
                          addLine(cur, {
                            menuItemId: item.id,
                            name: item.name,
                            unitPrice: item.price,
                            qty: 1,
                            note: '',
                          }),
                        )
                      }
                    >
                      เพิ่ม
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>

      {count > 0 && (
        <footer className="cartbar">
          <ul className="cartbar__lines">
            {lines.map((l, i) => (
              <li key={`${l.menuItemId}-${l.note}`}>
                <button
                  type="button"
                  className="qty"
                  aria-label={`ลด ${l.name}`}
                  onClick={() => setLines((cur) => setQty(cur, i, l.qty - 1))}
                >
                  −
                </button>
                <span className="cartbar__qty">{l.qty}</span>
                <button
                  type="button"
                  className="qty"
                  aria-label={`เพิ่ม ${l.name}`}
                  onClick={() => setLines((cur) => setQty(cur, i, l.qty + 1))}
                >
                  +
                </button>
                <span className="cartbar__name">{l.name}</span>
                <span className="cartbar__sum">{formatBaht(l.unitPrice * l.qty)}</span>
              </li>
            ))}
          </ul>

          {submitError && <p className="error cartbar__error">{submitError}</p>}

          <div className="cartbar__foot">
            <span>
              รวม {count} รายการ · <b>{formatBaht(cartTotal(lines))}</b>
            </span>
            <button
              type="button"
              className="btn btn--primary"
              disabled={submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? 'กำลังส่ง…' : 'สั่งอาหาร'}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
