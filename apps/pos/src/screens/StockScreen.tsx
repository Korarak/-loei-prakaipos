import type { Ingredient } from '@prakaipos/shared';
import { formatBaht, parseBahtInput } from '@prakaipos/shared';
import { useState } from 'react';
import type { StaffProfile } from '../auth/credentials.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import {
  createIngredient,
  deleteIngredient,
  recordStockMovement,
  updateIngredient,
  type IngredientInput,
} from '../stock/stockActions.js';
import { useIngredients } from '../stock/useIngredients.js';

interface StockScreenProps {
  shopId: string;
  profile: StaffProfile;
}

/** จัดการวัตถุดิบและสต๊อก — เจ้าของร้านเท่านั้น (ดูเหตุผลใน stock/stockActions.ts) */
export function StockScreen({ shopId, profile }: StockScreenProps) {
  const stock = useIngredients(shopId);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Ingredient | 'new' | null>(null);
  const [moving, setMoving] = useState<Ingredient | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Ingredient | null>(null);

  if (profile.role !== 'owner') {
    return (
      <div className="panel">
        <h1>เฉพาะเจ้าของร้าน</h1>
        <p className="muted">การจัดการวัตถุดิบและสต๊อกเข้าได้เฉพาะบัญชีเจ้าของร้าน</p>
      </div>
    );
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      await stock.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ทำรายการไม่สำเร็จ');
    }
  }

  return (
    <>
      <div className="app__toolbar">
        <div className="app__spacer" />
        <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
          + เพิ่มวัตถุดิบ
        </button>
      </div>

      {error && <p className="alert">{error}</p>}

        {stock.loading ? (
          <p className="muted">กำลังโหลด…</p>
        ) : stock.error ? (
          <p className="alert">{stock.error}</p>
        ) : stock.ingredients.length === 0 ? (
          <div className="panel">
            <h1>ยังไม่มีวัตถุดิบ</h1>
            <p className="muted">
              เพิ่มวัตถุดิบแล้วไปตั้งสูตร (BOM) ที่หน้าจัดการเมนู เพื่อดูต้นทุนและกำไรต่อเมนู
            </p>
          </div>
        ) : (
          <ul className="mlist">
            {stock.ingredients.map((ing) => (
              <li key={ing.id} className="mrow">
                <div className="mrow__info">
                  <div className="mrow__name">{ing.name}</div>
                  <div className="mrow__price">
                    คงเหลือ {ing.stockQty} {ing.unit} · ต้นทุน {formatBaht(ing.costPerUnit)}/{ing.unit}
                  </div>
                </div>
                <button type="button" className="toggle" onClick={() => setMoving(ing)}>
                  ปรับสต๊อก
                </button>
                <button type="button" className="linkbtn" onClick={() => setEditing(ing)}>
                  แก้ไข
                </button>
                <button
                  type="button"
                  className="linkbtn linkbtn--danger"
                  onClick={() => setConfirmDelete(ing)}
                >
                  ลบ
                </button>
              </li>
            ))}
          </ul>
        )}

      {confirmDelete && (
        <ConfirmDialog
          title={`ลบวัตถุดิบ "${confirmDelete.name}"`}
          detail="เมนูที่ใช้วัตถุดิบนี้ในสูตรจะคำนวณต้นทุนส่วนนี้เป็น 0 แทน"
          confirmLabel="ลบ"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() =>
            void run(async () => {
              await deleteIngredient(confirmDelete.id);
              setConfirmDelete(null);
            })
          }
        />
      )}

      {editing && (
        <IngredientDialog
          ingredient={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={(input) =>
            void run(async () => {
              if (editing === 'new') {
                await createIngredient(shopId, input);
              } else {
                await updateIngredient(editing.id, input);
              }
              setEditing(null);
            })
          }
        />
      )}

      {moving && (
        <StockMoveDialog
          ingredient={moving}
          onCancel={() => setMoving(null)}
          onSave={(type, delta, note) =>
            void run(async () => {
              await recordStockMovement(shopId, moving.id, profile.staffId, type, delta, note);
              setMoving(null);
            })
          }
        />
      )}
    </>
  );
}

