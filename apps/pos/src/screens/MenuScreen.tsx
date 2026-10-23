import { Ban, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type {
  Category,
  Ingredient,
  MenuItem,
  MenuKind,
  ModifierGroup,
  RecipeLine,
} from '@prakaipos/shared';
import {
  formatBaht,
  MENU_KIND_LABEL,
  MENU_KINDS,
  MenuKindIcon,
  newUuid,
  parseBahtInput,
} from '@prakaipos/shared';
import { useState } from 'react';
import type { StaffProfile } from '../auth/credentials.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { marginPercent, recipeCost } from '../menu/cost.js';
import { optimizeImage } from '../menu/imageOptimize.js';
import { useMenuData } from '../menu/useMenuData.js';
import {
  createCategory,
  createMenuItem,
  deleteCategory,
  deleteMenuItem,
  setSoldOut,
  updateCategory,
  updateMenuItem,
} from '../menu/menuActions.js';
import { useIngredients } from '../stock/useIngredients.js';

/**
 * หน้าจัดการเมนู
 *
 * ปุ่ม "ของหมด" ใช้ได้ตลอดแม้ไม่มีเน็ต ส่วนการเพิ่ม/แก้/ลบต้องมีเน็ต
 * และเฉพาะเจ้าของร้านเท่านั้น (ดูเหตุผลใน menu/menuActions.ts)
 */

interface MenuScreenProps {
  shopId: string;
  profile: StaffProfile;
}

export function MenuScreen({ shopId, profile }: MenuScreenProps) {
  const menu = useMenuData(shopId);
  const ingredientsState = useIngredients(shopId);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MenuItem | 'new' | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  // หมวดที่กำลังแก้ชื่อ/ประเภท — ว่างเมื่อไม่ได้แก้หมวดไหน
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MenuItem | null>(null);

  const isOwner = profile.role === 'owner';

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      await menu.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ทำรายการไม่สำเร็จ');
    }
  }

  if (menu.loading) {
    return <div className="screen screen--center muted">กำลังโหลดเมนู…</div>;
  }

  return (
    <>
      <div className="app__toolbar">
        {menu.refreshing && <span className="muted">กำลังอัปเดต…</span>}
        {menu.stale && (
          <span className="sync sync--offline">
            <span className="sync__dot" />
            แสดงข้อมูลในเครื่อง อาจไม่ใช่ล่าสุด
          </span>
        )}
        <div className="app__spacer" />
        {isOwner && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setEditing('new')}
          >
            <Plus size={16} aria-hidden="true" />
            เพิ่มเมนู
          </button>
        )}
      </div>

      {error && <p className="alert">{error}</p>}

        {!isOwner && (
          <p className="hint">
            พนักงานกด "ของหมด" ได้ · การเพิ่มและแก้ไขเมนูต้องเข้าระบบด้วยบัญชีเจ้าของร้าน
          </p>
        )}

        {menu.categories.length === 0 && (
          <div className="panel">
            <h1>ยังไม่มีหมวดเมนู</h1>
            <p className="muted">เริ่มจากสร้างหมวดก่อน เช่น ข้าว เส้น เครื่องดื่ม</p>
            {isOwner && (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setAddingCategory(true)}
              >
                <Plus size={16} aria-hidden="true" />
                เพิ่มหมวด
              </button>
            )}
          </div>
        )}

        {menu.categories.map((cat) => (
          <CategoryBlock
            key={cat.id}
            category={cat}
            items={menu.items.filter((i) => i.categoryId === cat.id)}
            isOwner={isOwner}
            ingredients={ingredientsState.ingredients}
            onToggleSoldOut={(item) => void run(() => setSoldOut(item.id, !item.soldOut))}
            onEditItem={setEditing}
            onDeleteItem={setConfirmDelete}
            onEditCategory={() => setEditingCategory(cat)}
            onDeleteCategory={() =>
              void run(async () => {
                await deleteCategory(shopId, cat.id);
              })
            }
          />
        ))}

        {isOwner && menu.categories.length > 0 && (
          <button
            type="button"
            className="btn"
            style={{ marginTop: 16 }}
            onClick={() => setAddingCategory(true)}
          >
            <Plus size={16} aria-hidden="true" />
            เพิ่มหมวด
          </button>
        )}

      {confirmDelete && (
        <ConfirmDialog
          title={`ลบเมนู "${confirmDelete.name}"`}
          detail="บิลเก่าที่ขายเมนูนี้ไปแล้วยังอยู่ครบ ไม่ได้รับผลกระทบ"
          confirmLabel="ลบ"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() =>
            void run(async () => {
              await deleteMenuItem(shopId, confirmDelete.id);
              setConfirmDelete(null);
            })
          }
        />
      )}

      {addingCategory && (
        <CategoryDialog
          onCancel={() => setAddingCategory(false)}
          onSave={(name, kind) =>
            void run(async () => {
              await createCategory(shopId, name, kind, menu.categories.length);
              setAddingCategory(false);
            })
          }
        />
      )}

      {editingCategory && (
        <CategoryDialog
          initial={editingCategory}
          onCancel={() => setEditingCategory(null)}
          onSave={(name, kind) =>
            void run(async () => {
              await updateCategory(shopId, editingCategory.id, { name, kind });
              setEditingCategory(null);
            })
          }
        />
      )}

      {editing && (
        <ItemDialog
          item={editing === 'new' ? null : editing}
          categories={menu.categories}
          ingredients={ingredientsState.ingredients}
          onCancel={() => setEditing(null)}
          onSave={(input) =>
            void run(async () => {
              if (editing === 'new') {
                await createMenuItem(shopId, {
                  ...input,
                  sortOrder: menu.items.filter((i) => i.categoryId === input.categoryId)
                    .length,
                });
              } else {
                await updateMenuItem(shopId, editing.id, input);
              }
              setEditing(null);
            })
          }

        />
      )}
    </>
  );
}

