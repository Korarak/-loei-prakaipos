/// <reference path="../pb_data/types.d.ts" />

/**
 * Schema ก้อนที่ 1 ของ PrakaiPOS
 *
 * หลักการที่ยึด:
 *
 * 1. เงินเก็บเป็นจำนวนเต็มหน่วย "สตางค์" ทุกที่ ไม่มีทศนิยมในฐานข้อมูล
 *
 * 2. บิลหนึ่งใบ = หนึ่งเรกคอร์ด รายการอาหารฝังเป็น JSON ไม่แยกตาราง
 *    เหตุผล: แท็บเล็ตส่งบิลขึ้นมาทั้งใบเป็นก้อนเดียว ถ้าแยกตารางจะต้องทำ
 *    transaction ข้ามตารางให้ถูกตอนเน็ตหลุดกลางทาง ซึ่งเป็นจุดที่พังง่ายที่สุด
 *    การฝังไว้ทำให้ "ส่งซ้ำแล้วไม่เกิดบิลซ้ำ" เป็นเรื่องของแถวเดียวล้วนๆ
 *    แลกกับการที่รายงานเมนูขายดีต้องรวมยอดฝั่งแอป — ที่ 100–300 บิล/วัน ไม่หนัก
 *
 * 3. client_uuid มี unique index — นี่คือกลไกกันบิลซ้ำทั้งระบบ
 *    แท็บเล็ตส่งซ้ำกี่ครั้งก็ติด unique constraint ไม่เกิดแถวใหม่
 *
 * 4. ทุกตารางผูกกับ shop และกฎสิทธิ์บังคับให้เห็นเฉพาะร้านตัวเอง
 *    ร้าน ก. ต้องมองไม่เห็นข้อมูลร้าน ข. แม้จะเดา id ถูก
 */

const ID_SHOPS = 'pkpshops0000001';
const ID_STAFF = 'pkpstaff0000001';
const ID_CATEGORIES = 'pkpcategories01';
const ID_MENU_ITEMS = 'pkpmenuitems001';
const ID_TABLE_SESSIONS = 'pkptablesess001';
const ID_ORDERS = 'pkporders000001';
const ID_DEVICES = 'pkpdevices00001';

/** พนักงานเห็นได้เฉพาะข้อมูลของร้านตัวเอง */
const OWN_SHOP = 'shop = @request.auth.shop';
/** เฉพาะเจ้าของร้านเท่านั้นที่แก้ได้ — พนักงานหน้าร้านแก้เมนู/ราคาไม่ได้ */
const OWNER_OF_SHOP = 'shop = @request.auth.shop && @request.auth.role = "owner"';

