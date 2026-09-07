import { describe, expect, it } from 'vitest';
import {
  editableFields,
  fieldInputKind,
  fileFields,
  formToPayload,
  hasPendingFiles,
  recordToForm,
  toFormData,
  type PbCollection,
  type PbField,
} from './schema.js';

const f = (over: Partial<PbField>): PbField => ({ id: 'x', name: 'x', type: 'text', ...over });

describe('fieldInputKind', () => {
  it('จับคู่ชนิดฟิลด์ของ PocketBase กับช่องกรอก', () => {
    expect(fieldInputKind(f({ type: 'text' }))).toBe('text');
    expect(fieldInputKind(f({ type: 'email' }))).toBe('text');
    expect(fieldInputKind(f({ type: 'relation' }))).toBe('text');
    expect(fieldInputKind(f({ type: 'number' }))).toBe('number');
    expect(fieldInputKind(f({ type: 'bool' }))).toBe('bool');
    expect(fieldInputKind(f({ type: 'json' }))).toBe('json');
    expect(fieldInputKind(f({ type: 'date' }))).toBe('date');
    expect(fieldInputKind(f({ type: 'file' }))).toBe('file');
    expect(fieldInputKind(f({ type: 'editor' }))).toBe('editor');
    expect(fieldInputKind(f({ type: 'autodate' }))).toBe('readonly');
  });

  it('select เลือกได้ตัวเดียว = select · หลายตัว = multiselect', () => {
    expect(fieldInputKind(f({ type: 'select', options: { maxSelect: 1 } }))).toBe('select');
    expect(fieldInputKind(f({ type: 'select', options: { maxSelect: 3 } }))).toBe('multiselect');
    expect(fieldInputKind(f({ type: 'select', options: {} }))).toBe('select');
  });
});

describe('editableFields / fileFields', () => {
  const col: PbCollection = {
    id: 'c',
    name: 'menu_items',
    type: 'base',
    schema: [
      f({ name: 'name', type: 'text' }),
      f({ name: 'price', type: 'number' }),
      f({ name: 'image', type: 'file' }),
      f({ name: 'created', type: 'autodate' }),
    ],
  };

  it('ตัดไฟล์และฟิลด์ที่เซิร์ฟเวอร์จัดการเองออกจากฟอร์มหลัก', () => {
    expect(editableFields(col).map((x) => x.name)).toEqual(['name', 'price']);
    expect(fileFields(col).map((x) => x.name)).toEqual(['image']);
  });

  it('อ่าน fields ได้ถ้าเซิร์ฟเวอร์ใช้คำว่า fields แทน schema', () => {
    const newer: PbCollection = { ...col, schema: undefined, fields: col.schema };
    expect(editableFields(newer).map((x) => x.name)).toEqual(['name', 'price']);
  });
});

describe('recordToForm', () => {
  const fields = [
    f({ name: 'name', type: 'text' }),
    f({ name: 'price', type: 'number' }),
    f({ name: 'sold_out', type: 'bool' }),
    f({ name: 'recipe', type: 'json' }),
    f({ name: 'opened_at', type: 'date' }),
    f({ name: 'tags', type: 'select', options: { maxSelect: 5, values: ['a', 'b'] } }),
  ];

  it('แปลงเรกคอร์ดเป็น state ที่ผูกกับ input ได้', () => {
    const form = recordToForm(
      {
        name: 'ข้าวผัด',
        price: 6000,
        sold_out: false,
        recipe: [{ ingredientId: 'i1', qty: 2 }],
        opened_at: '2026-09-02 13:19:22.374Z',
        tags: ['a', 'b'],
      },
      fields,
    );
    expect(form.name).toBe('ข้าวผัด');
    expect(form.price).toBe('6000');
    expect(form.sold_out).toBe(false);
    expect(form.recipe).toBe('[\n  {\n    "ingredientId": "i1",\n    "qty": 2\n  }\n]');
    expect(form.opened_at).toBe('2026-09-02T13:19');
    expect(form.tags).toEqual(['a', 'b']);
  });

  it('ค่าว่าง/undefined ไม่ทำให้พัง', () => {
    const form = recordToForm({}, fields);
    expect(form.name).toBe('');
    expect(form.recipe).toBe('');
    expect(form.sold_out).toBe(false);
    expect(form.tags).toEqual([]);
  });
});

describe('formToPayload', () => {
  const fields = [
    f({ name: 'name', type: 'text' }),
    f({ name: 'price', type: 'number' }),
    f({ name: 'sold_out', type: 'bool' }),
    f({ name: 'recipe', type: 'json' }),
  ];

  it('แปลงชนิดกลับ + parse JSON', () => {
    const payload = formToPayload(
      { name: 'ก', price: '70', sold_out: true, recipe: '[{"x":1}]' },
      fields,
    );
    expect(payload).toEqual({ name: 'ก', price: 70, sold_out: true, recipe: [{ x: 1 }] });
  });

  it('ตัวเลขว่าง = null · JSON ว่าง = null', () => {
    const payload = formToPayload({ name: '', price: '', sold_out: false, recipe: '' }, fields);
    expect(payload.price).toBeNull();
    expect(payload.recipe).toBeNull();
  });

  it('JSON ผิดรูป โยน error ที่อ่านรู้เรื่อง', () => {
    expect(() => formToPayload({ recipe: '{ ไม่ใช่ json' }, [fields[3]!])).toThrow(
      'ฟิลด์ "recipe": JSON ไม่ถูกต้อง',
    );
  });
});

describe('hasPendingFiles / toFormData', () => {
  it('ตรวจว่ามีไฟล์รออัปโหลดไหม', () => {
    expect(hasPendingFiles({ image: null })).toBe(false);
    expect(hasPendingFiles({ image: [] })).toBe(false);
    expect(hasPendingFiles({ image: new File([''], 'a.jpg') })).toBe(true);
  });

  it('รวม payload + ไฟล์เป็น FormData (object → stringify)', () => {
    const fd = toFormData(
      { name: 'ก', recipe: [{ x: 1 }], skip: null },
      { image: new File(['data'], 'a.jpg') },
    );
    expect(fd.get('name')).toBe('ก');
    expect(fd.get('recipe')).toBe('{"x":1}');
    expect(fd.has('skip')).toBe(false);
    expect(fd.get('image')).toBeInstanceOf(File);
  });
});
