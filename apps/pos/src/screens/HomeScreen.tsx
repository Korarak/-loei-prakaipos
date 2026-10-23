import {
  History,
  LayoutDashboard,
  Package,
  Printer,
  Receipt,
  Table2,
  UtensilsCrossed,
  Users,
} from 'lucide-react';
import type { StaffProfile } from '../auth/credentials.js';

/**
 * หน้าแรกหลังล็อกอิน
 *
 * ก่อนหน้านี้ล็อกอินแล้วเข้าหน้าขายตรงๆ ไม่มีที่ไหนบอกว่ามีเมนูอะไรบ้าง
 * ทำให้พนักงานใหม่งงว่าเปิดมาเจออะไร หน้านี้แก้ตรงนั้น — เป็นทางเข้าเดียว
 * ไปหาทุกส่วนของระบบ กดครั้งเดียวถึงหน้าขายเหมือนเดิม (PIN login เกิดแค่
 * ตอนต้นกะ ไม่ใช่ทุกบิล จึงไม่ได้เพิ่มขั้นตอนตอนขายจริง)
 */

export type HomeDestination =
  | 'sell'
  | 'menu'
  | 'staff'
  | 'dashboard'
  | 'printer'
  | 'tables'
  | 'stock'
  | 'orders';

interface HomeScreenProps {
  shopName: string;
  profile: StaffProfile;
  tablesEnabled: boolean;
  onNavigate: (dest: HomeDestination) => void;
}

export function HomeScreen({ shopName, profile, tablesEnabled, onNavigate }: HomeScreenProps) {
  const isOwner = profile.role === 'owner';

  // ไล่เวลาปรากฏของการ์ดทีละใบเบาๆ — จำกัดไว้ 8 ใบแรก ไม่ให้รู้สึกช้าตอนมีการ์ดเยอะ
  let i = -1;
  const delay = () => ({ animationDelay: `${Math.min((i += 1), 7) * 30}ms` });

  return (
    <>
      <p className="hint" style={{ marginBottom: 4 }}>
        {shopName} · สวัสดี {profile.displayName}
      </p>
      <h1 className="home__title">จะทำอะไรต่อ</h1>

      <div className="home__grid">
        <button
          type="button"
          className="home__card home__card--primary fade-in"
          style={delay()}
          onClick={() => onNavigate('sell')}
        >
          <span className="icon-tile icon-tile--primary home__icon" aria-hidden="true">
            <Receipt size={22} />
          </span>
          <span className="home__name">หน้าขาย</span>
          <span className="home__sub">เลือกเมนู คิดเงิน รับออร์เดอร์ QR</span>
        </button>

        <button
          type="button"
          className="home__card fade-in"
          style={delay()}
          onClick={() => onNavigate('dashboard')}
        >
          <span className="icon-tile home__icon" data-hue="green" aria-hidden="true">
            <LayoutDashboard size={22} />
          </span>
          <span className="home__name">แดชบอร์ด</span>
          <span className="home__sub">ยอดขายวันนี้ เมนูขายดี</span>
        </button>

        <button
          type="button"
          className="home__card fade-in"
          style={delay()}
          onClick={() => onNavigate('orders')}
        >
          <span className="icon-tile home__icon" data-hue="blue" aria-hidden="true">
            <History size={22} />
          </span>
          <span className="home__name">บิลย้อนหลัง</span>
          <span className="home__sub">ค้นบิลเก่า พิมพ์ซ้ำ ยกเลิกบิล</span>
        </button>

        {tablesEnabled && (
          <button
            type="button"
            className="home__card fade-in"
            style={delay()}
            onClick={() => onNavigate('tables')}
          >
            <span className="icon-tile home__icon" data-hue="violet" aria-hidden="true">
            <Table2 size={22} />
            </span>
            <span className="home__name">ผังโต๊ะ</span>
            <span className="home__sub">ดูโต๊ะว่าง เปิดบิลตามโต๊ะ</span>
          </button>
        )}

        <button
          type="button"
          className="home__card fade-in"
          style={delay()}
          onClick={() => onNavigate('menu')}
        >
          <span className="icon-tile home__icon" data-hue="amber" aria-hidden="true">
            <UtensilsCrossed size={22} />
          </span>
          <span className="home__name">จัดการเมนู</span>
          <span className="home__sub">หมวด เมนู ราคา ของหมด</span>
        </button>

        {isOwner && (
          <button
            type="button"
            className="home__card fade-in"
            style={delay()}
            onClick={() => onNavigate('staff')}
          >
            <span className="icon-tile home__icon" data-hue="teal" aria-hidden="true">
            <Users size={22} />
            </span>
            <span className="home__name">จัดการพนักงาน</span>
            <span className="home__sub">เพิ่มคน ตั้ง PIN ใหม่ ปิดใช้งาน</span>
          </button>
        )}

        {isOwner && (
          <button
            type="button"
            className="home__card fade-in"
            style={delay()}
            onClick={() => onNavigate('stock')}
          >
            <span className="icon-tile home__icon" data-hue="pink" aria-hidden="true">
            <Package size={22} />
            </span>
            <span className="home__name">วัตถุดิบและสต๊อก</span>
            <span className="home__sub">รับเข้า ตัดออก นับสต๊อก คิดต้นทุน</span>
          </button>
        )}

        <button
          type="button"
          className="home__card fade-in"
          style={delay()}
          onClick={() => onNavigate('printer')}
        >
          <span className="icon-tile home__icon" data-hue="slate" aria-hidden="true">
            <Printer size={22} />
          </span>
          <span className="home__name">ตั้งค่าเครื่องพิมพ์</span>
          <span className="home__sub">จับคู่เครื่องพิมพ์ใบเสร็จของเครื่องนี้</span>
        </button>
      </div>
    </>
  );
}