migrate(
  (db) => {
    const dao = new Dao(db);

    // ── ร้าน ─────────────────────────────────────────────────
    dao.saveCollection(
      new Collection({
        id: ID_SHOPS,
        name: 'shops',
        type: 'base',
        // ร้านมองเห็นเฉพาะตัวเอง · ข้อมูลร้านสร้างและลบโดยแอดมินเท่านั้น
        // (เราเปิดบัญชีให้ลูกค้าเอง ไม่มีสมัครใช้เอง — 30 ร้านแรกคือคนที่เรารู้จัก)
        listRule: 'id = @request.auth.shop',
        viewRule: 'id = @request.auth.shop',
        createRule: null,
        updateRule: 'id = @request.auth.shop && @request.auth.role = "owner"',
        deleteRule: null,
        schema: [
          {
            name: 'code',
            type: 'text',
            required: true,
            // รหัสสั้นที่โผล่ใน URL ของ QR โต๊ะ เช่น order.prakaipos.com/t/krua-nong/5
            options: { min: 2, max: 32, pattern: '^[a-z0-9][a-z0-9-]*$' },
          },
          { name: 'name', type: 'text', required: true, options: { max: 120 } },
          {
            name: 'promptpay_id',
            type: 'text',
            required: false,
            // เก็บดิบตามที่เจ้าของร้านกรอก แอปเป็นคน normalize ตอนสร้าง QR
            options: { max: 32 },
          },
          {
            name: 'qr_order_mode',
            type: 'select',
            required: true,
            // แนะนำให้ร้านใหม่เริ่มที่ staff_confirm เพื่อกันสั่งเล่น
            options: { maxSelect: 1, values: ['auto', 'staff_confirm'] },
          },
          { name: 'tables_enabled', type: 'bool', required: false },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_shops_code ON shops (code)'],
      }),
    );

    // ── พนักงาน (เป็น auth collection เพื่อให้ล็อกอินด้วย PIN ได้) ──
    dao.saveCollection(
      new Collection({
        id: ID_STAFF,
        name: 'staff',
        type: 'auth',
        listRule: OWN_SHOP,
        viewRule: OWN_SHOP,
        createRule: null,
        updateRule: OWNER_OF_SHOP,
        deleteRule: null,
        options: {
          // PIN 4–8 หลัก เก็บเป็น password hash ของ PocketBase ตามปกติ
          // ไม่ได้เก็บ PIN ดิบ และไม่เคยส่ง PIN กลับลงเครื่อง
          minPasswordLength: 4,
          allowUsernameAuth: true,
          allowEmailAuth: false,
          allowOAuth2Auth: false,
          requireEmail: false,
        },
        schema: [
          {
            name: 'shop',
            type: 'relation',
            required: true,
            options: { collectionId: ID_SHOPS, maxSelect: 1, cascadeDelete: true },
          },
          { name: 'display_name', type: 'text', required: true, options: { max: 60 } },
          {
            name: 'role',
            type: 'select',
            required: true,
            options: { maxSelect: 1, values: ['owner', 'staff'] },
          },
          { name: 'active', type: 'bool', required: false },
        ],
      }),
    );

    // ── หมวดเมนู ─────────────────────────────────────────────
    dao.saveCollection(
      new Collection({
        id: ID_CATEGORIES,
        name: 'categories',
        type: 'base',
        // เปิดอ่านสาธารณะ เพราะหน้าลูกค้าสแกน QR ไม่มีการล็อกอิน
        // เมนูร้านอาหารเป็นข้อมูลที่ติดไว้หน้าร้านอยู่แล้ว ไม่ใช่ความลับ
        listRule: '',
        viewRule: '',
        createRule: OWNER_OF_SHOP,
        updateRule: OWNER_OF_SHOP,
        deleteRule: OWNER_OF_SHOP,
        schema: [
          {
            name: 'shop',
            type: 'relation',
            required: true,
            options: { collectionId: ID_SHOPS, maxSelect: 1, cascadeDelete: true },
          },
          { name: 'name', type: 'text', required: true, options: { max: 60 } },
          { name: 'sort_order', type: 'number', required: false, options: { min: 0 } },
          { name: 'active', type: 'bool', required: false },
        ],
        indexes: ['CREATE INDEX idx_categories_shop ON categories (shop, sort_order)'],
      }),
    );

    // ── เมนูอาหาร ────────────────────────────────────────────
    dao.saveCollection(
      new Collection({
        id: ID_MENU_ITEMS,
        name: 'menu_items',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: OWNER_OF_SHOP,
        updateRule: OWN_SHOP, // พนักงานกด "ของหมด" ได้ แต่แก้ราคาไม่ได้ (บังคับด้วย hook ภายหลัง)
        deleteRule: OWNER_OF_SHOP,
        schema: [
          {
            name: 'shop',
            type: 'relation',
            required: true,
            options: { collectionId: ID_SHOPS, maxSelect: 1, cascadeDelete: true },
          },
          {
            name: 'category',
            type: 'relation',
            required: true,
            options: { collectionId: ID_CATEGORIES, maxSelect: 1, cascadeDelete: false },
          },
          { name: 'name', type: 'text', required: true, options: { max: 120 } },
          {
            name: 'price',
            type: 'number',
            required: true,
            // หน่วยสตางค์ — 12050 = 120.50 บาท
            options: { min: 0, noDecimal: true },
          },
          {
            name: 'image',
            type: 'file',
            required: false,
            options: {
              maxSelect: 1,
              maxSize: 2097152, // 2 MB — รูปเมนูใหญ่กว่านี้ทำให้หน้าลูกค้าโหลดช้าตอนสัญญาณอ่อน
              mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
              thumbs: ['200x200', '600x0'],
            },
          },
          { name: 'sold_out', type: 'bool', required: false },
          { name: 'sort_order', type: 'number', required: false, options: { min: 0 } },
          { name: 'active', type: 'bool', required: false },
        ],
        indexes: [
          'CREATE INDEX idx_menu_items_shop ON menu_items (shop, category, sort_order)',
          // ซิงก์ขาลงขอเฉพาะรายการที่ updated ใหม่กว่าครั้งก่อน
          'CREATE INDEX idx_menu_items_updated ON menu_items (shop, updated)',
        ],
      }),
    );

    // ── รอบนั่งของโต๊ะ ────────────────────────────────────────
    dao.saveCollection(
      new Collection({
        id: ID_TABLE_SESSIONS,
        name: 'table_sessions',
        type: 'base',
        // ลูกค้าที่สแกน QR ต้องอ่านรอบของตัวเองได้โดยไม่ล็อกอิน
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: OWN_SHOP,
        deleteRule: null,
        schema: [
          {
            name: 'shop',
            type: 'relation',
            required: true,
            options: { collectionId: ID_SHOPS, maxSelect: 1, cascadeDelete: true },
          },
          { name: 'table_no', type: 'text', required: true, options: { max: 16 } },
          { name: 'opened_at', type: 'date', required: true },
          // ว่าง = รอบยังเปิด · มีค่า = ปิดบิลแล้ว โต๊ะถัดไปสแกน QR เดิมได้รอบใหม่
          { name: 'closed_at', type: 'date', required: false },
        ],
        indexes: [
          'CREATE INDEX idx_table_sessions_open ON table_sessions (shop, table_no, closed_at)',
        ],
      }),
    );

    // ── บิล ──────────────────────────────────────────────────
    dao.saveCollection(
      new Collection({
        id: ID_ORDERS,
        name: 'orders',
        type: 'base',
        listRule: OWN_SHOP,
        viewRule: OWN_SHOP,
        // ┌─────────────────────────────────────────────────────────────┐
        // │ ยังไม่ปลอดภัยพอสำหรับใช้งานจริง — ดู backend/README.md      │
        // │ กฎนี้ยอมให้ใครก็ได้สร้างบิลช่องทาง qr สถานะ pending          │
        // │ ต้องเพิ่ม hook ตรวจลายเซ็น HMAC ของลิงก์โต๊ะ + จำกัดอัตรา     │
        // │ ก่อนเปิดให้ร้านจริงใช้ (เอกสารออกแบบหัวข้อ 07)               │
        // └─────────────────────────────────────────────────────────────┘
        createRule:
          '@request.auth.id != "" || ' +
          '(@request.data.channel = "qr" && @request.data.status = "pending")',
        updateRule: OWN_SHOP,
        deleteRule: null,
        schema: [
          {
            name: 'client_uuid',
            type: 'text',
            required: true,
            // กุญแจกันบิลซ้ำ สร้างจากแท็บเล็ต ไม่ใช่จากเซิร์ฟเวอร์
            options: { min: 36, max: 36 },
          },
          {
            name: 'shop',
            type: 'relation',
            required: true,
            options: { collectionId: ID_SHOPS, maxSelect: 1, cascadeDelete: true },
          },
          {
            name: 'order_no',
            type: 'number',
            required: true,
            // มาจากช่วงที่เครื่องนั้นจองไว้ ออฟไลน์กี่วันก็ไม่ชนกัน
            options: { min: 1, noDecimal: true },
          },
          {
            name: 'channel',
            type: 'select',
            required: true,
            options: { maxSelect: 1, values: ['pos', 'qr'] },
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            // void ไม่ลบทิ้ง เพื่อให้ตรวจสอบย้อนหลังได้
            options: { maxSelect: 1, values: ['pending', 'open', 'paid', 'void'] },
          },
          { name: 'table_no', type: 'text', required: false, options: { max: 16 } },
          {
            name: 'table_session',
            type: 'relation',
            required: false,
            options: { collectionId: ID_TABLE_SESSIONS, maxSelect: 1, cascadeDelete: false },
          },
          {
            name: 'lines',
            type: 'json',
            required: true,
            // เก็บชื่อและราคา ณ เวลาขายไว้ในนี้ด้วย เพราะเมนูอาจถูกแก้ราคาภายหลัง
            // แล้วรายงานย้อนหลังต้องยังแสดงยอดเดิมที่ลูกค้าจ่ายจริง
            options: { maxSize: 65536 },
          },
          { name: 'subtotal', type: 'number', required: true, options: { noDecimal: true } },
          { name: 'discount', type: 'number', required: false, options: { noDecimal: true } },
          { name: 'total', type: 'number', required: true, options: { noDecimal: true } },
          { name: 'payment', type: 'json', required: false, options: { maxSize: 2048 } },
          {
            name: 'staff',
            type: 'relation',
            required: false,
            options: { collectionId: ID_STAFF, maxSelect: 1, cascadeDelete: false },
          },
        ],
        indexes: [
          // หัวใจของการกันบิลซ้ำ — ส่งซ้ำกี่ครั้งก็ติด constraint นี้
          'CREATE UNIQUE INDEX idx_orders_client_uuid ON orders (client_uuid)',
          // เลขบิลห้ามซ้ำภายในร้านเดียวกัน
          'CREATE UNIQUE INDEX idx_orders_shop_no ON orders (shop, order_no)',
          // รายงานยอดขายรายวันและซิงก์ขาลง
          'CREATE INDEX idx_orders_shop_created ON orders (shop, created)',
          'CREATE INDEX idx_orders_shop_updated ON orders (shop, updated)',
        ],
      }),
    );

    // ── เครื่องที่ลงทะเบียนไว้ (สำหรับจองช่วงเลขบิล) ──────────
    dao.saveCollection(
      new Collection({
        id: ID_DEVICES,
        name: 'devices',
        type: 'base',
        listRule: OWN_SHOP,
        viewRule: OWN_SHOP,
        createRule: OWN_SHOP,
        updateRule: OWN_SHOP,
        deleteRule: OWNER_OF_SHOP,
        schema: [
          {
            name: 'shop',
            type: 'relation',
            required: true,
            options: { collectionId: ID_SHOPS, maxSelect: 1, cascadeDelete: true },
          },
          { name: 'device_name', type: 'text', required: true, options: { max: 60 } },
          {
            name: 'device_index',
            type: 'number',
            required: true,
            // ลำดับที่ 1, 2, 3 … แปลงเป็นช่วงเลขบิล 1001–2000, 2001–3000 …
            options: { min: 1, noDecimal: true },
          },
          { name: 'order_no_start', type: 'number', required: true, options: { noDecimal: true } },
          { name: 'order_no_end', type: 'number', required: true, options: { noDecimal: true } },
          { name: 'last_seen_at', type: 'date', required: false },
        ],
        indexes: [
          // สองเครื่องในร้านเดียวกันห้ามได้ลำดับเดียวกัน มิฉะนั้นเลขบิลจะชน
          'CREATE UNIQUE INDEX idx_devices_shop_index ON devices (shop, device_index)',
        ],
      }),
    );

    return null;
  },
  (db) => {
    // ย้อนกลับ: ลบเรียงจากตารางที่อ้างถึงคนอื่นไปหาตารางที่ถูกอ้าง
    const dao = new Dao(db);
    const order = [
      ID_DEVICES,
      ID_ORDERS,
      ID_TABLE_SESSIONS,
      ID_MENU_ITEMS,
      ID_CATEGORIES,
      ID_STAFF,
      ID_SHOPS,
    ];
    for (const id of order) {
      dao.deleteCollection(dao.findCollectionByNameOrId(id));
    }
    return null;
  },
);
