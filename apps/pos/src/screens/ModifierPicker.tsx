import { X } from 'lucide-react';
import type { MenuItem, ModifierGroup, SelectedModifier } from '@prakaipos/shared';
import { formatBaht } from '@prakaipos/shared';
import { useState } from 'react';
import { priceWithModifiers } from '../sell/cart.js';

interface ModifierPickerProps {
  item: MenuItem;
  onCancel: () => void;
  onConfirm: (modifiers: SelectedModifier[]) => void;
}

/** เลือกอย่างน้อยหนึ่งตัวเลือกในกลุ่มที่ required — เช็คทีละกลุ่ม ไม่รวมข้อความเดียว เพื่อบอกได้ชัดว่าขาดกลุ่มไหน */
function missingRequiredGroup(groups: ModifierGroup[], selected: Record<string, Set<string>>): string | null {
  for (const g of groups) {
    if (g.required && (selected[g.id]?.size ?? 0) === 0) return g.name;
  }
  return null;
}

/** เมนูที่มีตัวเลือก/ท็อปปิ้ง ต้องเลือกก่อนเพิ่มลงตะกร้าเสมอ (ดูเหตุผลใน SellScreen.addToCart) */
export function ModifierPicker({ item, onCancel, onConfirm }: ModifierPickerProps) {
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [error, setError] = useState<string | null>(null);

  function toggle(group: ModifierGroup, optionId: string) {
    setError(null);
    setSelected((cur) => {
      const current = cur[group.id] ?? new Set<string>();
      const next = new Set(current);

      if (group.multiple) {
        next.has(optionId) ? next.delete(optionId) : next.add(optionId);
      } else {
        // เลือกได้ตัวเดียว — กดตัวที่เลือกอยู่ซ้ำเพื่อยกเลิกได้ (กลุ่มที่ไม่บังคับ)
        next.clear();
        if (!current.has(optionId)) next.add(optionId);
      }

      return { ...cur, [group.id]: next };
    });
  }

  const chosen: SelectedModifier[] = item.modifierGroups.flatMap((g) =>
    g.options
      .filter((o) => selected[g.id]?.has(o.id))
      .map((o) => ({ groupName: g.name, optionName: o.name, priceDelta: o.priceDelta })),
  );

  function confirm() {
    const missing = missingRequiredGroup(item.modifierGroups, selected);
    if (missing) {
      setError(`กรุณาเลือก "${missing}" ก่อน`);
      return;
    }
    onConfirm(chosen);
  }

  return (
    <div className="sheet">
      <div className="sheet__panel">
        <h2>{item.name}</h2>

        {item.modifierGroups.map((group) => (
          <div key={group.id} className="field">
            <span>
              {group.name}
              {group.required && ' (ต้องเลือก)'}
            </span>
            <div className="chips">
              {group.options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={selected[group.id]?.has(opt.id) ? 'chip chip--on' : 'chip'}
                  onClick={() => toggle(group, opt.id)}
                >
                  {opt.name}
                  {opt.priceDelta > 0 && ` +${formatBaht(opt.priceDelta)}`}
                </button>
              ))}
            </div>
          </div>
        ))}

        {error && <p className="alert">{error}</p>}

        <div className="sheet__actions">
          <button type="button" className="btn" onClick={onCancel}>
            <X size={16} aria-hidden="true" />
            ยกเลิก
          </button>
          <button type="button" className="btn btn--primary" onClick={confirm}>
            เพิ่มลงตะกร้า · {formatBaht(priceWithModifiers(item, chosen))}
          </button>
        </div>
      </div>
    </div>
  );
}
