import {
  History,
  LayoutDashboard,
  Package,
  Printer,
  Receipt,
  Settings,
  SlidersHorizontal,
  Table2,
  UtensilsCrossed,
  Users,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { StaffProfile } from '../auth/credentials.js';
import { canToggleSimple, homeDestinations, type HomeDestination } from '../ui/simpleMode.js';

/**
 * หน้าแรกหลังล็อกอิน
 *
 * ก่อนหน้านี้ล็อกอินแล้วเข้าหน้าขายตรงๆ ไม่มีที่ไหนบอกว่ามีเมนูอะไรบ้าง
 * ทำให้พนักงานใหม่งงว่าเปิดมาเจออะไร หน้านี้แก้ตรงนั้น — เป็นทางเข้าเดียว
 * ไปหาทุกส่วนของระบบ กดครั้งเดียวถึงหน้าขายเหมือนเดิม (PIN login เกิดแค่
 * ตอนต้นกะ ไม่ใช่ทุกบิล จึงไม่ได้เพิ่มขั้นตอนตอนขายจริง)
 */

export type { HomeDestination };

interface Card {
  name: string;
  sub: string;
  hue: string;
  icon: ComponentType<{ size?: number }>;
}

const CARDS: Record<HomeDestination, Card> = {
  sell: { name: 'หน้าขาย', sub: 'เลือกเมนู คิดเงิน รับออร์เดอร์ QR', hue: 'primary', icon: Receipt },
  dashboard: { name: 'แดชบอร์ด', sub: 'ยอดขายวันนี้ เมนูขายดี', hue: 'green', icon: LayoutDashboard },
  orders: { name: 'บิลย้อนหลัง', sub: 'ค้นบิลเก่า พิมพ์ซ้ำ ยกเลิกบิล', hue: 'blue', icon: History },
  tables: { name: 'ผังโต๊ะ', sub: 'ดูโต๊ะว่าง เปิดบิลตามโต๊ะ', hue: 'violet', icon: Table2 },
  menu: { name: 'จัดการเมนู', sub: 'หมวด เมนู ราคา ของหมด', hue: 'amber', icon: UtensilsCrossed },
  staff: { name: 'จัดการพนักงาน', sub: 'เพิ่มคน ตั้ง PIN ใหม่ ปิดใช้งาน', hue: 'teal', icon: Users },
  stock: { name: 'วัตถุดิบและสต๊อก', sub: 'รับเข้า ตัดออก นับสต๊อก คิดต้นทุน', hue: 'pink', icon: Package },
  shop: { name: 'ตั้งค่าร้าน', sub: 'พร้อมเพย์ จำนวนโต๊ะ QR สั่งอาหาร', hue: 'blue', icon: Settings },
  printer: { name: 'ตั้งค่าเครื่องพิมพ์', sub: 'จับคู่เครื่องพิมพ์ใบเสร็จของเครื่องนี้', hue: 'slate', icon: Printer },
};

interface HomeScreenProps {
  shopName: string;
  profile: StaffProfile;
  tablesEnabled: boolean;
  simple: boolean;
  onToggleSimple: (on: boolean) => void;
  onNavigate: (dest: HomeDestination) => void;
}

export function HomeScreen({
  shopName,
  profile,
  tablesEnabled,
  simple,
  onToggleSimple,
  onNavigate,
}: HomeScreenProps) {
  const dests = homeDestinations({ simple, role: profile.role, tablesEnabled });

  // ไล่เวลาปรากฏของการ์ดทีละใบเบาๆ — จำกัดไว้ 8 ใบแรก ไม่ให้รู้สึกช้าตอนมีการ์ดเยอะ
  const delay = (i: number) => ({ animationDelay: `${Math.min(i, 7) * 30}ms` });

  return (
    <>
      <p className="hint" style={{ marginBottom: 4 }}>
        {shopName} · สวัสดี {profile.displayName}
      </p>
      <h1 className="home__title">จะทำอะไรต่อ</h1>

      <div className="home__grid">
        {dests.map((dest, i) => {
          const { name, sub, hue, icon: Icon } = CARDS[dest];
          const primary = hue === 'primary';
          return (
            <button
              key={dest}
              type="button"
              className={primary ? 'home__card home__card--primary fade-in' : 'home__card fade-in'}
              style={delay(i)}
              onClick={() => onNavigate(dest)}
            >
              <span
                className={primary ? 'icon-tile icon-tile--primary home__icon' : 'icon-tile home__icon'}
                data-hue={primary ? undefined : hue}
                aria-hidden="true"
              >
                <Icon size={22} />
              </span>
              <span className="home__name">{name}</span>
              <span className="home__sub">{sub}</span>
            </button>
          );
        })}
      </div>

      <div className="home__mode">
        <span className="icon-tile" data-hue="slate" aria-hidden="true">
          <SlidersHorizontal size={20} />
        </span>
        <div className="home__mode-text">
          <b>{simple ? 'โหมดง่าย: เปิดอยู่' : 'โหมดง่าย: ปิดอยู่'}</b>
          <span className="hint">
            {simple
              ? 'ซ่อนพนักงาน สต๊อก ตั้งค่าร้าน และปุ่มแยกบิล/ส่วนลดในหน้าขาย'
              : 'ซ่อนเมนูที่ใช้ไม่บ่อย เหลือแต่งานประจำวัน เหมาะกับเครื่องหน้าเคาน์เตอร์'}
          </span>
          {simple && !canToggleSimple(profile.role, true) && (
            <span className="hint">ให้เจ้าของร้านเข้าระบบเพื่อปิดโหมดนี้</span>
          )}
        </div>
        {canToggleSimple(profile.role, simple) && (
          <button type="button" className="btn" onClick={() => onToggleSimple(!simple)}>
            {simple ? 'กลับไปโหมดเต็ม' : 'เปิดโหมดง่าย'}
          </button>
        )}
      </div>
    </>
  );
}
