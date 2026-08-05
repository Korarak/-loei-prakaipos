import { TriangleAlert } from 'lucide-react';
import type { ShopSettings } from '../shop/shopSettings.js';

/** เตือนล่วงหน้ากี่วันก่อนแผนที่จ่ายเงินจะหมดอายุ */
const WARN_DAYS_BEFORE_EXPIRY = 14;

/**
 * แถบเตือนแผนสมาชิก — เอกสารออกแบบหัวข้อ 11
 *
 * เตือนอย่างเดียว **ไม่บล็อกการขาย** ไม่มีปุ่ม disable ใดๆ ในแอปทั้งหมด
 * เพราะความเสี่ยงจากบั๊ก (บล็อกร้านที่จ่ายเงินจริงขายไม่ได้กลางมื้น) สูงกว่า
 * ประโยชน์ของการบล็อก — ตัดสินใจร่วมกับผู้ใช้แล้ว
 */
export function PlanBanner({ shop }: { shop: ShopSettings | null }) {
  if (!shop) return null;

  if (!shop.plan || shop.plan === 'trial') {
    return (
      <div className="updatebar updatebar--warn">
        <TriangleAlert size={16} aria-hidden="true" />
        <span>กำลังใช้แผนทดลอง — ยังไม่รวม QR Order ติดต่อทีมงานเพื่ออัปเกรดแผน</span>
      </div>
    );
  }

  if (!shop.planExpiresAt) return null;

  const expiresAt = new Date(shop.planExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) return null;

  const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000);
  if (daysLeft > WARN_DAYS_BEFORE_EXPIRY) return null;

  const label =
    daysLeft < 0
      ? `แผนหมดอายุแล้ว ${Math.abs(daysLeft)} วัน — กรุณาต่ออายุ`
      : daysLeft === 0
        ? 'แผนหมดอายุวันนี้ — กรุณาต่ออายุ'
        : `แผนจะหมดอายุในอีก ${daysLeft} วัน — กรุณาต่ออายุ`;

  return (
    <div className="updatebar updatebar--warn">
      <TriangleAlert size={16} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
