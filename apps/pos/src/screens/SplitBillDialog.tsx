import { X } from 'lucide-react';
import { formatBaht } from '@prakaipos/shared';
import { useState } from 'react';
import { splitByGroups, splitEvenly, total, type CartState } from '../sell/cart.js';

interface SplitBillDialogProps {
  cart: CartState;
  onCancel: () => void;
  /** แยกตามรายการ — ปิดบิลย่อยทีละใบตามลำดับกลุ่ม */
  onSplitByItem: (groups: CartState[]) => void;
}

type Mode = 'even' | 'byItem';

/**
 * แยกบิล — สองแบบตามเอกสารออกแบบหัวข้อ 06
 *
 * "หารเท่า" เป็นแค่เครื่องคิดเลขบอกยอดต่อคน ไม่ได้แตะโครงสร้างบิล —
 * พนักงานเก็บเงินตามยอดที่บอกแล้วปิดบิลตามปกติผ่านหน้ารับเงินเดิม
 * เพราะบิลใบเดียวกันแค่แบ่งจ่ายหลายคน ไม่ใช่หลายบิล
 *
 * "แยกตามรายการ" ถึงจะเป็นบิลจริงหลายใบ เพราะแต่ละกลุ่มอาจจ่ายวิธีต่างกัน
 * (เงินสด/พร้อมเพย์) และควรได้ใบเสร็จแยกของตัวเอง
 */
export function SplitBillDialog({ cart, onCancel, onSplitByItem }: SplitBillDialogProps) {
  const [mode, setMode] = useState<Mode>('even');
  const [peopleText, setPeopleText] = useState('2');
  const [groupCount, setGroupCount] = useState(2);
  const [assignment, setAssignment] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const due = total(cart);
  const people = Math.max(2, Math.min(20, Number.parseInt(peopleText, 10) || 2));
  const shares = splitEvenly(due, people);

  function assign(lineUuid: string, group: number) {
    setAssignment((cur) => ({ ...cur, [lineUuid]: group }));
  }

  function confirmSplit() {
    const unassigned = cart.lines.some((l) => assignment[l.clientUuid] === undefined);
    if (unassigned) {
      setError('ยังมีรายการที่ไม่ได้เลือกกลุ่ม');
      return;
    }
    const groups = splitByGroups(cart, (uuid) => assignment[uuid] ?? 0, groupCount);
    if (groups.some((g) => g.lines.length === 0)) {
      setError('ทุกกลุ่มต้องมีอย่างน้อย 1 รายการ');
      return;
    }
    onSplitByItem(groups);
  }

  return (
    <div className="sheet">
      <div className="sheet__panel">
        <h2>แยกบิล</h2>

        <div className="pay__methods">
          <button
            type="button"
            className={mode === 'even' ? 'chip chip--on' : 'chip'}
            onClick={() => setMode('even')}
          >
            หารเท่า
          </button>
          <button
            type="button"
            className={mode === 'byItem' ? 'chip chip--on' : 'chip'}
            onClick={() => setMode('byItem')}
          >
            แยกตามรายการ
          </button>
        </div>

        {mode === 'even' ? (
          <>
            <label className="field">
              <span>จำนวนคน</span>
              <input
                value={peopleText}
                onChange={(e) => setPeopleText(e.target.value)}
                inputMode="numeric"
              />
            </label>
            <ul className="mlist">
              {shares.map((share, i) => (
                <li key={i} className="mrow">
                  <div className="mrow__info">
                    <div className="mrow__name">คนที่ {i + 1}</div>
                  </div>
                  <div className="mrow__price">{formatBaht(share)}</div>
                </li>
              ))}
            </ul>
            <p className="hint">
              ยอดรวม {formatBaht(due)} — เก็บเงินตามยอดนี้แล้วกลับไปกด "รับเงิน" ปิดบิลตามปกติ
              (บิลยังเป็นใบเดียว แค่แบ่งเก็บเงินหลายคน)
            </p>
          </>
        ) : (
          <>
            <label className="field">
              <span>จำนวนกลุ่ม</span>
              <div className="chips">
                {[2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={groupCount === n ? 'chip chip--on' : 'chip'}
                    onClick={() => setGroupCount(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </label>

            <ul className="mlist">
              {cart.lines.map((l) => (
                <li key={l.clientUuid} className="mrow">
                  <div className="mrow__info">
                    <div className="mrow__name">
                      {l.qty}× {l.nameSnapshot}
                    </div>
                    <div className="mrow__price">{formatBaht(l.unitPrice * l.qty)}</div>
                  </div>
                  <div className="chips">
                    {Array.from({ length: groupCount }, (_, g) => (
                      <button
                        key={g}
                        type="button"
                        className={assignment[l.clientUuid] === g ? 'chip chip--on' : 'chip'}
                        onClick={() => assign(l.clientUuid, g)}
                      >
                        {g + 1}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {error && <p className="alert">{error}</p>}

        <div className="sheet__actions">
          <button type="button" className="btn" onClick={onCancel}>
            <X size={16} aria-hidden="true" />
            ยกเลิก
          </button>
          {mode === 'byItem' && (
            <button type="button" className="btn btn--primary" onClick={confirmSplit}>
              แยกบิล {groupCount} ใบ
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
