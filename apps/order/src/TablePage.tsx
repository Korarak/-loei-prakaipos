import { formatBaht } from '@prakaipos/shared';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  addLine,
  cartCount,
  cartTotal,
  loadCart,
  saveCart,
  setQty,
  type CartLine,
} from './cart.js';
import { useMenu } from './useMenu.js';

/**
 * หน้าสั่งอาหารประจำโต๊ะ
 *
 * ลำดับตามเอกสารออกแบบหัวข้อ 07: ยืนยันเลขโต๊ะก่อน (กันสแกนผิดโต๊ะ)
 * แล้วจึงแสดงเมนู
 */
export function TablePage() {
  const { shopCode = '', tableNo = '' } = useParams();
  const menu = useMenu(shopCode);
  const [confirmed, setConfirmed] = useState(false);
  const [lines, setLines] = useState<CartLine[]>(() => loadCart(shopCode, tableNo));

  // เก็บตะกร้าทุกครั้งที่เปลี่ยน เพื่อให้สลับไปตอบแชทแล้วกลับมาของยังอยู่
  useEffect(() => {
    saveCart(shopCode, tableNo, lines);
  }, [shopCode, tableNo, lines]);

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
        <p className="confirm__shop">{menu.shopName}</p>
        <p className="confirm__label">คุณนั่งอยู่ที่โต๊ะ</p>
        <p className="confirm__table">{tableNo}</p>
        <button type="button" className="btn btn--primary" onClick={() => setConfirmed(true)}>
          ใช่ ถูกต้อง
        </button>
        <p className="confirm__hint">ถ้าไม่ใช่โต๊ะนี้ กรุณาสแกน QR ที่โต๊ะของคุณ</p>
      </div>
    );
  }

  const count = cartCount(lines);

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <div className="page__shop">{menu.shopName}</div>
          <div className="page__table">โต๊ะ {tableNo}</div>
        </div>
      </header>

      <main className="page__body">
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
          <div className="cartbar__foot">
            <span>
              รวม {count} รายการ · <b>{formatBaht(cartTotal(lines))}</b>
            </span>
            {/* ส่งออร์เดอร์ยังทำไม่ได้จนกว่าจะมี hook ตรวจลายเซ็นฝั่งเซิร์ฟเวอร์
                — ดู backend/README.md หัวข้อ "ยังทำไม่เสร็จ" */}
            <button type="button" className="btn btn--primary" disabled>
              สั่งอาหาร (ยังไม่เปิดใช้)
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
