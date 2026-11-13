/**
 * โหมดง่าย — ซ่อนเมนูที่ใช้ไม่บ่อยและปุ่มที่ทำให้คนหน้าเคาน์เตอร์สับสน
 *
 * ตั้งต่อเครื่อง (เก็บใน localStorage ของเบราว์เซอร์เครื่องนั้น) ไม่ใช่ต่อร้าน
 * เพราะร้านหนึ่งมักมีเครื่องหน้าเคาน์เตอร์ (อยากได้เรียบ) กับเครื่องเจ้าของ (อยากได้ครบ)
 *
 * ตรรกะทั้งหมดอยู่ในไฟล์นี้เป็นฟังก์ชันล้วน เพื่อเทสได้โดยไม่ต้องเรนเดอร์หน้าจอ
 * ส่วน UI แค่เรียกใช้ จะได้ไม่มีเงื่อนไข "ถ้าโหมดง่ายแล้ว…" กระจายอยู่ตามหน้า
 */

export type Screen =
  | 'home'
  | 'sell'
  | 'menu'
  | 'staff'
  | 'dashboard'
  | 'printer'
  | 'tables'
  | 'stock'
  | 'orders'
  | 'shop'
  | 'tableqr';

export type Role = 'owner' | 'manager' | 'cashier' | string;

/** หน้าที่เลือกได้จากการ์ดหน้าแรก (ลำดับ = ลำดับที่โชว์) */
export type HomeDestination = Exclude<Screen, 'home' | 'tableqr'>;

export type NavScreen = 'sell' | 'tables' | 'dashboard' | 'menu' | 'orders';

interface DestRule {
  dest: HomeDestination;
  /** เห็นเฉพาะเจ้าของร้าน */
  ownerOnly?: boolean;
  /** ต้องเปิดผังโต๊ะในตั้งค่าร้านก่อนถึงจะเห็น */
  needsTables?: boolean;
  /** อยู่ในโหมดง่ายด้วยไหม */
  simple: boolean;
}

/**
 * โหมดง่ายเก็บเฉพาะงานประจำวัน: ขาย โต๊ะ บิล ยอดวันนี้ เมนู (ไว้กด "ของหมด") เครื่องพิมพ์
 * ตัดงานตั้งค่า/ดูแลระบบ (พนักงาน สต๊อก ตั้งค่าร้าน) ออก — เจ้าของสลับกลับโหมดเต็มได้เสมอ
 */
const RULES: DestRule[] = [
  { dest: 'sell', simple: true },
  { dest: 'dashboard', simple: true },
  { dest: 'orders', simple: true },
  { dest: 'tables', needsTables: true, simple: true },
  { dest: 'menu', simple: true },
  { dest: 'staff', ownerOnly: true, simple: false },
  { dest: 'stock', ownerOnly: true, simple: false },
  { dest: 'shop', ownerOnly: true, simple: false },
  { dest: 'printer', simple: true },
];

export function homeDestinations(opts: {
  simple: boolean;
  role: Role;
  tablesEnabled: boolean;
}): HomeDestination[] {
  return RULES.filter(
    (r) =>
      (!opts.simple || r.simple) &&
      (!r.ownerOnly || opts.role === 'owner') &&
      (!r.needsTables || opts.tablesEnabled),
  ).map((r) => r.dest);
}

/** แถบนำทางล่าง — โหมดง่ายเปลี่ยน "เมนู" เป็น "บิล" เพราะดูบิลถี่กว่าแก้เมนู */
export function navScreens(opts: { simple: boolean; tablesEnabled: boolean }): NavScreen[] {
  const all: NavScreen[] = opts.simple
    ? ['sell', 'tables', 'orders', 'dashboard']
    : ['sell', 'tables', 'dashboard', 'menu'];
  return all.filter((s) => s !== 'tables' || opts.tablesEnabled);
}

/** หน้านี้เปิดได้ในสถานะปัจจุบันไหม (กันกรณีสลับโหมดแล้วค้างอยู่หน้าที่ถูกซ่อน) */
export function canOpen(
  screen: Screen,
  opts: { simple: boolean; role: Role; tablesEnabled: boolean },
): boolean {
  if (screen === 'home') return true;
  // QR ประจำโต๊ะเปิดจากหน้าตั้งค่าร้านเท่านั้น จึงถือเป็นหน้าชุดเดียวกับ shop
  const dest: HomeDestination = screen === 'tableqr' ? 'shop' : screen;
  return homeDestinations(opts).includes(dest);
}

/** หน้าที่ใช้แทนเมื่อเปิดหน้าเดิมไม่ได้ */
export function resolveScreen(
  screen: Screen,
  opts: { simple: boolean; role: Role; tablesEnabled: boolean },
): Screen {
  return canOpen(screen, opts) ? screen : 'home';
}

/** ปิดโหมดง่ายได้เฉพาะเจ้าของ — กันพนักงานเปิดหน้าที่ถูกซ่อนไว้เอง (เปิดโหมดง่ายได้ทุกคน) */
export function canToggleSimple(role: Role, currentlySimple: boolean): boolean {
  return !currentlySimple || role === 'owner';
}

/** ของที่ซ่อนในหน้าขายตอนโหมดง่าย */
export function sellFeatures(simple: boolean): { splitBill: boolean; discount: boolean; unitPrice: boolean } {
  return { splitBill: !simple, discount: !simple, unitPrice: !simple };
}

const KEY = 'prakaipos.simpleMode';

/** localStorage อาจถูกปิด (โหมดส่วนตัวของ Safari) — ถ้าอ่าน/เขียนไม่ได้ก็ใช้โหมดเต็มตามเดิม */
export function loadSimpleMode(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): boolean {
  try {
    return storage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function saveSimpleMode(
  on: boolean,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = safeStorage(),
): void {
  try {
    if (on) storage?.setItem(KEY, '1');
    else storage?.removeItem(KEY);
  } catch {
    /* เก็บไม่ได้ก็ใช้ได้แค่ในรอบนี้ ไม่ใช่เรื่องร้ายแรง */
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
