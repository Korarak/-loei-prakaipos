import type { ModifierGroup, SelectedModifier } from '@prakaipos/shared';
import { formatBaht, sumModifierDeltas } from '@prakaipos/shared';
import { X } from 'lucide-react';
import { useState } from 'react';
import type { PublicMenuItem } from './useMenu.js';

interface ModifierPickerProps {
  item: PublicMenuItem;
  onCancel: () => void;
  onConfirm: (modifiers: SelectedModifier[], modifierOptionIds: string[]) => void;
}

function missingRequiredGroup(
  groups: ModifierGroup[],
  selected: Record<string, Set<string>>,
): string | null {
  for (const g of groups) {
    if (g.required && (selected[g.id]?.size ?? 0) === 0) return g.name;
  }
  return null;
}

/** เมนูที่มีตัวเลือก/ท็อปปิ้ง ต้องเลือกก่อนเพิ่มลงตะกร้าเสมอ เหมือนฝั่ง POS */
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
        next.clear();
        if (!current.has(optionId)) next.add(optionId);
      }

      return { ...cur, [group.id]: next };
    });
  }

  const chosenOptions = item.modifierGroups.flatMap((g) =>
    g.options.filter((o) => selected[g.id]?.has(o.id)).map((o) => ({ group: g, option: o })),
  );
  const chosenModifiers: SelectedModifier[] = chosenOptions.map(({ group, option }) => ({
    groupName: group.name,
    optionName: option.name,
    priceDelta: option.priceDelta,
  }));

  function confirm() {
    const missing = missingRequiredGroup(item.modifierGroups, selected);
    if (missing) {
      setError(`กรุณาเลือก "${missing}" ก่อน`);
      return;
    }
    onConfirm(
      chosenModifiers,
      chosenOptions.map(({ option }) => option.id),
    );
  }

  return (
    <div className="sheet" onClick={onCancel}>
      <div className="sheet__panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__head">
          <h2>{item.name}</h2>
          <button type="button" className="sheet__close" onClick={onCancel} aria-label="ปิด">
            <X size={20} />
          </button>
        </div>

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

        {error && <p className="error">{error}</p>}

        <div className="sheet__actions">
          <button type="button" className="btn" onClick={onCancel}>
            ยกเลิก
          </button>
          <button type="button" className="btn btn--primary" onClick={confirm}>
            เพิ่มลงตะกร้า · {formatBaht(item.price + sumModifierDeltas(chosenModifiers))}
          </button>
        </div>
      </div>
    </div>
  );
}