function IngredientDialog({
  ingredient,
  onCancel,
  onSave,
}: {
  ingredient: Ingredient | null;
  onCancel: () => void;
  onSave: (input: IngredientInput & { stockQty?: number }) => void;
}) {
  const [name, setName] = useState(ingredient?.name ?? '');
  const [unit, setUnit] = useState(ingredient?.unit ?? '');
  const [costText, setCostText] = useState(
    ingredient ? (ingredient.costPerUnit / 100).toFixed(2) : '',
  );
  const [stockText, setStockText] = useState(ingredient ? String(ingredient.stockQty) : '0');
  const [invalid, setInvalid] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cost = parseBahtInput(costText);
    if (cost === null || cost < 0) {
      setInvalid('กรอกต้นทุนต่อหน่วยเป็นตัวเลข เช่น 2.50');
      return;
    }
    if (!unit.trim()) {
      setInvalid('กรอกหน่วยนับ เช่น กรัม, มล., ชิ้น');
      return;
    }
    const stockQty = Number.parseFloat(stockText);
    onSave({
      name: name.trim(),
      unit: unit.trim(),
      costPerUnit: cost,
      stockQty: Number.isFinite(stockQty) ? stockQty : 0,
    });
  }

  return (
    <div className="sheet">
      <form className="sheet__panel" onSubmit={submit}>
        <h2>{ingredient ? 'แก้ไขวัตถุดิบ' : 'เพิ่มวัตถุดิบ'}</h2>

        <label className="field">
          <span>ชื่อวัตถุดิบ</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น กุ้ง" required />
        </label>

        <label className="field">
          <span>หน่วยนับ</span>
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="เช่น กรัม, มล., ชิ้น"
            required
          />
        </label>

        <label className="field">
          <span>ต้นทุนต่อหน่วย (บาท)</span>
          <input
            value={costText}
            onChange={(e) => setCostText(e.target.value)}
            inputMode="decimal"
            placeholder="2.50"
            required
          />
        </label>

        {!ingredient && (
          <label className="field">
            <span>คงเหลือเริ่มต้น</span>
            <input
              value={stockText}
              onChange={(e) => setStockText(e.target.value)}
              inputMode="decimal"
            />
          </label>
        )}

        {invalid && <p className="alert">{invalid}</p>}

        <div className="sheet__actions">
          <button type="button" className="btn" onClick={onCancel}>
            ยกเลิก
          </button>
          <button type="submit" className="btn btn--primary">
            บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}

const MOVE_LABEL = { receive: 'รับเข้า', deduct: 'ตัดออก', count: 'นับสต๊อก (ตั้งค่าใหม่)' } as const;

function StockMoveDialog({
  ingredient,
  onCancel,
  onSave,
}: {
  ingredient: Ingredient;
  onCancel: () => void;
  onSave: (type: 'receive' | 'deduct' | 'count', delta: number, note: string) => void;
}) {
  const [type, setType] = useState<'receive' | 'deduct' | 'count'>('receive');
  const [qtyText, setQtyText] = useState('');
  const [note, setNote] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number.parseFloat(qtyText);
    if (!Number.isFinite(qty) || qty < 0) {
      setInvalid('กรอกจำนวนเป็นตัวเลข');
      return;
    }

    if (type === 'receive') onSave('receive', qty, note.trim());
    else if (type === 'deduct') onSave('deduct', -qty, note.trim());
    else onSave('count', qty - ingredient.stockQty, note.trim());
  }

  return (
    <div className="sheet">
      <form className="sheet__panel" onSubmit={submit}>
        <h2>ปรับสต๊อก — {ingredient.name}</h2>
        <p className="hint">
          คงเหลือปัจจุบัน {ingredient.stockQty} {ingredient.unit}
        </p>

        <div className="pay__methods">
          {(['receive', 'deduct', 'count'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={type === t ? 'chip chip--on' : 'chip'}
              onClick={() => setType(t)}
            >
              {MOVE_LABEL[t]}
            </button>
          ))}
        </div>

        <label className="field">
          <span>{type === 'count' ? `จำนวนที่นับได้จริง (${ingredient.unit})` : `จำนวน (${ingredient.unit})`}</span>
          <input value={qtyText} onChange={(e) => setQtyText(e.target.value)} inputMode="decimal" required />
        </label>

        <label className="field">
          <span>หมายเหตุ (ไม่บังคับ)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น รับจากซัพพลายเออร์" />
        </label>

        {invalid && <p className="alert">{invalid}</p>}

        <div className="sheet__actions">
          <button type="button" className="btn" onClick={onCancel}>
            ยกเลิก
          </button>
          <button type="submit" className="btn btn--primary">
            บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}
