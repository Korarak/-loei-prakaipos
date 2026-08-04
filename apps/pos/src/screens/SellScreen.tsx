import type { MenuItem, Order, OrderLine, SelectedModifier } from '@prakaipos/shared';
import { formatBaht } from '@prakaipos/shared';
import { useEffect, useMemo, useState } from 'react';
import type { StaffProfile } from '../auth/credentials.js';
import type { DeviceInfo } from '../auth/device.js';
import { useMenuData } from '../menu/useMenuData.js';
import { isPrinterSupported, printBytes } from '../printing/bluetoothPrinter.js';
import { buildOrderReceipt } from '../printing/receipt.js';
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
import { ModifierPicker } from './ModifierPicker.js';
import { PayDialog } from './PayDialog.js';
import { SplitBillDialog } from './SplitBillDialog.js';

/** ตะกร้าที่มาจากการกด "รับเงิน" ในแผงออร์เดอร์ QR ของโต๊ะหนึ่ง */
export interface TablePreset {
  /** เปลี่ยนค่าทุกครั้งที่กด แม้จะเป็นโต๊ะเดิม เพื่อให้ effect seed ตะกร้าทำงานซ้ำได้ */
  requestId: number;
  tableNo: string;
  tableSessionId: string;
  sourceOrderIds: string[];
  lines: OrderLine[];
}

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
  /** ตะกร้าที่ต้องเปิดขึ้นมาจากการรับเงินโต๊ะ QR — ไม่มีค่าสำหรับการขายปกติ */
  tablePreset?: TablePreset | null;
  /** เรียกหลัง seed ตะกร้าจาก tablePreset แล้ว กันไม่ให้ seed ซ้ำ */
  onTablePresetHandled?: () => void;
}