function CategoryBlock({
  category,
  items,
  isOwner,
  ingredients,
  onToggleSoldOut,
  onEditItem,
  onDeleteItem,
  onEditCategory,
  onDeleteCategory,
}: {
  category: Category;
  items: MenuItem[];
  isOwner: boolean;
  ingredients: Ingredient[];
  onToggleSoldOut: (item: MenuItem) => void;
  onEditItem: (item: MenuItem) => void;
  onDeleteItem: (item: MenuItem) => void;
  onEditCategory: () => void;
  onDeleteCategory: () => void;
}) {
  return (
    <section className="mcat">
      <div className="mcat__head">
        <h2>{category.name}</h2>
        <span className="mcat__kind" data-kind={category.kind}>
          <MenuKindIcon kind={category.kind} size={14} />
          {MENU_KIND_LABEL[category.kind]}
        </span>
        <span className="muted">{items.length} รายการ</span>
        {isOwner && (
          <button type="button" className="linkbtn" onClick={onEditCategory}>
            <Pencil size={16} aria-hidden="true" />
            แก้หมวด
          </button>
        )}
        {isOwner && items.length === 0 && (
          <button type="button" className="linkbtn linkbtn--danger" onClick={onDeleteCategory}>
            <Trash2 size={16} aria-hidden="true" />
            ลบหมวด
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="hint">ยังไม่มีเมนูในหมวดนี้</p>
      ) : (
        <ul className="mlist">
          {items.map((item) => (
            <li key={item.id} className={item.soldOut ? 'mrow mrow--out' : 'mrow'}>
              {item.imageUrl ? (
                <img className="mrow__img" src={item.imageUrl} alt="" loading="lazy" />
              ) : (
                <span className="mrow__img mrow__img--empty" aria-hidden="true">
                  <MenuKindIcon kind={category.kind} size={22} />
                </span>
              )}

              <div className="mrow__info">
                <div className="mrow__name">{item.name}</div>
                <div className="mrow__price">{formatBaht(item.price)}</div>
                {isOwner && item.recipe.length > 0 && (
                  <div className="hint">
                    ต้นทุน {formatBaht(recipeCost(item.recipe, ingredients))}
                    {(() => {
                      const pct = marginPercent(item, ingredients);
                      return pct === null ? '' : ` · กำไร ${pct.toFixed(0)}%`;
                    })()}
                  </div>
                )}
              </div>

              {/* ปุ่มนี้ต้องกดได้ตลอดแม้ไม่มีเน็ต — พนักงานกดตอนกลางวันขายดี */}
              <button
                type="button"
                className={item.soldOut ? 'toggle toggle--on' : 'toggle'}
                onClick={() => onToggleSoldOut(item)}
              >
                {item.soldOut ? <Ban size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                {item.soldOut ? 'ของหมด' : 'มีของ'}
              </button>

              {isOwner && (
                <>
                  <button
                    type="button"
                    className="linkbtn"
                    onClick={() => onEditItem(item)}
                  >
                    <Pencil size={16} aria-hidden="true" />
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    className="linkbtn linkbtn--danger"
                    onClick={() => onDeleteItem(item)}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    ลบ
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CategoryDialog({
  initial,
  onCancel,
  onSave,
}: {
  /** หมวดเดิมเมื่อเป็นการแก้ไข — ว่างเมื่อเป็นการเพิ่มหมวดใหม่ */
  initial?: Category;
  onCancel: () => void;
  onSave: (name: string, kind: MenuKind) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<MenuKind>(initial?.kind ?? 'food');

  return (
    <div className="sheet">
      <form
        className="sheet__panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name.trim(), kind);
        }}
      >
        <h2>{initial ? 'แก้หมวด' : 'เพิ่มหมวด'}</h2>
        <label className="field">
          <span>ชื่อหมวด</span>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น ข้าว เส้น เครื่องดื่ม"
            autoFocus
            required
          />
        </label>
        <div className="field">
          <span>ประเภท</span>
          <div className="chips">
            {MENU_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={k === kind ? 'chip chip--on' : 'chip'}
                onClick={() => setKind(k)}
              >
                <MenuKindIcon kind={k} size={16} />
                {MENU_KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <small className="hint">
            หน้าขายและหน้าลูกค้าจะจัดกลุ่มอาหารขึ้นก่อนเครื่องดื่ม และใส่ไอคอนกำกับให้
          </small>
        </div>
        <div className="sheet__actions">
          <button type="button" className="btn" onClick={onCancel}>
            <X size={16} aria-hidden="true" />
            ยกเลิก
          </button>
          <button type="submit" className="btn btn--primary">
            <Check size={16} aria-hidden="true" />
            บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}

function ItemDialog({
  item,
  categories,
  ingredients,
  onCancel,
  onSave,
}: {
  item: MenuItem | null;
  categories: Category[];
  ingredients: Ingredient[];
  onCancel: () => void;
  onSave: (input: {
    categoryId: string;
    name: string;
    price: number;
    image?: File | null;
    modifierGroups: ModifierGroup[];
    recipe: RecipeLine[];
  }) => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [priceText, setPriceText] = useState(
    item ? (item.price / 100).toFixed(2) : '',
  );
  const [categoryId, setCategoryId] = useState(
    item?.categoryId ?? categories[0]?.id ?? '',
  );
  const [image, setImage] = useState<File | null>(null);
  const [optimizingImage, setOptimizingImage] = useState(false);
  const [imageSizeHint, setImageSizeHint] = useState<string | null>(null);
  const [groups, setGroups] = useState<ModifierGroup[]>(item?.modifierGroups ?? []);
  const [recipe, setRecipe] = useState<RecipeLine[]>(item?.recipe ?? []);
  const [invalid, setInvalid] = useState<string | null>(null);

  // ย่อ/บีบอัดรูปทันทีที่เลือกไฟล์ ก่อนถึงตอนกดบันทึกด้วยซ้ำ — เพื่อให้เจ้าของร้าน
  // เห็นผลลัพธ์ (ขนาดไฟล์ลดลงแค่ไหน) ก่อนตัดสินใจบันทึกจริง
  async function handleImageChange(file: File | null) {
    if (!file) {
      setImage(null);
      setImageSizeHint(null);
      return;
    }
    setOptimizingImage(true);
    try {
      const optimized = await optimizeImage(file);
      setImage(optimized);
      setImageSizeHint(
        optimized.size < file.size
          ? `ย่อจาก ${(file.size / 1024).toFixed(0)} KB เหลือ ${(optimized.size / 1024).toFixed(0)} KB`
          : `${(optimized.size / 1024).toFixed(0)} KB`,
      );
    } finally {
      setOptimizingImage(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const price = parseBahtInput(priceText);

    if (price === null || price <= 0) {
      setInvalid('กรอกราคาเป็นตัวเลข เช่น 120 หรือ 120.50');
      return;
    }
    if (!categoryId) {
      setInvalid('เลือกหมวดก่อน');
      return;
    }

    // ตัดกลุ่ม/ตัวเลือกที่ยังไม่ได้ตั้งชื่อทิ้ง — กันเผลอบันทึกแถวว่างที่กดเพิ่มไว้แล้วไม่ได้กรอก
    const cleanGroups = groups
      .map((g) => ({ ...g, options: g.options.filter((o) => o.name.trim() !== '') }))
      .filter((g) => g.name.trim() !== '' && g.options.length > 0);
    const cleanRecipe = recipe.filter((r) => r.ingredientId && r.qty > 0);

    onSave({
      categoryId,
      name: name.trim(),
      price,
      image,
      modifierGroups: cleanGroups,
      recipe: cleanRecipe,
    });
  }

  return (
    <div className="sheet">
      <form className="sheet__panel" onSubmit={submit}>
        <h2>{item ? 'แก้ไขเมนู' : 'เพิ่มเมนู'}</h2>

        <label className="field">
          <span>ชื่อเมนู</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น ข้าวผัดกุ้ง"
            required
          />
        </label>

        <label className="field">
          <span>ราคา (บาท)</span>
          <input
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            inputMode="decimal"
            placeholder="120.00"
            required
          />
        </label>

        <div className="field">
          <span>หมวด</span>
          {/* ปุ่มแทน dropdown ตามหลักในเอกสารออกแบบหัวข้อ 12 */}
          <div className="chips">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={c.id === categoryId ? 'chip chip--on' : 'chip'}
                onClick={() => setCategoryId(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>รูป (ไม่ใส่ก็ได้)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => void handleImageChange(e.target.files?.[0] ?? null)}
          />
          <small className="hint">
            {optimizingImage
              ? 'กำลังย่อรูป…'
              : imageSizeHint
                ? `ย่อรูปให้แล้วอัตโนมัติ · ${imageSizeHint}`
                : 'ย่อรูปให้อัตโนมัติก่อนอัปโหลดเสมอ ไม่ต้องแต่งรูปมาเอง'}
          </small>
        </label>

        <ModifierGroupsEditor groups={groups} onChange={setGroups} />

        <RecipeEditor recipe={recipe} ingredients={ingredients} onChange={setRecipe} />

        {invalid && <p className="alert">{invalid}</p>}

        <div className="sheet__actions">
          <button type="button" className="btn" onClick={onCancel}>
            <X size={16} aria-hidden="true" />
            ยกเลิก
          </button>
          <button type="submit" className="btn btn--primary" disabled={optimizingImage}>
            {optimizingImage ? 'กำลังย่อรูป…' : 'บันทึก'}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * แก้ตัวเลือก/ท็อปปิ้งของเมนู — เช่น "ระดับความเผ็ด" (เลือกได้ตัวเดียว)
 * หรือ "ตัวเลือกเพิ่ม" (เลือกได้หลายอย่าง เช่น ไข่ดาว +10)
 *
 * แถวที่ยังไม่กรอกชื่อจะถูกตัดทิ้งตอนบันทึก (ดู submit() ใน ItemDialog)
 * จึงกดเพิ่มแถวว่างไว้ก่อนได้โดยไม่ต้องกังวลว่าจะบันทึกขยะ
 */
function ModifierGroupsEditor({
  groups,
  onChange,
}: {
  groups: ModifierGroup[];
  onChange: (groups: ModifierGroup[]) => void;
}) {
  function addGroup() {
    onChange([...groups, { id: newUuid(), name: '', required: false, multiple: false, options: [] }]);
  }

  function updateGroup(id: string, patch: Partial<ModifierGroup>) {
    onChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function removeGroup(id: string) {
    onChange(groups.filter((g) => g.id !== id));
  }

  function addOption(groupId: string) {
    updateGroup(groupId, {
      options: [
        ...(groups.find((g) => g.id === groupId)?.options ?? []),
        { id: newUuid(), name: '', priceDelta: 0 },
      ],
    });
  }

  return (
    <div className="field">
      <span>ตัวเลือก/ท็อปปิ้ง (ไม่บังคับ)</span>

      {groups.map((group) => (
        <div key={group.id} className="modgroup">
          <div className="modgroup__row">
            <input
              value={group.name}
              onChange={(e) => updateGroup(group.id, { name: e.target.value })}
              placeholder="ชื่อกลุ่ม เช่น ระดับความเผ็ด"
            />
            <button type="button" className="linkbtn linkbtn--danger" onClick={() => removeGroup(group.id)}>
              <Trash2 size={16} aria-hidden="true" />
              ลบกลุ่ม
            </button>
          </div>

          <label className="modgroup__check">
            <input
              type="checkbox"
              checked={group.multiple}
              onChange={(e) => updateGroup(group.id, { multiple: e.target.checked })}
            />
            เลือกได้หลายอย่าง
          </label>
          <label className="modgroup__check">
            <input
              type="checkbox"
              checked={group.required}
              onChange={(e) => updateGroup(group.id, { required: e.target.checked })}
            />
            ต้องเลือกก่อนสั่ง
          </label>

          {group.options.map((opt) => (
            <div key={opt.id} className="modgroup__row">
              <input
                value={opt.name}
                onChange={(e) =>
                  updateGroup(group.id, {
                    options: group.options.map((o) =>
                      o.id === opt.id ? { ...o, name: e.target.value } : o,
                    ),
                  })
                }
                placeholder="เช่น เผ็ดน้อย"
              />
              <input
                value={opt.priceDelta === 0 ? '' : (opt.priceDelta / 100).toFixed(2)}
                onChange={(e) => {
                  const delta = parseBahtInput(e.target.value) ?? 0;
                  updateGroup(group.id, {
                    options: group.options.map((o) =>
                      o.id === opt.id ? { ...o, priceDelta: delta } : o,
                    ),
                  });
                }}
                inputMode="decimal"
                placeholder="+0.00"
                className="modgroup__price"
              />
              <button
                type="button"
                className="linkbtn linkbtn--danger"
                onClick={() =>
                  updateGroup(group.id, { options: group.options.filter((o) => o.id !== opt.id) })
                }
              >
                <Trash2 size={16} aria-hidden="true" />
                ลบ
              </button>
            </div>
          ))}

          <button type="button" className="linkbtn" onClick={() => addOption(group.id)}>
            <Plus size={16} aria-hidden="true" />
            เพิ่มตัวเลือก
          </button>
        </div>
      ))}

      <button type="button" className="btn" style={{ marginTop: 8 }} onClick={addGroup}>
        <Plus size={16} aria-hidden="true" />
        เพิ่มกลุ่มตัวเลือก
      </button>
    </div>
  );
}

/**
 * แก้สูตรอาหาร (BOM) ของเมนู — วัตถุดิบที่ใช้ต่อการขาย 1 หน่วย
 *
 * ต้องเพิ่มวัตถุดิบที่หน้า "วัตถุดิบและสต๊อก" ก่อนถึงจะเลือกได้ที่นี่
 * แถวที่ยังไม่ได้เลือกวัตถุดิบหรือจำนวนเป็น 0 จะถูกตัดทิ้งตอนบันทึก
 */
function RecipeEditor({
  recipe,
  ingredients,
  onChange,
}: {
  recipe: RecipeLine[];
  ingredients: Ingredient[];
  onChange: (recipe: RecipeLine[]) => void;
}) {
  function addLine() {
    if (ingredients.length === 0) return;
    onChange([...recipe, { ingredientId: ingredients[0]?.id ?? '', qty: 0 }]);
  }

  function updateLine(index: number, patch: Partial<RecipeLine>) {
    onChange(recipe.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeLine(index: number) {
    onChange(recipe.filter((_, i) => i !== index));
  }

  return (
    <div className="field">
      <span>สูตรอาหาร (BOM) — ไม่บังคับ</span>

      {ingredients.length === 0 ? (
        <p className="hint">ยังไม่มีวัตถุดิบในระบบ — เพิ่มที่หน้า "วัตถุดิบและสต๊อก" ก่อน</p>
      ) : (
        <>
          {recipe.map((line, i) => {
            const ingredient = ingredients.find((ing) => ing.id === line.ingredientId);
            return (
              <div key={i} className="modgroup__row">
                <select
                  value={line.ingredientId}
                  onChange={(e) => updateLine(i, { ingredientId: e.target.value })}
                >
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name} ({ing.unit})
                    </option>
                  ))}
                </select>
                <input
                  value={line.qty === 0 ? '' : String(line.qty)}
                  onChange={(e) => updateLine(i, { qty: Number.parseFloat(e.target.value) || 0 })}
                  inputMode="decimal"
                  placeholder={`จำนวน (${ingredient?.unit ?? ''})`}
                  className="modgroup__price"
                />
                <button type="button" className="linkbtn linkbtn--danger" onClick={() => removeLine(i)}>
                  <Trash2 size={16} aria-hidden="true" />
                  ลบ
                </button>
              </div>
            );
          })}
          <button type="button" className="linkbtn" onClick={addLine}>
            <Plus size={16} aria-hidden="true" />
            เพิ่มวัตถุดิบในสูตร
          </button>
        </>
      )}
    </div>
  );
}
