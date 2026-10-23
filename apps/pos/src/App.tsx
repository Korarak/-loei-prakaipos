import type { Order, OrderLine } from "@prakaipos/shared";
import { newUuid } from "@prakaipos/shared";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getDevice, type DeviceInfo } from "./auth/device.js";
// ล็อกหน้าจอ = ล้าง session ในหน่วยความจำเท่านั้น ไม่ล้าง token
// พนักงานกด PIN แล้วกลับเข้ามาได้ทันทีแม้ไม่มีเน็ต ซึ่งเป็นพฤติกรรมที่ต้องการ
import {
  refreshSession,
  restoreSession,
  type Session,
} from "./auth/session.js";
import { useIdleLock } from "./auth/useIdleLock.js";
import { BottomNav, type BottomNavScreen } from "./components/BottomNav.js";
import { SyncBadge } from "./components/SyncBadge.js";
import { UpdateBanner } from "./components/UpdateBanner.js";
import { requestPersistentStorage } from "./db/db.js";
import {
  IncomingOrdersButton,
  type OpenTableGroup,
} from "./components/IncomingOrdersPanel.js";
import { PlanBanner } from "./components/PlanBanner.js";
import { useIncomingOrders } from "./qr/useIncomingOrders.js";
import { DashboardScreen } from "./screens/DashboardScreen.js";
import { HomeScreen } from "./screens/HomeScreen.js";
import { LockScreen } from "./screens/LockScreen.js";
import { MenuScreen } from "./screens/MenuScreen.js";
import { OrdersScreen } from "./screens/OrdersScreen.js";
import { PrinterScreen } from "./screens/PrinterScreen.js";
import { SellScreen, type TablePreset } from "./screens/SellScreen.js";
import { SetupScreen } from "./screens/SetupScreen.js";
import { StaffScreen } from "./screens/StaffScreen.js";
import { StockScreen } from "./screens/StockScreen.js";
import { TablesScreen } from "./screens/TablesScreen.js";
import { refreshShopSettings, type ShopSettings } from "./shop/shopSettings.js";
import { useSync } from "./sync/useSync.js";

/** หน้าจอที่เปิดอยู่หลังเข้าระบบแล้ว */
type Screen =
  | "home"
  | "sell"
  | "menu"
  | "staff"
  | "dashboard"
  | "printer"
  | "tables"
  | "stock"
  | "orders";

/** ชื่อหน้าที่โชว์แทนชื่อร้านใน header ตอนไม่ได้อยู่หน้าแรก/หน้าขาย */
const SCREEN_TITLE: Partial<Record<Screen, string>> = {
  tables: "ผังโต๊ะ",
  dashboard: "แดชบอร์ด",
  menu: "จัดการเมนู",
  staff: "จัดการพนักงาน",
  stock: "วัตถุดิบและสต๊อก",
  printer: "ตั้งค่าเครื่องพิมพ์",
  orders: "บิลย้อนหลัง",
};

/** หน้าที่ใช้ไม่บ่อย ไม่อยู่ในแถบนำทางล่าง — ต้องมีปุ่มกลับหน้าแรกใน header แทน */
const BACK_ONLY_SCREENS: Screen[] = ["staff", "stock", "printer", "orders"];

const NAV_SCREENS: BottomNavScreen[] = ["sell", "tables", "dashboard", "menu"];

/**
 * ลำดับหน้าจอ
 *
 *   ยังไม่ตั้งค่าเครื่อง → SetupScreen  (ครั้งเดียวตอนติดตั้งที่ร้าน)
 *   ยังไม่เข้าระบบ      → LockScreen   (เลือกชื่อ + PIN)
 *   เข้าระบบแล้ว        → หน้าขาย
 */
export function App() {
  const [device, setDevice] = useState<DeviceInfo | null | undefined>(
    undefined,
  );
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function boot() {
      // ขอปักหมุดข้อมูลตั้งแต่เปิดแอปครั้งแรก ก่อนที่จะมีบิลค้างอยู่ในเครื่อง
      void requestPersistentStorage();

      const [d, s] = await Promise.all([getDevice(), restoreSession()]);
      setDevice(d);
      setSession(s);
      setReady(true);

      // ต่ออายุ token ทีหลัง ไม่บล็อกการเปิดแอป — แอปต้องใช้งานได้ทันทีแม้ไม่มีเน็ต
      if (s && navigator.onLine) {
        const stillValid = await refreshSession();
        if (!stillValid) setSession(null);
      }
    }
    void boot();
  }, []);

  const lock = useCallback(() => setSession(null), []);
  useIdleLock(lock, undefined, session !== null);

  if (!ready) {
    return <div className="screen screen--center muted">กำลังเปิดระบบ…</div>;
  }

  return (
    <>
      <UpdateBanner />
      {!device ? (
        <SetupScreen onDone={() => void getDevice().then(setDevice)} />
      ) : !session ? (
        <LockScreen device={device} onUnlock={setSession} />
      ) : (
        <PosShell device={device} session={session} onLock={lock} />
      )}
    </>
  );
}