export function SellScreen({
  device,
  profile,
  promptpayId,
  tablePreset,
  onTablePresetHandled,
}: SellScreenProps) {
  const menu = useMenuData(device.shopId);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartState>(emptyCart);
  const [paying, setPaying] = useState(false);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  // เมนูที่กำลังเลือกตัวเลือก/ท็อปปิ้งอยู่ — ว่างสำหรับเมนูที่ไม่มีตัวเลือก (เพิ่มลงตะกร้าทันทีตามเดิม)
  const [pickingItem, setPickingItem] = useState<MenuItem | null>(null);
  const [splitting, setSplitting] = useState(false);
  // กลุ่มที่เหลือให้จ่ายทีละใบตอนแยกบิล — ว่าง = จ่ายบิลเดียวปกติ
  const [payQueue, setPayQueue] = useState<CartState[]>([]);
  const [splitDone, setSplitDone] = useState<Order[]>([]);
  // บิลของโต๊ะ QR ที่กำลังจะปิด — ไม่มีค่าเมื่อเป็นการขายหน้าร้านปกติ
  const [activeTable, setActiveTable] = useState<{
    tableNo: string;
    tableSessionId: string;
    sourceOrderIds: string[];
  } | null>(null);

  useEffect(() => {
    if (!tablePreset) return;
    setCart({ lines: tablePreset.lines, discount: 0 });
    setActiveTable({
      tableNo: tablePreset.tableNo,
      tableSessionId: tablePreset.tableSessionId,
      sourceOrderIds: tablePreset.sourceOrderIds,
    });
    setLastOrder(null);
    onTablePresetHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablePreset?.requestId]);

  // หมวดแรกเป็นค่าตั้งต้น เพื่อให้เปิดมาแล้วเห็นเมนูเลย ไม่ต้องกดก่อนหนึ่งที
  const activeCategory = categoryId ?? menu.categories[0]?.id ?? null;

  const visibleItems = useMemo(
    () => menu.items.filter((i) => i.categoryId === activeCategory && i.active),
    [menu.items, activeCategory],
  );

  function addToCart(item: MenuItem) {
    // ของหมดกดไม่ได้ — กันการขายของที่ไม่มีตั้งแต่ต้นทาง
    if (item.soldOut) return;
    // เมนูที่มีตัวเลือก/ท็อปปิ้งต้องเลือกก่อนเสมอ แม้ทุกกลุ่มจะไม่บังคับ
    // เพื่อไม่ให้พนักงานลืมถามลูกค้าแล้วเพิ่มแบบไม่มีตัวเลือกไปเงียบๆ
    if (item.modifierGroups.length > 0) {
      setPickingItem(item);
      return;
    }
    setCart((c) => addItem(c, item));
    setLastOrder(null);
    setSplitDone([]);
  }

  function confirmModifiers(item: MenuItem, modifiers: SelectedModifier[]) {
    setCart((c) => addItem(c, item, 1, '', modifiers));
    setLastOrder(null);
    setSplitDone([]);
    setPickingItem(null);
  }

  async function printReceipt(order: Order) {
    setPrinting(true);
    setPrintError(null);
    try {
      await printBytes(buildOrderReceipt(order, device.shopName));
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'พิมพ์ใบเสร็จไม่สำเร็จ');
    } finally {
      setPrinting(false);
    }
  }

  function changeQty(lineUuid: string, qty: number) {
    setCart((c) => reconcileDiscount(setQty(c, lineUuid, qty)));
  }

  if (menu.loading) {
    return <div className="sell__loading muted">กำลังโหลดเมนู…</div>;
  }

  if (menu.categories.length === 0) {
    return (
      <div className="sell__loading">
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
          <b>{activeTable ? `บิลโต๊ะ ${activeTable.tableNo || '—'}` : 'บิลปัจจุบัน'}</b>
          {!isEmpty(cart) && (
            <button
              type="button"
              className="linkbtn linkbtn--danger"
              onClick={() => {
                setCart(emptyCart);
                setActiveTable(null);
              }}
            >
              ล้างบิล
            </button>
          )}
        </div>

        {lastOrder !== null && (
          <div className="cart__done">
            <span>
              ปิดบิลเลขที่ {lastOrder.orderNo} แล้ว · กดเมนูเพื่อเริ่มบิลใหม่
            </span>
            {isPrinterSupported() && (
              <button
                type="button"
                className="btn"
                disabled={printing}
                onClick={() => void printReceipt(lastOrder)}
              >
                {printing ? 'กำลังพิมพ์…' : 'พิมพ์ใบเสร็จ'}
              </button>
            )}
            {printError && <p className="alert">{printError}</p>}
          </div>
        )}

        {splitDone.length > 0 && (
          <div className="cart__done">
            <span>แยกบิลสำเร็จ {splitDone.length} ใบ · กดเมนูเพื่อเริ่มบิลใหม่</span>
            <ul className="mlist" style={{ width: '100%' }}>
              {splitDone.map((o) => (
                <li key={o.clientUuid} className="mrow">
                  <div className="mrow__info">
                    <div className="mrow__name">บิลเลขที่ {o.orderNo}</div>
                    <div className="mrow__price">{formatBaht(o.total)}</div>
                  </div>
                  {isPrinterSupported() && (
                    <button
                      type="button"
                      className="btn"
                      disabled={printing}
                      onClick={() => void printReceipt(o)}
                    >
                      พิมพ์
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {printError && <p className="alert">{printError}</p>}
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
          <div className="cart__paybtns">
            <button
              type="button"
              className="btn"
              disabled={isEmpty(cart) || activeTable !== null}
              onClick={() => setSplitting(true)}
            >
              แยกบิล
            </button>
            <button
              type="button"
              className="btn btn--primary btn--pay"
              disabled={isEmpty(cart)}
              onClick={() => setPaying(true)}
            >
              รับเงิน
            </button>
          </div>
        </div>
      </aside>

      {paying && (
        <PayDialog
          // เปลี่ยน key ทุกครั้งที่ขยับไปกลุ่มถัดไปตอนแยกบิล เพื่อบังคับให้ React
          // สร้างคอมโพเนนต์ใหม่ทั้งตัว — ไม่งั้น busy/received/ส่วนลดของกลุ่มก่อน
          // จะค้างข้ามมา (โดยเฉพาะ busy ที่ไม่เคยเซ็ตกลับเป็น false ตอนสำเร็จ
          // เพราะปกติ dialog จะถูกปิดไปเลยหลังจ่ายเสร็จ แต่ตอนแยกบิล dialog
          // ยังเปิดค้างไว้เพื่อจ่ายกลุ่มถัดไปทันที)
          key={payQueue.length}
          cart={payQueue.length > 0 ? (payQueue[0] ?? cart) : cart}
          shopId={device.shopId}
          staffId={profile.staffId}
          promptpayId={promptpayId}
          tableNo={activeTable?.tableNo}
          tableSessionId={activeTable?.tableSessionId}
          sourceOrderIds={activeTable?.sourceOrderIds}
          onCancel={() => {
            setPaying(false);
            // กลุ่มที่ยังไม่ได้จ่ายยังอยู่ในตะกร้าเดิม (ยังไม่ได้ตัดออก) ให้กดรับเงินใหม่เองได้
            setPayQueue([]);
          }}
          onDone={(order) => {
            if (payQueue.length > 0) {
              const justPaid = payQueue[0];
              const rest = payQueue.slice(1);
              const paidUuids = new Set((justPaid?.lines ?? []).map((l) => l.clientUuid));
              setCart((c) => ({ ...c, lines: c.lines.filter((l) => !paidUuids.has(l.clientUuid)) }));
              setSplitDone((d) => [...d, order]);

              if (rest.length > 0) {
                setPayQueue(rest);
              } else {
                setPayQueue([]);
                setPaying(false);
                setActiveTable(null);
                setLastOrder(null);
              }
              return;
            }

            setPaying(false);
            setCart(emptyCart);
            setLastOrder(order);
            setPrintError(null);
            setActiveTable(null);
          }}
          onDiscountChange={(next) => {
            if (payQueue.length > 0) {
              setPayQueue((q) => [next, ...q.slice(1)]);
            } else {
              setCart(next);
            }
          }}
        />
      )}

      {pickingItem && (
        <ModifierPicker
          item={pickingItem}
          onCancel={() => setPickingItem(null)}
          onConfirm={(modifiers) => confirmModifiers(pickingItem, modifiers)}
        />
      )}

      {splitting && (
        <SplitBillDialog
          cart={cart}
          onCancel={() => setSplitting(false)}
          onSplitByItem={(groups) => {
            setSplitting(false);
            setSplitDone([]);
            setLastOrder(null);
            setPayQueue(groups);
            setPaying(true);
          }}
        />
      )}
    </div>
  );
}
