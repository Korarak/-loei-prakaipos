import type { Order, PaymentMethod } from '@prakaipos/shared';
import { formatBaht, parseBahtInput } from '@prakaipos/shared';
import { useState } from 'react';
import { PromptPayQR } from '../components/PromptPayQR.js';
import { enqueue } from '../db/outbox.js';
import { setDiscount, subtotal, total, type CartState } from '../sell/cart.js';
import { checkout } from '../sell/checkout.js';

/**
 * หน้ารับเงิน
 *
 * ปุ่มเงินด่วน (100/500/1000/พอดี) มีเพราะพนักงานคิดเงินทอนในหัวช้ากว่าเครื่อง
 * และการพิมพ์จำนวนเงินตอนลูกค้าต่อคิวคือจุดที่กดผิดบ่อยที่สุด
 */

interface PayDialogProps {
  cart: CartState;
  shopId: string;
  staffId: string;
  promptpayId: string;
  /** เลขโต๊ะ — มีค่าเมื่อบิลนี้แปลงมาจากออร์เดอร์ QR ของโต๊ะนั้น */
  tableNo?: string;
  /** รอบนั่งที่บิลนี้มาจาก และ id ของออร์เดอร์ QR ต้นทางที่ต้องปิดพร้อมกัน */
  tableSessionId?: string;
  sourceOrderIds?: string[];
  onCancel: () => void;
  onDone: (order: Order) => void;
  onDiscountChange: (cart: CartState) => void;
}

/** ธนบัตรที่คนไทยจ่ายบ่อยที่สุด */
const QUICK_NOTES = [2000, 5000, 10000, 100000];

export function PayDialog({
  cart,
  shopId,
  staffId,
  promptpayId,
  tableNo,
  tableSessionId,
  sourceOrderIds,
  onCancel,
  onDone,
  onDiscountChange,
}: PayDialogProps) {
  const due = total(cart);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [receivedText, setReceivedText] = useState('');
  const [discountText, setDiscountText] = useState(
    cart.discount > 0 ? (cart.discount / 100).toFixed(2) : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const received = method === 'cash' ? (parseBahtInput(receivedText) ?? 0) : due;
  const change = Math.max(0, received - due);
  const enough = received >= due;

  function applyDiscount(text: string) {
    setDiscountText(text);
    const value = parseBahtInput(text);
    onDiscountChange(setDiscount(cart, value ?? 0));
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const result = await checkout({
        shopId,
        staffId,
        cart,
        method,
        received: method === 'cash' ? received : due,
        tableNo,
        tableSessionId,
      });

      // บิลนี้แปลงมาจากออร์เดอร์ QR — ต้องปิดออร์เดอร์ต้นทางกับรอบนั่งด้วย
      // ผ่านคิวเดียวกับบิลทุกใบ (ไม่เรียกเซิร์ฟเวอร์ตรง) เพื่อให้ทนเน็ตหลุดได้
      // เหมือนกัน ไม่ใช่แค่บิลใหม่ที่ปลอดภัยแต่ของเก่าค้างสถานะผิด
      if (sourceOrderIds && sourceOrderIds.length > 0) {
        for (const id of sourceOrderIds) {
          await enqueue({
            collection: 'orders',
            op: 'update',
            clientUuid: id,
            serverId: id,
            payload: { status: 'paid' },
          });
        }
      }
      if (tableSessionId) {
        await enqueue({
          collection: 'table_sessions',
          op: 'update',
          clientUuid: tableSessionId,
          serverId: tableSessionId,
          payload: { closed_at: new Date().toISOString() },
        });
      }

      onDone(result.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ปิดบิลไม่สำเร็จ');
      setBusy(false);
    }
  }

  return (
    <div className="sheet">
      <div className="sheet__panel sheet__panel--pay">
        <h2>รับเงิน</h2>

        <div className="pay__due">
          <span>ยอดที่ต้องจ่าย</span>
          <b>{formatBaht(due)}</b>
        </div>

        <label className="field">
          <span>ส่วนลด (บาท)</span>
          <input
            value={discountText}
            onChange={(e) => applyDiscount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
          />
          {cart.discount > 0 && (
            <small className="hint">
              จากยอดรวม {formatBaht(subtotal(cart))} เหลือ {formatBaht(due)}
            </small>
          )}
        </label>

        <div className="pay__methods">
          <button
            type="button"
            className={method === 'cash' ? 'chip chip--on' : 'chip'}
            onClick={() => setMethod('cash')}
          >
            เงินสด
          </button>
          <button
            type="button"
            className={method === 'promptpay' ? 'chip chip--on' : 'chip'}
            onClick={() => setMethod('promptpay')}
          >
            พร้อมเพย์
          </button>
        </div>

        {method === 'cash' ? (
          <>
            <label className="field">
              <span>รับเงินมา (บาท)</span>
              <input
                value={receivedText}
                onChange={(e) => setReceivedText(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
              />
            </label>

            <div className="pay__quick">
              <button
                type="button"
                className="chip"
                onClick={() => setReceivedText((due / 100).toFixed(2))}
              >
                พอดี {formatBaht(due)}
              </button>
              {QUICK_NOTES.filter((n) => n >= due).map((n) => (
                <button
                  key={n}
                  type="button"
                  className="chip"
                  onClick={() => setReceivedText((n / 100).toFixed(2))}
                >
                  {formatBaht(n)}
                </button>
              ))}
            </div>

            <div className={enough ? 'pay__change' : 'pay__change pay__change--short'}>
              <span>{enough ? 'เงินทอน' : 'ยังขาดอีก'}</span>
              <b>{formatBaht(enough ? change : due - received)}</b>
            </div>
          </>
        ) : promptpayId ? (
          <PromptPayQR promptpayId={promptpayId} amount={due} />
        ) : (
          <p className="alert">
            ร้านยังไม่ได้ตั้งเลขพร้อมเพย์ · รับเงินสดไปก่อน
            แล้วให้เจ้าของร้านตั้งค่าในหน้า admin
          </p>
        )}

        {error && <p className="alert">{error}</p>}

        <div className="sheet__actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || (method === 'cash' && !enough) || due === 0}
            onClick={() => void confirm()}
          >
            {busy ? 'กำลังบันทึก…' : 'ปิดบิล'}
          </button>
        </div>
      </div>
    </div>
  );
}