function PosShell({
  device,
  session,
  onLock,
}: {
  device: DeviceInfo;
  session: Session;
  onLock: () => void;
}) {
  const sync = useSync();
  const incoming = useIncomingOrders(device.shopId);
  const [screen, setScreen] = useState<Screen>("home");
  const [shop, setShop] = useState<ShopSettings | null>(null);
  const [tablePreset, setTablePreset] = useState<TablePreset | null>(null);

  // กดรับเงินโต๊ะ QR — รวมทุกออร์เดอร์ที่เข้าครัวแล้วของรอบนั่งนั้นเป็นตะกร้าเดียว
  // แล้วพาไปหน้าขายเหมือนบิลปกติ ใช้ PayDialog/checkout() ชุดเดิมทุกอย่าง
  function chargeTable(group: OpenTableGroup) {
    const lines: OrderLine[] = group.orders.flatMap((o) =>
      o.lines.map((l) => ({
        clientUuid: newUuid(),
        menuItemId: l.menuItemId,
        nameSnapshot: l.nameSnapshot,
        unitPrice: l.unitPrice,
        qty: l.qty,
        note: l.note,
        modifiers: l.modifiers ?? [],
        orderedBy: l.orderedBy,
      })),
    );
    setTablePreset({
      requestId: Date.now(),
      tableNo: group.tableNo,
      tableSessionId: group.tableSessionId,
      sourceOrderIds: group.orders.map((o) => o.id),
      lines,
    });
    setScreen("sell");
  }

  // "แก้ไขบิล" จากหน้าบิลย้อนหลัง — เปิดตะกร้าใหม่ด้วยรายการเดิม บิลเดิมจะถูกยกเลิก
  // ก็ต่อเมื่อบิลใหม่ปิดสำเร็จเท่านั้น (ดูเหตุผลใน SellScreen.tsx onDone)
  function editBill(order: Order) {
    const lines: OrderLine[] = order.lines.map((l) => ({
      ...l,
      clientUuid: newUuid(),
    }));
    setTablePreset({
      requestId: Date.now(),
      tableNo: order.tableNo,
      tableSessionId: "",
      sourceOrderIds: [],
      lines,
      replacesOrder: { clientUuid: order.clientUuid, orderNo: order.orderNo },
    });
    setScreen("sell");
  }

  useEffect(() => {
    // ดึงค่าตั้งร้าน (โดยเฉพาะเลขพร้อมเพย์) มาแคชไว้ให้หน้ารับเงินใช้ตอนเน็ตหลุด
    void refreshShopSettings(device.shopId).then(setShop);
  }, [device.shopId]);

  const tablesEnabled = !!shop?.tablesEnabled && (shop?.tableCount ?? 0) > 0;
  const backOnly = BACK_ONLY_SCREENS.includes(screen);

  return (
    <div className="app">
      <header className="app__bar">
        {backOnly ? (
          <>
            <button
              type="button"
              className="app__user"
              onClick={() => setScreen("home")}
            >
              <ArrowLeft size={18} aria-hidden="true" /> หน้าแรก
            </button>
            <div className="app__brand">{SCREEN_TITLE[screen]}</div>
          </>
        ) : (
          <button
            type="button"
            className="app__brand app__brand--btn"
            onClick={() => setScreen("home")}
          >
            {SCREEN_TITLE[screen] ?? device.shopName}
          </button>
        )}
        <SyncBadge state={sync} onRetry={() => void sync.syncNow()} />
        <div className="app__spacer" />
        <IncomingOrdersButton state={incoming} onCharge={chargeTable} />
        <button type="button" className="app__user" onClick={onLock}>
          {session.profile.displayName} · ล็อก
        </button>
      </header>

      <div className="app__body">
        <div className="app__content">
          <PlanBanner shop={shop} />

          {screen === "sell" ? (
            <SellScreen
              device={device}
              profile={session.profile}
              promptpayId={shop?.promptpayId ?? ""}
              tablePreset={tablePreset}
              onTablePresetHandled={() => setTablePreset(null)}
            />
          ) : (
            <main className="app__main">
              <div key={screen} className="fade-in">
                {screen === "home" && (
                  <HomeScreen
                    shopName={device.shopName}
                    profile={session.profile}
                    tablesEnabled={tablesEnabled}
                    onNavigate={(dest) => setScreen(dest)}
                  />
                )}
                {screen === "menu" && (
                  <MenuScreen
                    shopId={device.shopId}
                    profile={session.profile}
                  />
                )}
                {screen === "staff" && (
                  <StaffScreen
                    shopId={device.shopId}
                    shopCode={device.shopCode}
                    profile={session.profile}
                  />
                )}
                {screen === "dashboard" && (
                  <DashboardScreen shopId={device.shopId} />
                )}
                {screen === "orders" && (
                  <OrdersScreen
                    shopId={device.shopId}
                    shopName={device.shopName}
                    profile={session.profile}
                    onEditBill={editBill}
                  />
                )}
                {screen === "printer" && <PrinterScreen />}
                {screen === "stock" && (
                  <StockScreen
                    shopId={device.shopId}
                    profile={session.profile}
                  />
                )}
                {screen === "tables" && (
                  <TablesScreen
                    tableCount={shop?.tableCount ?? 0}
                    incoming={incoming}
                    onOpenEmpty={(tableNo) => {
                      setTablePreset({
                        requestId: Date.now(),
                        tableNo,
                        tableSessionId: "",
                        sourceOrderIds: [],
                        lines: [],
                      });
                      setScreen("sell");
                    }}
                    onCharge={chargeTable}
                  />
                )}
              </div>
            </main>
          )}
        </div>

        <BottomNav
          active={
            NAV_SCREENS.includes(screen as BottomNavScreen)
              ? (screen as BottomNavScreen)
              : null
          }
          tablesEnabled={tablesEnabled}
          onNavigate={setScreen}
        />
      </div>
    </div>
  );
}
