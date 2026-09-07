/**
 * ตัวช่วยสร้างฟอร์มแก้เรกคอร์ดจาก schema ของ collection แบบอัตโนมัติ
 *
 * แอป admin ล็อกอินด้วยบัญชี superuser ของ PocketBase อยู่แล้ว (ดู src/pb.ts)
 * โทเคนจึงเข้าถึงทุก collection ได้เต็มสิทธิ์เหมือนหน้า /_/ — ส่วนที่ขาดคือ UI
 * แทนที่จะเขียนฟอร์มมือทีละ collection เราอ่าน schema แล้วเรนเดอร์ช่องกรอก
 * ตามชนิดฟิลด์ ครอบคลุมทั้ง collection ที่มีตอนนี้และที่จะเพิ่มในอนาคต
 *
 * ฟังก์ชันในไฟล์นี้เป็น pure ทั้งหมด เทสต์ได้ที่ schema.test.ts
 */

/** ฟิลด์หนึ่งช่องใน schema ของ collection — พิมพ์เองเพราะ type ของ SDK 0.25
 *  อิงเซิร์ฟเวอร์รุ่นใหม่กว่าที่โปรเจกต์ใช้ (0.22 ยังใช้คำว่า "schema") */
export interface PbField {
  id: string;
  name: string;
  type: string;
  required?: boolean;
  options?: {
    values?: string[];
    maxSelect?: number | null;
    collectionId?: string;
    [key: string]: unknown;
  };
}

export interface PbCollection {
  id: string;
  name: string;
  type: 'base' | 'auth' | 'view';
  system?: boolean;
  schema?: PbField[];
  fields?: PbField[];
}

/** ชนิดช่องกรอกที่ UI รู้จัก */
export type FieldInputKind =
  | 'text'
  | 'number'
  | 'bool'
  | 'select'
  | 'multiselect'
  | 'json'
  | 'date'
  | 'file'
  | 'editor'
  | 'readonly';

/** ฟิลด์ที่เซิร์ฟเวอร์จัดการเอง แก้ไม่ได้ — แสดงแบบอ่านอย่างเดียว */
const READONLY_TYPES = new Set(['autodate']);

export function fieldInputKind(field: PbField): FieldInputKind {
  if (READONLY_TYPES.has(field.type)) return 'readonly';

  switch (field.type) {
    case 'number':
      return 'number';
    case 'bool':
      return 'bool';
    case 'json':
      return 'json';
    case 'date':
      return 'date';
    case 'file':
      return 'file';
    case 'editor':
      return 'editor';
    case 'select':
      return (field.options?.maxSelect ?? 1) === 1 ? 'select' : 'multiselect';
    default:
      // text, email, url, relation — กรอกเป็นข้อความ (relation = ใส่ id ตรงๆ)
      return 'text';
  }
}

/** schema ของ collection ไม่ว่าเซิร์ฟเวอร์จะเรียก schema หรือ fields */
export function collectionFields(collection: PbCollection): PbField[] {
  return (collection.schema ?? collection.fields ?? []).filter((f) => !f.name.startsWith('@'));
}

/** ฟิลด์ที่ลงในฟอร์มแก้ไขได้ — ตัด id/ระบบ และไฟล์ (จัดการแยกผ่าน input file) ออก */
export function editableFields(collection: PbCollection): PbField[] {
  return collectionFields(collection).filter(
    (f) => fieldInputKind(f) !== 'readonly' && fieldInputKind(f) !== 'file',
  );
}

export function fileFields(collection: PbCollection): PbField[] {
  return collectionFields(collection).filter((f) => fieldInputKind(f) === 'file');
}

type FormValue = string | boolean | string[];
export type FormState = Record<string, FormValue>;

/** เรกคอร์ดจากเซิร์ฟเวอร์ → state ของฟอร์ม (ทุกค่าเป็น string/bool/array พร้อมผูกกับ input) */
export function recordToForm(
  record: Record<string, unknown>,
  fields: PbField[],
): FormState {
  const form: FormState = {};
  for (const field of fields) {
    const raw = record[field.name];
    switch (fieldInputKind(field)) {
      case 'bool':
        form[field.name] = raw === true;
        break;
      case 'json':
        form[field.name] =
          raw === undefined || raw === null || raw === '' ? '' : JSON.stringify(raw, null, 2);
        break;
      case 'date':
        // "2026-09-02 13:19:22.374Z" หรือ ISO → ตัดให้พอดี input datetime-local
        form[field.name] = typeof raw === 'string' && raw ? raw.slice(0, 16).replace(' ', 'T') : '';
        break;
      case 'multiselect':
        form[field.name] = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];
        break;
      default:
        form[field.name] = raw === undefined || raw === null ? '' : String(raw);
    }
  }
  return form;
}

/** state ของฟอร์ม → payload ที่ส่งให้ PocketBase (แปลงชนิด + parse JSON) */
export function formToPayload(form: FormState, fields: PbField[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const value = form[field.name];
    switch (fieldInputKind(field)) {
      case 'number':
        payload[field.name] = value === '' || value === undefined ? null : Number(value);
        break;
      case 'bool':
        payload[field.name] = value === true;
        break;
      case 'json': {
        const text = typeof value === 'string' ? value.trim() : '';
        if (!text) {
          payload[field.name] = null;
          break;
        }
        try {
          payload[field.name] = JSON.parse(text);
        } catch {
          throw new Error(`ฟิลด์ "${field.name}": JSON ไม่ถูกต้อง`);
        }
        break;
      }
      case 'date':
        payload[field.name] = value ? new Date(String(value)).toISOString() : '';
        break;
      case 'multiselect':
        payload[field.name] = Array.isArray(value) ? value : [];
        break;
      default:
        payload[field.name] = value ?? '';
    }
  }
  return payload;
}

/** มีไฟล์รออัปโหลดไหม — ถ้ามีต้องส่งเป็น FormData ไม่ใช่ JSON */
export function hasPendingFiles(pending: Record<string, File | File[] | null>): boolean {
  return Object.values(pending).some((v) => (Array.isArray(v) ? v.length > 0 : v != null));
}

/** รวม payload + ไฟล์เป็น FormData (ฟิลด์ JSON ต้อง stringify เองก่อนใส่ — ช่องฟอร์มเป็นข้อความล้วน) */
export function toFormData(
  payload: Record<string, unknown>,
  pending: Record<string, File | File[] | null>,
): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) fd.append(key, typeof v === 'string' ? v : JSON.stringify(v));
    } else if (typeof value === 'object') {
      fd.append(key, JSON.stringify(value));
    } else {
      fd.append(key, String(value));
    }
  }
  for (const [key, files] of Object.entries(pending)) {
    if (!files) continue;
    for (const file of Array.isArray(files) ? files : [files]) fd.append(key, file);
  }
  return fd;
}
