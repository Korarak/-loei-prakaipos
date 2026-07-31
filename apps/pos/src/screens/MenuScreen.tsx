import type { Category, MenuItem } from '@prakaipos/shared';
import { formatBaht, parseBahtInput } from '@prakaipos/shared';
import { useState } from 'react';
import type { StaffProfile } from '../auth/credentials.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { useMenuData } from '../menu/useMenuData.js';
import {
  createCategory,
  createMenuItem,
  deleteCategory,
  deleteMenuItem,
  setSoldOut,
  updateMenuItem,
} from '../menu/menuActions.js';

/**
 * หน้าจัดการเมนู
 *
 * ปุ่ม "ของหมด" ใช้ได้ตลอดแม้ไม่มีเน็ต ส่วนการเพิ่ม/แก้/ลบต้องมีเน็ต
 * และเฉพาะเจ้าของร้านเท่านั้น (ดูเหตุผลใน menu/menuActions.ts)
 */

interface MenuScreenProps {
  shopId: string;
  profile: StaffProfile;
  onBack: () => void;
}

export function MenuScreen({ shopId, profile, onBack }: MenuScreenProps) {
  const menu = useMenuData(shopId);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MenuItem | 'new' | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
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
    <div className="app">
      <header className="app__bar">
        <button type="button" className="app__user" onClick={onBack}>
          ← กลับ
        </button>
        <div className="app__brand">จัดการเมนู</div>
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
            + เพิ่มเมนู
          </button>
        )}
      </header>

      <main className="app__main">
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
                + เพิ่มหมวด
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
            onToggleSoldOut={(item) => void run(() => setSoldOut(item.id, !item.soldOut))}
            onEditItem={setEditing}
            onDeleteItem={setConfirmDelete}
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
            + เพิ่มหมวด
          </button>
        )}
      </main>

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
          onSave={(name) =>
            void run(async () => {
              await createCategory(shopId, name, menu.categories.length);
              setAddingCategory(false);
            })
          }
        />
      )}

      {editing && (
        <ItemDialog
          item={editing === 'new' ? null : editing}
          categories={menu.categories}
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
    </div>
  );
}

function CategoryBlock({
  category,
  items,
  isOwner,
  onToggleSoldOut,
  onEditItem,
  onDeleteItem,
  onDeleteCategory,
}: {
  category: Category;
  items: MenuItem[];
  isOwner: boolean;
  onToggleSoldOut: (item: MenuItem) => void;
  onEditItem: (item: MenuItem) => void;
  onDeleteItem: (item: MenuItem) => void;
  onDeleteCategory: () => void;
}) {
  return (
    <section className="mcat">
      <div className="mcat__head">
        <h2>{category.name}</h2>
        <span className="muted">{items.length} รายการ</span>
        {isOwner && items.length === 0 && (
          <button type="button" className="linkbtn" onClick={onDeleteCategory}>
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
                <span className="mrow__img mrow__img--empty" aria-hidden="true" />
              )}

              <div className="mrow__info">
                <div className="mrow__name">{item.name}</div>
                <div className="mrow__price">{formatBaht(item.price)}</div>
              </div>

              {/* ปุ่มนี้ต้องกดได้ตลอดแม้ไม่มีเน็ต — พนักงานกดตอนกลางวันขายดี */}
              <button
                type="button"
                className={item.soldOut ? 'toggle toggle--on' : 'toggle'}
                onClick={() => onToggleSoldOut(item)}
              >
                {item.soldOut ? 'ของหมด' : 'มีของ'}
              </button>

              {isOwner && (
                <>
                  <button
                    type="button"
                    className="linkbtn"
                    onClick={() => onEditItem(item)}
                  >
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    className="linkbtn linkbtn--danger"
                    onClick={() => onDeleteItem(item)}
                  >
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
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState('');

  return (
    <div className="sheet">
      <form
        className="sheet__panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name.trim());
        }}
      >
        <h2>เพิ่มหมวด</h2>
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
        <div className="sheet__actions">
          <button type="button" className="btn" onClick={onCancel}>
            ยกเลิก
          </button>
          <button type="submit" className="btn btn--primary">
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
  onCancel,
  onSave,
}: {
  item: MenuItem | null;
  categories: Category[];
  onCancel: () => void;
  onSave: (input: {
    categoryId: string;
    name: string;
    price: number;
    image?: File | null;
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
  const [invalid, setInvalid] = useState<string | null>(null);

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

    onSave({ categoryId, name: name.trim(), price, image });
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
            onChange={(e) => setImage(e.target.files?.[0] ?? null)}
          />
          <small className="hint">
            ไฟล์ไม่เกิน 2 MB — รูปใหญ่กว่านี้ทำให้หน้าลูกค้าโหลดช้าตอนสัญญาณอ่อน
          </small>
        </label>

        {invalid && <p className="alert">{invalid}</p>}

        <div className="sheet__actions">
          <button type="button" className="btn" onClick={onCancel}>
            ยกเลิก
          </button>
          <button type="submit" className="btn btn--primary">
            บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}
