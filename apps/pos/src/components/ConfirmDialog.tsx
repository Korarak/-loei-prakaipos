/**
 * กล่องยืนยันในแอป
 *
 * ใช้แทน window.confirm() เสมอ — กล่องของเบราว์เซอร์บล็อกทั้งหน้าจอ
 * ถ้าโผล่ตอนพนักงานกำลังเปิดบิลอยู่ เขาจะกดอะไรไม่ได้เลยจนกว่าจะตอบ
 * และบนแท็บเล็ตบางรุ่นกล่องนั้นอาจโผล่นอกจอที่มองเห็น
 */
export function ConfirmDialog({
  title,
  detail,
  confirmLabel = 'ยืนยัน',
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  detail?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="sheet">
      <div className="sheet__panel" role="alertdialog" aria-label={title}>
        <h2>{title}</h2>
        {detail && <p className="muted">{detail}</p>}
        <div className="sheet__actions">
          <button type="button" className="btn" onClick={onCancel}>
            ยกเลิก
          </button>
          <button
            type="button"
            className={danger ? 'btn btn--danger' : 'btn btn--primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
