/**
 * โครงสร้างข้อมูลหลักของ PrakaiPOS (ก้อนที่ 1)
 *
 * กติกาที่ยึดทั้งระบบ:
 * - เงินทุกจำนวนเก็บเป็น "สตางค์" (จำนวนเต็ม) ไม่ใช่ทศนิยม — กันปัญหา float ตอนรวมบิล
 * - ทุกเรกคอร์ดที่เครื่องสร้างเองมี clientUuid ที่สร้างจากแท็บเล็ต
 *   เซิร์ฟเวอร์ยึด clientUuid เป็นตัวตัดสินว่าซ้ำหรือไม่ (idempotent) ส่งซ้ำกี่ครั้งก็ไม่เกิดบิลซ้ำ
 * - เวลาเป็น ISO 8601 string (UTC) เสมอ ไม่เก็บ Date object ลง IndexedDB
 */

/** จำนวนเงินหน่วยสตางค์ — 12050 = 120.50 บาท */
export type Satang = number;

/** เวลาแบบ ISO 8601 UTC เช่น "2026-07-31T04:12:33.000Z" */
export type IsoDateTime = string;

// ─────────────────────────────────────────────────────────────
// ร้านและพนักงาน
// ─────────────────────────────────────────────────────────────

export interface Shop {
  id: string;
  /** รหัสสั้นที่ใช้ใน URL ของ QR เช่น "krua-nong" */
  code: string;
  name: string;
  /** เบอร์พร้อมเพย์หรือเลขประจำตัวผู้เสียภาษี ใช้สร้าง QR รับเงิน */
  promptpayId: string;
  /** โหมด QR Order: ส่งเข้าระบบทันที หรือให้พนักงานกดยืนยันก่อน */
  qrOrderMode: QrOrderMode;
  /** ร้านนั่งทานเปิดผังโต๊ะ ร้านตามสั่งปิด */
  tablesEnabled: boolean;
  /** จำนวนโต๊ะ 1..N สำหรับวาดผังโต๊ะ — 0 = ยังไม่ได้ตั้งค่า */
  tableCount: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type QrOrderMode = 'auto' | 'staff_confirm';

export type StaffRole = 'owner' | 'staff';

export interface Staff {
  id: string;
  shopId: string;
  name: string;
  role: StaffRole;
  /** เก็บเฉพาะ hash ของ PIN ฝั่งเซิร์ฟเวอร์ ไม่เคยส่ง PIN ดิบลงเครื่อง */
  active: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

// ─────────────────────────────────────────────────────────────
// เมนู
// ─────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  shopId: string;
  name: string;
  /** ลำดับการแสดงผลบนหน้าขาย น้อยขึ้นก่อน */
  sortOrder: number;
  active: boolean;
  updatedAt: IsoDateTime;
}

export interface MenuItem {
  id: string;
  shopId: string;
  categoryId: string;
  name: string;
  price: Satang;
  /** URL รูปจาก PocketBase (ผ่าน Cloudflare CDN) — ว่างได้ */
  imageUrl: string;
  /** ของหมดวันนี้ ยังไม่ใช่การลบเมนู */
  soldOut: boolean;
  sortOrder: number;
  active: boolean;
  /** ตัวเลือก/ท็อปปิ้ง เช่น ระดับความเผ็ด, ใส่ไข่ดาว — ว่างได้สำหรับเมนูที่ไม่มีตัวเลือก */
  modifierGroups: ModifierGroup[];
  /** สูตร (BOM) — วัตถุดิบที่ใช้ต่อการขาย 1 หน่วย — ว่างได้ถ้ายังไม่ได้ตั้งต้นทุน */
  recipe: RecipeLine[];
  updatedAt: IsoDateTime;
}

export interface RecipeLine {
  ingredientId: string;
  /** จำนวนวัตถุดิบที่ใช้ต่อการขายเมนูนี้ 1 หน่วย ในหน่วยเดียวกับ Ingredient.unit */
  qty: number;
}

export interface ModifierOption {
  /** สร้างจากเครื่องตอนแก้เมนู ใช้แค่ระบุตัวตนภายในกลุ่มเดียวกันตอนแก้ไข ไม่ใช่ id ฝั่งเซิร์ฟเวอร์ */
  id: string;
  name: string;
  /** บวกเพิ่มจากราคาเมนู — ใส่ 0 ได้สำหรับตัวเลือกที่ไม่คิดเงินเพิ่ม เช่น ระดับความเผ็ด */
  priceDelta: Satang;
}

export interface ModifierGroup {
  id: string;
  /** เช่น "ระดับความเผ็ด", "ตัวเลือกเพิ่ม" */
  name: string;
  /** ต้องเลือกอย่างน้อยหนึ่งตัวเลือกก่อนเพิ่มลงตะกร้าได้ */
  required: boolean;
  /** เลือกได้หลายตัวเลือก (เช็คบ็อกซ์) หรือเลือกได้ตัวเดียว (ปุ่มตัวเลือก) */
  multiple: boolean;
  options: ModifierOption[];
}

/** ตัวเลือกที่ลูกค้า/พนักงานเลือกไว้ตอนเพิ่มลงตะกร้า — เก็บชื่อ ณ เวลาสั่ง เหมือน nameSnapshot */
export interface SelectedModifier {
  groupName: string;
  optionName: string;
  priceDelta: Satang;
}

// ─────────────────────────────────────────────────────────────
// บิล
// ─────────────────────────────────────────────────────────────

export type OrderChannel = 'pos' | 'qr';

export type OrderStatus =
  /** ลูกค้ากดสั่งผ่าน QR แต่ร้านตั้งโหมดให้พนักงานยืนยันก่อน */
  | 'pending'
  /** บิลเปิดอยู่ กำลังเพิ่มรายการได้ */
  | 'open'
  /** รับเงินแล้ว ปิดบิล */
  | 'paid'
  /** ยกเลิก — ไม่ลบทิ้ง เพื่อให้ตรวจสอบย้อนหลังได้ */
  | 'void';

export interface OrderLine {
  /** UUID จากเครื่อง ใช้อ้างอิงตอนแก้/ลบรายการก่อนบิลปิด */
  clientUuid: string;
  menuItemId: string;
  /** เก็บชื่อและราคา ณ เวลาขาย เพราะเมนูอาจถูกแก้ราคาภายหลัง */
  nameSnapshot: string;
  unitPrice: Satang;
  qty: number;
  /** หมายเหตุจากลูกค้า เช่น "ไม่ใส่ผักชี" — สำหรับคำขอที่ไม่ได้อยู่ในตัวเลือกที่ร้านตั้งไว้ */
  note: string;
  /** ตัวเลือก/ท็อปปิ้งที่เลือกไว้ — ราคารวมอยู่ใน unitPrice แล้ว ไม่ต้องบวกซ้ำตอนคิดยอด */
  modifiers: SelectedModifier[];
  /** ชื่อเล่นคนสั่ง (เฉพาะช่องทาง QR ที่หลายคนสั่งในโต๊ะเดียว) — สมัครใจ */
  orderedBy: string;
}

export type PaymentMethod = 'cash' | 'promptpay';

export interface Payment {
  method: PaymentMethod;
  /** ยอดที่รับจริง — เงินสดอาจมากกว่ายอดบิลแล้วทอน */
  amount: Satang;
  /** เงินทอน (เงินสดเท่านั้น) */
  change: Satang;
  paidAt: IsoDateTime;
}

export interface Order {
  /** UUID จากเครื่อง — ตัวตัดสินความซ้ำ ไม่ใช่ id ของเซิร์ฟเวอร์ */
  clientUuid: string;
  /** id ฝั่งเซิร์ฟเวอร์ ว่างจนกว่าจะซิงก์สำเร็จ */
  id?: string;
  shopId: string;
  /** เลขบิลจากช่วงที่เครื่องนี้จองไว้ ออฟไลน์กี่วันก็ไม่ชนกัน */
  orderNo: number;
  channel: OrderChannel;
  status: OrderStatus;
  /** เลขโต๊ะ — ว่างสำหรับร้านตามสั่งที่ไม่ใช้ผังโต๊ะ */
  tableNo: string;
  /** อ้างถึงรอบนั่งของโต๊ะ (ช่องทาง QR) */
  tableSessionId: string;
  lines: OrderLine[];
  /** ยอดรวมก่อนส่วนลด = Σ (unitPrice × qty) */
  subtotal: Satang;
  discount: Satang;
  /** ยอดที่ต้องจ่ายจริง = subtotal − discount */
  total: Satang;
  payment: Payment | null;
  staffId: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

// ─────────────────────────────────────────────────────────────
// รอบนั่งของโต๊ะ (QR Order)
// ─────────────────────────────────────────────────────────────

export interface TableSession {
  id: string;
  shopId: string;
  tableNo: string;
  openedAt: IsoDateTime;
  /** ว่าง = รอบยังเปิดอยู่ · มีค่า = ปิดบิลแล้ว token ของลูกค้าหมดอายุทันที */
  closedAt: IsoDateTime | null;
}

// ─────────────────────────────────────────────────────────────
// วัตถุดิบและสต๊อก
// ─────────────────────────────────────────────────────────────

export interface Ingredient {
  id: string;
  shopId: string;
  name: string;
  /** หน่วยอิสระ เช่น "กรัม", "มล.", "ชิ้น" */
  unit: string;
  /** คงเหลือปัจจุบัน — เป็นทศนิยมได้ ไม่ใช่เงิน */
  stockQty: number;
  /** ต้นทุนต่อ 1 หน่วย เป็นสตางค์ */
  costPerUnit: Satang;
  active: boolean;
  updatedAt: IsoDateTime;
}

export type StockMovementType = 'receive' | 'deduct' | 'count';

export interface StockMovement {
  id: string;
  shopId: string;
  ingredientId: string;
  type: StockMovementType;
  /** ส่วนต่างที่เปลี่ยนจริง (บวก = เพิ่ม, ลบ = ลด) */
  qtyDelta: number;
  note: string;
  createdAt: IsoDateTime;
}

// ─────────────────────────────────────────────────────────────
// การซิงก์
// ─────────────────────────────────────────────────────────────

/** งานหนึ่งชิ้นในคิวรอส่งขึ้นคลาวด์ */
export interface OutboxItem {
  /**
   * auto-increment ของ Dexie — ใช้รักษาลำดับการส่ง
   *
   * ประกาศเป็นฟิลด์บังคับ ไม่ใช่ optional เพราะทุกแถวที่อ่านออกมาจากฐานข้อมูล
   * มีค่านี้เสมอ Dexie จัดการให้เองว่าตอน add() ไม่ต้องส่งมา
   * ถ้าประกาศเป็น optional จะต้องเขียน `as number` กระจายไปทั่วโค้ดที่ใช้งาน
   */
  seq: number;
  /** ชื่อ collection ปลายทางบน PocketBase */
  collection: string;
  op: 'create' | 'update';
  /** UUID ของเรกคอร์ด ใช้เป็นกุญแจกันซ้ำฝั่งเซิร์ฟเวอร์ */
  clientUuid: string;
  /**
   * id ฝั่งเซิร์ฟเวอร์ — ใส่เมื่อเรกคอร์ดมีอยู่บนเซิร์ฟเวอร์แล้ว
   *
   * แยกจาก clientUuid เพราะข้อมูลสองประเภทมีเจ้าของต่างกัน:
   * บิลเป็นของที่แท็บเล็ตสร้างเอง จึงอ้างด้วย UUID ของตัวเอง
   * ส่วนเมนูสร้างจากหลังบ้าน แท็บเล็ตรู้จักแค่ id ของเซิร์ฟเวอร์
   * และตาราง menu_items ก็ไม่มีคอลัมน์ client_uuid ให้ค้นด้วยซ้ำ
   */
  serverId?: string;
  payload: Record<string, unknown>;
  createdAt: IsoDateTime;
  /** จำนวนครั้งที่ส่งแล้วล้มเหลว ใช้คำนวณเวลาถอยก่อนลองใหม่ */
  attempts: number;
  /** เวลาที่อนุญาตให้ลองส่งครั้งถัดไป (exponential backoff) */
  nextAttemptAt: IsoDateTime;
  /** ข้อความ error ล่าสุด เก็บไว้ให้ debug ที่หน้าร้านได้ */
  lastError: string;
}
