import { useEffect, useMemo, useState } from 'react';
import { pb } from '../pb.js';
import {
  collectionFields,
  editableFields,
  fieldInputKind,
  fileFields,
  formToPayload,
  hasPendingFiles,
  recordToForm,
  toFormData,
  type FormState,
  type PbCollection,
  type PbField,
} from './schema.js';

/**
 * เครื่องมือดู/แก้ข้อมูลทุก collection — สำหรับทีมงานตอนพัฒนาระบบ
 *
 * เรนเดอร์ฟอร์มจาก schema ของ collection อัตโนมัติ ไม่ต้องเขียนฟอร์มมือต่อ
 * collection และครอบคลุม collection ที่เพิ่มใหม่ในอนาคตด้วย
 *
 * เปิดเฉพาะโหมด dev (ดูการ์ดที่ App.tsx) — โทเคน superuser ที่ล็อกอินอยู่
 * เข้าถึงได้เต็มสิทธิ์เหมือนหน้า PocketBase /_/ อยู่แล้ว นี่เป็นแค่ UI ที่สะดวกกว่า
 */

const PER_PAGE = 30;

function errText(err: unknown): string {
  if (err && typeof err === 'object') {
    const anyErr = err as { message?: string; response?: { data?: unknown } };
    const data = anyErr.response?.data;
    const detail = data && Object.keys(data).length ? ` · ${JSON.stringify(data)}` : '';
    return `${anyErr.message ?? 'ทำรายการไม่สำเร็จ'}${detail}`;
  }
  return String(err);
}

