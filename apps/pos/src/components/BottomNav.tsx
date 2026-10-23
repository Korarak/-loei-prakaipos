import { LayoutDashboard, Receipt, Table2, UtensilsCrossed } from 'lucide-react';
import type { ComponentType } from 'react';

/**
 * แถบนำทางถาวรด้านล่าง — สลับ 4 หน้าหลักได้ในแตะเดียวโดยไม่ต้องกลับหน้าแรกก่อน
 * (ก่อนหน้านี้ เช่น จากขายไปผังโต๊ะ ต้องกดกลับหน้าแรกก่อนเสมอ)
 *
 * หน้าที่ใช้ไม่บ่อย (พนักงาน/สต๊อก/เครื่องพิมพ์) ยังคงเข้าทางหน้าแรกเท่านั้น
 * ไม่ใส่ไว้ในนี้ ไม่ให้แถบรกและกดพลาดง่ายขึ้น
 */

export type BottomNavScreen = 'sell' | 'tables' | 'dashboard' | 'menu';

const ITEMS: { screen: BottomNavScreen; label: string; hue: string; icon: ComponentType<{ size?: number }> }[] = [
  { screen: 'sell', hue: 'accent', label: 'ขาย', icon: Receipt },
  { screen: 'tables', hue: 'violet', label: 'โต๊ะ', icon: Table2 },
  { screen: 'dashboard', hue: 'green', label: 'แดชบอร์ด', icon: LayoutDashboard },
  { screen: 'menu', hue: 'amber', label: 'เมนู', icon: UtensilsCrossed },
];

interface BottomNavProps {
  active: BottomNavScreen | null;
  tablesEnabled: boolean;
  onNavigate: (screen: BottomNavScreen) => void;
}

export function BottomNav({ active, tablesEnabled, onNavigate }: BottomNavProps) {
  const items = ITEMS.filter((item) => item.screen !== 'tables' || tablesEnabled);

  return (
    <nav className="bottomnav">
      {items.map(({ screen, label, hue, icon: Icon }) => (
        <button
          key={screen}
          type="button"
          className={screen === active ? 'bottomnav__item bottomnav__item--on' : 'bottomnav__item'}
          data-hue={hue}
          onClick={() => onNavigate(screen)}
          aria-current={screen === active ? 'page' : undefined}
        >
          <span className="bottomnav__icon">
            <Icon size={22} />
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
