/// <reference path="../pb_data/types.d.ts" />

/**
 * วัตถุดิบ + สต๊อก + สูตรอาหาร (BOM) — เอกสารออกแบบหัวข้อ 06 ก้อนที่ 2
 *
 * เก็บ `ingredients.stock_qty` เป็นค่าคงเหลือปัจจุบัน (ไม่ใช่ผลรวมจาก
 * `stock_movements` ทุกครั้ง) เพื่อให้อ่านเร็ว — `stock_movements` เป็น
 * เลดเจอร์ไว้ตรวจสอบย้อนหลังว่าคงเหลือมาจากไหนบ้าง (รับเข้า/ตัดออก/นับสต๊อก)
 * เหมือนหลัก "ไม่ลบทิ้ง เปลี่ยนสถานะ" ที่ใช้กับ orders/staff ทั้งระบบ
 *
 * จำนวนวัตถุดิบ (stock_qty, qty_delta) ไม่ใช่เงิน จึงยอมให้เป็นทศนิยมได้
 * (กรัม/มิลลิลิตรของจริงไม่ใช่จำนวนเต็มเสมอไป) ต่างจากเงินที่บังคับเป็น
 * จำนวนเต็มสตางค์เพื่อกัน float ผิดพลาดตอนรวมบิล
 *
 * จัดการวัตถุดิบและสต๊อกทั้งหมดเป็นสิทธิ์เจ้าของร้านเท่านั้น (เหมือนการแก้เมนู)
 * ต่างจากปุ่ม "ของหมด" ที่พนักงานกดได้ — ยังไม่เปิดให้พนักงานรับสต๊อกเองในก้อนนี้
 * เพราะเพิ่มความซับซ้อนเรื่องสิทธิ์โดยยังไม่มีร้านไหนขอ รอดูจากร้านนำร่องก่อน
 */

migrate(
  (db) => {
    const dao = new Dao(db);
    const shops = dao.findCollectionByNameOrId('shops');
    const staff = dao.findCollectionByNameOrId('staff');

    // id คงที่กำหนดเอง (ตามแบบ init_phase1.js) เพื่อให้อ้างอิงข้าม collection
    // ได้แน่นอนภายในไมเกรชันเดียวกัน ไม่ต้องพึ่งพฤติกรรมของ dao.saveCollection()
    const ID_INGREDIENTS = 'pkpingredient01';

    const ingredients = new Collection({
      id: ID_INGREDIENTS,
      name: 'ingredients',
      type: 'base',
      listRule: 'shop = @request.auth.shop',
      viewRule: 'shop = @request.auth.shop',
      createRule: 'shop = @request.auth.shop && @request.auth.role = "owner"',
      updateRule: 'shop = @request.auth.shop && @request.auth.role = "owner"',
      deleteRule: 'shop = @request.auth.shop && @request.auth.role = "owner"',
      schema: [
        {
          name: 'shop',
          type: 'relation',
          required: true,
          options: { collectionId: shops.id, maxSelect: 1, cascadeDelete: true },
        },
        { name: 'name', type: 'text', required: true, options: { max: 120 } },
        // หน่วยเป็นข้อความอิสระ เช่น "กรัม", "มล.", "ชิ้น" — ไม่ผูกหน่วยตายตัว
        // เพราะร้านเล็กแต่ละร้านใช้หน่วยไม่เหมือนกัน
        { name: 'unit', type: 'text', required: true, options: { max: 20 } },
        { name: 'stock_qty', type: 'number', required: false, options: {} },
        {
          name: 'cost_per_unit',
          type: 'number',
          required: true,
          // หน่วยสตางค์ต่อ 1 หน่วยของวัตถุดิบ
          options: { min: 0, noDecimal: true },
        },
        { name: 'active', type: 'bool', required: false },
      ],
      indexes: ['CREATE INDEX idx_ingredients_shop ON ingredients (shop)'],
    });
    dao.saveCollection(ingredients);

    const movements = new Collection({
      name: 'stock_movements',
      type: 'base',
      listRule: 'shop = @request.auth.shop',
      viewRule: 'shop = @request.auth.shop',
      createRule: 'shop = @request.auth.shop && @request.auth.role = "owner"',
      // เลดเจอร์แก้/ลบไม่ได้ — ตรวจสอบย้อนหลังต้องเชื่อถือได้
      updateRule: null,
      deleteRule: null,
      schema: [
        {
          name: 'shop',
          type: 'relation',
          required: true,
          options: { collectionId: shops.id, maxSelect: 1, cascadeDelete: true },
        },
        {
          name: 'ingredient',
          type: 'relation',
          required: true,
          options: { collectionId: ID_INGREDIENTS, maxSelect: 1, cascadeDelete: true },
        },
        {
          name: 'type',
          type: 'select',
          required: true,
          options: { maxSelect: 1, values: ['receive', 'deduct', 'count'] },
        },
        // ค่าที่เปลี่ยนจริง (บวก = เพิ่ม, ลบ = ลด) — 'count' ก็แปลงเป็นส่วนต่างก่อนบันทึก
        // เพื่อให้เลดเจอร์บวกกันแล้วได้ยอดคงเหลือปัจจุบันเสมอ ไม่ต้องมีตรรกะพิเศษตอนอ่าน
        { name: 'qty_delta', type: 'number', required: true, options: {} },
        { name: 'note', type: 'text', required: false, options: { max: 200 } },
        {
          name: 'staff',
          type: 'relation',
          required: false,
          options: { collectionId: staff.id, maxSelect: 1, cascadeDelete: false },
        },
      ],
      indexes: [
        'CREATE INDEX idx_stock_movements_ingredient ON stock_movements (ingredient, created)',
      ],
    });
    dao.saveCollection(movements);

    // สูตรอาหาร (BOM) — เก็บเป็น JSON บนตัวเมนูเลย เหมือน modifier_groups
    // เพราะแก้พร้อมกับเมนูเสมอ ไม่มีใครอ่านสูตรแยกจากเมนูของมัน
    const menuItems = dao.findCollectionByNameOrId('menu_items');
    menuItems.schema.addField(
      new SchemaField({
        name: 'recipe',
        type: 'json',
        required: false,
        options: { maxSize: 16384 },
      }),
    );
    dao.saveCollection(menuItems);

    return null;
  },
  (db) => {
    const dao = new Dao(db);

    const menuItems = dao.findCollectionByNameOrId('menu_items');
    menuItems.schema.removeField(menuItems.schema.getFieldByName('recipe').id);
    dao.saveCollection(menuItems);

    dao.deleteCollection(dao.findCollectionByNameOrId('stock_movements'));
    dao.deleteCollection(dao.findCollectionByNameOrId('ingredients'));
    return null;
  },
);