export function DevData() {
  const [collections, setCollections] = useState<PbCollection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    void (async () => {
      try {
        const list = (await pb.collections.getFullList({
          sort: 'name',
        })) as unknown as PbCollection[];
        const visible = list.filter((c) => !c.system && c.type !== 'view');
        setCollections(visible);
        setSelected((cur) => cur || visible[0]?.name || '');
      } catch (err) {
        setError(errText(err));
      }
    })();
  }, []);

  const collection = useMemo(
    () => collections?.find((c) => c.name === selected) ?? null,
    [collections, selected],
  );

  return (
    <div className="devdata">
      <div className="devdata__head">
        <label className="field devdata__pick">
          <span>Collection</span>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {(collections ?? []).map((c) => (
              <option key={c.id} value={c.name}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          แก้ข้อมูลตรงในฐานข้อมูลด้วยสิทธิ์ superuser — ใช้ตอนพัฒนาเท่านั้น
        </p>
      </div>

      {error && <p className="alert">{error}</p>}

      {collection && <CollectionBrowser key={collection.id} collection={collection} />}
    </div>
  );
}

// เรกคอร์ดมีรูปร่างต่างกันไปตาม collection — เครื่องมือ dev นี้จึงรับเป็น any โดยตั้งใจ
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any> & { id: string };

function CollectionBrowser({ collection }: { collection: PbCollection }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('-created');
  const [applied, setApplied] = useState({ filter: '', sort: '-created' });
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const cols = collectionFields(collection).map((x) => x.name);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    void (async () => {
      try {
        const res = await pb.collection(collection.name).getList(page, PER_PAGE, {
          ...(applied.filter ? { filter: applied.filter } : {}),
          ...(applied.sort ? { sort: applied.sort } : {}),
        });
        if (cancelled) return;
        setRows(res.items as Row[]);
        setTotalPages(res.totalPages);
        setTotalItems(res.totalItems);
      } catch (err) {
        if (!cancelled) setError(errText(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collection.name, page, applied, reloadKey]);

  function runQuery() {
    setPage(1);
    setApplied({ filter: filter.trim(), sort: sort.trim() });
  }

  function afterWrite() {
    setEditing(null);
    setReloadKey((k) => k + 1);
  }

  return (
    <div>
      <form
        className="devdata__toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          runQuery();
        }}
      >
        <label className="field">
          <span>filter</span>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`เช่น shop="abc" && active=true`}
          />
        </label>
        <label className="field">
          <span>sort</span>
          <input value={sort} onChange={(e) => setSort(e.target.value)} placeholder="-created" />
        </label>
        <button type="submit" className="btn">
          ค้นหา
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setEditing('new')}
        >
          + สร้างใหม่
        </button>
      </form>

      {error && <p className="alert">{error}</p>}

      {editing && (
        <RecordEditor
          collection={collection}
          record={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={afterWrite}
        />
      )}

      {!rows ? (
        <p className="muted">กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <p className="muted">ไม่มีเรกคอร์ดที่ตรงเงื่อนไข</p>
      ) : (
        <>
          <p className="muted">
            {totalItems} เรกคอร์ด · หน้า {page}/{totalPages}
          </p>
          <div className="devdata__scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>id</th>
                  {cols.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="tbl__row" onClick={() => setEditing(row)}>
                    <td className="mono">{row.id}</td>
                    {cols.map((c) => (
                      <td key={c}>{renderCell(row[c])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="devdata__pager">
            <button
              type="button"
              className="btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ก่อนหน้า
            </button>
            <button
              type="button"
              className="btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              ถัดไป
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const s = JSON.stringify(value);
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  }
  const s = String(value);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

function RecordEditor({
  collection,
  record,
  onCancel,
  onSaved,
}: {
  collection: PbCollection;
  record: Row | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const editable = editableFields(collection);
  const files = fileFields(collection);

  const [form, setForm] = useState<FormState>(() =>
    recordToForm(record ?? {}, editable),
  );
  const [pending, setPending] = useState<Record<string, File | File[] | null>>({});
  const [extraJson, setExtraJson] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function set(name: string, value: FormState[string]) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = formToPayload(form, editable);
      if (extraJson.trim()) {
        try {
          Object.assign(payload, JSON.parse(extraJson));
        } catch {
          throw new Error('ช่อง "ฟิลด์เพิ่มเติม (JSON)" ไม่ถูกต้อง');
        }
      }
      const body = hasPendingFiles(pending) ? toFormData(payload, pending) : payload;
      const api = pb.collection(collection.name);
      if (record) await api.update(record.id, body);
      else await api.create(body);
      onSaved();
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await pb.collection(collection.name).delete(record!.id);
      onSaved();
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  }

  return (
    <div className="panel devdata__editor">
      <div className="devdata__editorhead">
        <h3>
          {record ? `แก้ ${collection.name}` : `สร้าง ${collection.name} ใหม่`}
          {record && <span className="muted mono"> · {record.id}</span>}
        </h3>
        <button type="button" className="linkbtn" onClick={onCancel}>
          ปิด
        </button>
      </div>

      {editable.map((field) => (
        <FieldInput key={field.id} field={field} value={form[field.name]} onChange={set} />
      ))}

      {files.map((field) => (
        <label key={field.id} className="field">
          <span>
            {field.name} <em className="muted">(ไฟล์)</em>
          </span>
          {record && typeof record[field.name] === 'string' && record[field.name] ? (
            <a
              className="mono"
              href={pb.files.getURL(record, record[field.name] as string)}
              target="_blank"
              rel="noreferrer"
            >
              {String(record[field.name])}
            </a>
          ) : null}
          <input
            type="file"
            multiple={(field.options?.maxSelect ?? 1) !== 1}
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              setPending((p) => ({
                ...p,
                [field.name]:
                  (field.options?.maxSelect ?? 1) !== 1 ? picked : (picked[0] ?? null),
              }));
            }}
          />
        </label>
      ))}

      <label className="field">
        <span>
          ฟิลด์เพิ่มเติม (JSON) <em className="muted">— เช่น password/passwordConfirm ของ auth</em>
        </span>
        <textarea
          className="devdata__code"
          rows={2}
          value={extraJson}
          onChange={(e) => setExtraJson(e.target.value)}
          placeholder='{"password":"...","passwordConfirm":"..."}'
        />
      </label>

      {error && <p className="alert">{error}</p>}

      <div className="devdata__actions">
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>
          ยกเลิก
        </button>
        <div className="spacer" />
        {record &&
          (confirmDelete ? (
            <>
              <span className="muted">ยืนยันลบ?</span>
              <button
                type="button"
                className="btn btn--danger"
                disabled={busy}
                onClick={() => void remove()}
              >
                ลบถาวร
              </button>
              <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                ไม่
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              ลบ
            </button>
          ))}
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: PbField;
  value: FormState[string] | undefined;
  onChange: (name: string, value: FormState[string]) => void;
}) {
  const kind = fieldInputKind(field);
  const label = (
    <span>
      {field.name}
      {field.required && <em className="devdata__req"> *</em>}
      {field.type === 'relation' && field.options?.collectionId && (
        <em className="muted"> → id ของ {field.options.collectionId}</em>
      )}
    </span>
  );

  if (kind === 'bool') {
    return (
      <label className="field devdata__bool">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(field.name, e.target.checked)}
        />
        {label}
      </label>
    );
  }

  if (kind === 'json' || kind === 'editor') {
    return (
      <label className="field">
        {label}
        <textarea
          className="devdata__code"
          rows={kind === 'json' ? 6 : 3}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(field.name, e.target.value)}
        />
      </label>
    );
  }

  if (kind === 'select' || kind === 'multiselect') {
    const opts = field.options?.values ?? [];
    return (
      <label className="field">
        {label}
        <select
          multiple={kind === 'multiselect'}
          value={
            kind === 'multiselect'
              ? Array.isArray(value)
                ? value
                : []
              : typeof value === 'string'
                ? value
                : ''
          }
          onChange={(e) => {
            if (kind === 'multiselect') {
              onChange(
                field.name,
                Array.from(e.target.selectedOptions, (o) => o.value),
              );
            } else {
              onChange(field.name, e.target.value);
            }
          }}
        >
          {kind === 'select' && <option value="">— ไม่เลือก —</option>}
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="field">
      {label}
      <input
        type={kind === 'number' ? 'number' : kind === 'date' ? 'datetime-local' : 'text'}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(field.name, e.target.value)}
      />
    </label>
  );
}
