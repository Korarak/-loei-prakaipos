import { formatBaht, useMountTransition } from '@prakaipos/shared';
import { CircleCheck, ShoppingCart } from 'lucide-react';
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
import { ModifierPicker } from './ModifierPicker.js';
import { submitOrder } from './submitOrder.js';
import { useMenu, type PublicMenuItem } from './useMenu.js';
import { useTableSession, type ActiveOrder } from './useTableSession.js';

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
  // เมนูที่กำลังเลือกตัวเลือก/ท็อปปิ้งอยู่ — ว่างสำหรับเมนูที่ไม่มีตัวเลือก
  const [pickingItem, setPickingItem] = useState<PublicMenuItem | null>(null);
  // ออร์เดอร์ที่ยังไม่จบของรอบนั่งนี้ — seed จากเซิร์ฟเวอร์ตอนโหลดหน้า (ไม่ใช่
  // แค่จำสิ่งที่เพิ่งส่งไปในหน่วยความจำ) เพื่อให้รีเฟรชหน้าแล้วยังเห็นออร์เดอร์เดิม
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);

  useEffect(() => {
    if (session.session) {
      setActiveOrders(session.session.activeOrders);
    }
  }, [session.session]);

  // เก็บตะกร้าทุกครั้งที่เปลี่ยน เพื่อให้สลับไปตอบแชทแล้วกลับมาของยังอยู่
  useEffect(() => {
    saveCart(shopCode, tableNo, lines);
  }, [shopCode, tableNo, lines]);

  const count = cartCount(lines);
  // เรียก hook นี้ก่อน early return เสมอ (กฎของ React hooks) — หน่วงการถอด
  // แถบตะกร้าออกจาก DOM ไว้ให้ทันเล่น transition ตอนตะกร้าว่างแล้วซ่อนแถบ
  const cartTransition = useMountTransition(count > 0, 200);
  // จำรายการล่าสุดตอนตะกร้ายังไม่ว่าง ไว้ให้แถบตะกร้าเลื่อนหายไปพร้อมเนื้อหาเดิม
  // แทนที่จะโล่งเปล่าอยู่ครู่หนึ่งระหว่างเล่น transition ตอนกดสั่งสำเร็จ
  const [lastLines, setLastLines] = useState<CartLine[]>(lines);
  useEffect(() => {
    if (lines.length > 0) setLastLines(lines);
  }, [lines]);
  const cartbarLines = count > 0 ? lines : lastLines;

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

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);

    const submittedLines = lines;
    const result = await submitOrder(session.session!.sessionId, submittedLines);

    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }

    // เพิ่มเข้ารายการที่มีอยู่แบบ optimistic — ไม่ต้องขอเซิร์ฟเวอร์ใหม่
    // เพราะรู้ผลลัพธ์ครบอยู่แล้วจากคำตอบของ submitOrder
    setActiveOrders((cur) => [
      ...cur,
      {
        orderNo: result.orderNo,
        status: result.status,
        lines: submittedLines.map((l) => ({
          nameSnapshot: l.name,
          qty: l.qty,
          note: l.note,
          unitPrice: l.unitPrice,
        })),
        total: cartTotal(submittedLines),
      },
    ]);
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
        {activeOrders.length > 0 && (
          <div className="notice">
            <CircleCheck size={18} className="notice__icon" aria-hidden="true" />
            <div>
              {activeOrders.map((o) => (
                <div key={o.orderNo} className="notice__order">
                  {o.status === 'pending' ? 'ส่งออร์เดอร์แล้ว กำลังรอร้านยืนยัน' : 'ส่งออร์เดอร์เข้าครัวแล้ว'}
                  {' — '}
                  {o.lines.map((l) => `${l.qty}× ${l.nameSnapshot}`).join(', ')} ({formatBaht(o.total)})
                </div>
              ))}
              <br />
              สั่งเพิ่มได้เลยถ้ายังหิว — จะไปรวมบิลเดียวกันตอนจ่ายเงิน
            </div>
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
                      onClick={() => {
                        // เมนูที่มีตัวเลือกต้องเลือกก่อนเสมอ แม้ทุกกลุ่มจะไม่บังคับ
                        if (item.modifierGroups.length > 0) {
                          setPickingItem(item);
                          return;
                        }
                        setLines((cur) =>
                          addLine(cur, {
                            menuItemId: item.id,
                            name: item.name,
                            unitPrice: item.price,
                            qty: 1,
                            note: '',
                            modifiers: [],
                            modifierOptionIds: [],
                          }),
                        );
                      }}
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

      {cartTransition.shouldRender && (
        <footer className={`cartbar cartbar--${cartTransition.stage}`}>
          <ul className="cartbar__lines">
            {cartbarLines.map((l, i) => (
              <li key={`${l.menuItemId}-${l.note}-${l.modifierOptionIds.join(',')}`}>
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
                <span className="cartbar__name">
                  {l.name}
                  {l.modifiers.length > 0 && (
                    <span className="item__mods"> ({l.modifiers.map((m) => m.optionName).join(', ')})</span>
                  )}
                </span>
                <span className="cartbar__sum">{formatBaht(l.unitPrice * l.qty)}</span>
              </li>
            ))}
          </ul>

          {submitError && <p className="error cartbar__error">{submitError}</p>}

          <div className="cartbar__foot">
            <span className="cartbar__summary">
              <ShoppingCart size={16} aria-hidden="true" />
              รวม {cartCount(cartbarLines)} รายการ · <b>{formatBaht(cartTotal(cartbarLines))}</b>
            </span>
            <button
              type="button"
              className="btn btn--primary"
              disabled={submitting || count === 0}
              onClick={() => void handleSubmit()}
            >
              {submitting ? 'กำลังส่ง…' : 'สั่งอาหาร'}
            </button>
          </div>
        </footer>
      )}

      {pickingItem && (
        <ModifierPicker
          item={pickingItem}
          onCancel={() => setPickingItem(null)}
          onConfirm={(modifiers, modifierOptionIds) => {
            setLines((cur) =>
              addLine(cur, {
                menuItemId: pickingItem.id,
                name: pickingItem.name,
                unitPrice: pickingItem.price + modifiers.reduce((s, m) => s + m.priceDelta, 0),
                qty: 1,
                note: '',
                modifiers,
                modifierOptionIds,
              }),
            );
            setPickingItem(null);
          }}
        />
      )}
    </div>
  );
}
