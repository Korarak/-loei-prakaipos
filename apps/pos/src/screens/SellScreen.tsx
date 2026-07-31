import type { MenuItem } from '@prakaipos/shared';
import { formatBaht } from '@prakaipos/shared';
import { useMemo, useState } from 'react';
import type { StaffProfile } from '../auth/credentials.js';
import type { DeviceInfo } from '../auth/device.js';
import { useMenuData } from '../menu/useMenuData.js';
import {
  addItem,
  emptyCart,
  isEmpty,
  itemCount,
  reconcileDiscount,
  removeLine,
  setQty,
  subtotal,
  total,
  type CartState,
} from '../sell/cart.js';
import { PayDialog } from './PayDialog.js';

/**
 * หน้าขาย
 *
 * หลักที่ยึดจากเอกสารออกแบบหัวข้อ 06 และ 12:
 * - กดถึงเมนูที่ต้องการใน 2 แตะ (เลือกหมวด → กดเมนู)
 * - ปุ่มใหญ่ ไม่มี dropdown
 * - ต้องกดถูกตอนรีบ จึงไม่มี animation ที่ทำให้ปุ่มขยับ
 */

interface SellScreenProps {
  device: DeviceInfo;
  profile: StaffProfile;
  promptpayId: string;
}

export function SellScreen({ device, profile, promptpayId }: SellScreenProps) {
  const menu = useMenuData(device.shopId);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartState>(emptyCart);
  const [paying, setPaying] = useState(false);
  const [lastOrderNo, setLastOrderNo] = useState<number | null>(null);

  // หมวดแรกเป็นค่าตั้งต้น เพื่อให้เปิดมาแล้วเห็นเมนูเลย ไม่ต้องกดก่อนหนึ่งที
  const activeCategory = categoryId ?? menu.categories[0]?.id ?? null;

  const visibleItems = useMemo(
    () => menu.items.filter((i) => i.categoryId === activeCategory && i.active),
    [menu.items, activeCategory],
  );

  function addToCart(item: MenuItem) {
    // ของหมดกดไม่ได้ — กันการขายของที่ไม่มีตั้งแต่ต้นทาง
    if (item.soldOut) return;
    setCart((c) => addItem(c, item));
    setLastOrderNo(null);
  }

  function changeQty(lineUuid: string, qty: number) {
    setCart((c) => reconcileDiscount(setQty(c, lineUuid, qty)));
  }

  if (menu.loading) {
    return <div className="screen screen--center muted">กำลังโหลดเมนู…</div>;
  }

  if (menu.categories.length === 0) {
    return (
      <div className="screen screen--center">
        <div className="panel">
          <h1>ยังไม่มีเมนู</h1>
          <p className="muted">
            ไปที่หน้า "จัดการเมนู" เพื่อเพิ่มหมวดและเมนูก่อน แล้วจึงเริ่มขายได้
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="sell">
      <div className="sell__menu">
        <div className="sell__cats">
          {menu.categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={c.id === activeCategory ? 'catbtn catbtn--on' : 'catbtn'}
              onClick={() => setCategoryId(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="sell__grid">
          {visibleItems.length === 0 && (
            <p className="hint">ยังไม่มีเมนูในหมวดนี้</p>
          )}
          {visibleItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.soldOut ? 'tile tile--out' : 'tile'}
              onClick={() => addToCart(item)}
              disabled={item.soldOut}
            >
              {item.imageUrl && (
                <img className="tile__img" src={item.imageUrl} alt="" loading="lazy" />
              )}
              <span className="tile__name">{item.name}</span>
              <span className="tile__price">{formatBaht(item.price)}</span>
              {item.soldOut && <span className="tile__badge">ของหมด</span>}
            </button>
          ))}
        </div>
      </div>

      <aside className="sell__cart">
        <div className="cart__head">
          <b>บิลปัจจุบัน</b>
          {!isEmpty(cart) && (
            <button
              type="button"
              className="linkbtn linkbtn--danger"
              onClick={() => setCart(emptyCart)}
            >
              ล้างบิล
            </button>
          )}
        </div>

        {lastOrderNo !== null && (
          <div className="cart__done">
            ปิดบิลเลขที่ {lastOrderNo} แล้ว · กดเมนูเพื่อเริ่มบิลใหม่
          </div>
        )}

        {isEmpty(cart) ? (
          <p className="hint cart__empty">กดเมนูทางซ้ายเพื่อเริ่มบิล</p>
        ) : (
          <ul className="cart__lines">
            {cart.lines.map((l) => (
              <li key={l.clientUuid} className="cline">
                <div className="cline__top">
                  <span className="cline__name">{l.nameSnapshot}</span>
                  <span className="cline__sum">{formatBaht(l.unitPrice * l.qty)}</span>
                </div>
                <div className="cline__ctl">
                  <button
                    type="button"
                    className="qtybtn"
                    aria-label={`ลด ${l.nameSnapshot}`}
                    onClick={() => changeQty(l.clientUuid, l.qty - 1)}
                  >
                    −
                  </button>
                  <span className="cline__qty">{l.qty}</span>
                  <button
                    type="button"
                    className="qtybtn"
                    aria-label={`เพิ่ม ${l.nameSnapshot}`}
                    onClick={() => changeQty(l.clientUuid, l.qty + 1)}
                  >
                    +
                  </button>
                  <span className="cline__unit">{formatBaht(l.unitPrice)}/หน่วย</span>
                  <button
                    type="button"
                    className="linkbtn"
                    onClick={() => setCart((c) => reconcileDiscount(removeLine(c, l.clientUuid)))}
                  >
                    ลบ
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="cart__foot">
          {cart.discount > 0 && (
            <div className="cart__row">
              <span>ยอดรวม</span>
              <span>{formatBaht(subtotal(cart))}</span>
            </div>
          )}
          {cart.discount > 0 && (
            <div className="cart__row cart__row--discount">
              <span>ส่วนลด</span>
              <span>−{formatBaht(cart.discount)}</span>
            </div>
          )}
          <div className="cart__total">
            <span>{itemCount(cart)} ชิ้น</span>
            <b>{formatBaht(total(cart))}</b>
          </div>
          <button
            type="button"
            className="btn btn--primary btn--block btn--pay"
            disabled={isEmpty(cart)}
            onClick={() => setPaying(true)}
          >
            รับเงิน
          </button>
        </div>
      </aside>

      {paying && (
        <PayDialog
          cart={cart}
          shopId={device.shopId}
          staffId={profile.staffId}
          promptpayId={promptpayId}
          onCancel={() => setPaying(false)}
          onDone={(orderNo) => {
            setPaying(false);
            setCart(emptyCart);
            setLastOrderNo(orderNo);
          }}
          onDiscountChange={(next) => setCart(next)}
        />
      )}
    </div>
  );
}
