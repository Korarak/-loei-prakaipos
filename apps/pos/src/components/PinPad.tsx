import { useEffect, useState } from 'react';

/**
 * แป้นตัวเลขสำหรับกรอก PIN
 *
 * ทำเป็นแป้นเองแทน <input type="number"> เพราะ:
 * - แป้นของระบบกินพื้นที่จอครึ่งหนึ่งและตำแหน่งปุ่มต่างกันในแต่ละเครื่อง
 * - ปุ่มที่เรากำหนดเองใหญ่ได้ตามที่ต้องการ พนักงานกดตอนรีบและมือเปียกได้
 * - ไม่มีการ autocomplete หรือประวัติการกรอกโผล่มาให้คนข้างหลังเห็น
 */

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export interface PinPadProps {
  /** จำนวนหลักที่ต้องกรอกครบก่อนส่ง */
  length?: number;
  disabled?: boolean;
  /** เรียกเมื่อกรอกครบตามจำนวนหลัก */
  onSubmit: (pin: string) => void;
  /** ข้อความผิดพลาดจากการลองครั้งก่อน — เปลี่ยนค่าแล้วล้างสิ่งที่กรอกค้างไว้ */
  error?: string | null;
}

export function PinPad({ length = 4, disabled = false, onSubmit, error }: PinPadProps) {
  const [pin, setPin] = useState('');

  // ล้างสิ่งที่กรอกเมื่อมีข้อความผิดพลาดใหม่เข้ามา
  // พนักงานจะได้ไม่ต้องกดลบทีละตัวหลังกรอกผิด
  useEffect(() => {
    if (error) setPin('');
  }, [error]);

  useEffect(() => {
    if (pin.length !== length) return;
    // ส่งใน microtask ถัดไป เพื่อให้จุดสุดท้ายวาดขึ้นจอก่อน
    // ไม่งั้นหน้าจอจะกระโดดโดยที่พนักงานไม่ทันเห็นว่ากดครบแล้ว
    const id = setTimeout(() => onSubmit(pin), 80);
    return () => clearTimeout(id);
  }, [pin, length, onSubmit]);

  const press = (digit: string) => {
    if (disabled || pin.length >= length) return;
    setPin((p) => p + digit);
  };

  const backspace = () => {
    if (disabled) return;
    setPin((p) => p.slice(0, -1));
  };

  return (
    <div className="pinpad">
      <div className="pinpad__dots" aria-label={`กรอกแล้ว ${pin.length} จาก ${length} หลัก`}>
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            className={i < pin.length ? 'pinpad__dot pinpad__dot--on' : 'pinpad__dot'}
          />
        ))}
      </div>

      <p className={error ? 'pinpad__msg pinpad__msg--error' : 'pinpad__msg'}>
        {error ?? ' '}
      </p>

      <div className="pinpad__keys">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className="pinpad__key"
            disabled={disabled}
            onClick={() => press(k)}
          >
            {k}
          </button>
        ))}
        {/* ช่องว่างมุมซ้ายล่าง ให้ 0 อยู่กลางตามแป้นโทรศัพท์ที่ทุกคนคุ้นเคย */}
        <span />
        <button
          type="button"
          className="pinpad__key"
          disabled={disabled}
          onClick={() => press('0')}
        >
          0
        </button>
        <button
          type="button"
          className="pinpad__key pinpad__key--alt"
          disabled={disabled || pin.length === 0}
          onClick={backspace}
          aria-label="ลบหนึ่งหลัก"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
