import { describe, expect, it } from 'vitest';
import { _internal } from './sender.js';

const { isDuplicate, isRetryable, describe: describeError } = _internal;

/**
 * การแปลผล error คือจุดที่พลาดแล้วเสียหายเงียบๆ
 * แปลผิดทางหนึ่ง = คิวตันทั้งที่ควรผ่านไปได้
 * แปลผิดอีกทาง = ข้อมูลถูกทิ้งทั้งที่ยังไม่ถึงเซิร์ฟเวอร์
 */

describe('isDuplicate', () => {
  it('จับ error unique constraint ของ client_uuid ได้', () => {
    expect(
      isDuplicate({
        status: 400,
        response: {
          data: {
            client_uuid: { code: 'validation_not_unique', message: 'ค่าซ้ำ' },
          },
        },
      }),
    ).toBe(true);
  });

  it('ไม่นับ error ตรวจสอบข้อมูลแบบอื่นว่าเป็นการซ้ำ', () => {
    expect(
      isDuplicate({
        status: 400,
        response: {
          data: { total: { code: 'validation_required', message: 'ต้องระบุ' } },
        },
      }),
    ).toBe(false);
  });

  it('ไม่นับ error ที่ไม่ใช่ 400', () => {
    expect(isDuplicate({ status: 500 })).toBe(false);
    expect(isDuplicate({})).toBe(false);
  });
});

describe('isRetryable', () => {
  it('เน็ตหลุด (ไม่มี status) ลองใหม่ได้', () => {
    expect(isRetryable({})).toBe(true);
    expect(isRetryable({ status: 0 })).toBe(true);
  });

  it('เซิร์ฟเวอร์มีปัญหา (5xx) ลองใหม่ได้', () => {
    expect(isRetryable({ status: 500 })).toBe(true);
    expect(isRetryable({ status: 502 })).toBe(true);
    expect(isRetryable({ status: 503 })).toBe(true);
  });

  it('ยิงถี่เกิน (429) ลองใหม่ได้ — backoff จะช่วยเอง', () => {
    expect(isRetryable({ status: 429 })).toBe(true);
  });

  it('ข้อมูลผิดหรือสิทธิ์ไม่พอ ลองใหม่ก็ไม่หาย', () => {
    expect(isRetryable({ status: 400 })).toBe(false);
    expect(isRetryable({ status: 401 })).toBe(false);
    expect(isRetryable({ status: 403 })).toBe(false);
    expect(isRetryable({ status: 404 })).toBe(false);
  });
});

describe('describe', () => {
  it('รวมรายละเอียดรายฟิลด์เข้ากับข้อความหลัก เพื่อให้ debug ที่หน้าร้านได้', () => {
    const msg = describeError({
      status: 400,
      message: 'ข้อมูลไม่ผ่านการตรวจสอบ',
      response: {
        data: { order_no: { code: 'validation_required', message: 'ต้องระบุเลขบิล' } },
      },
    });

    expect(msg).toContain('ข้อมูลไม่ผ่านการตรวจสอบ');
    expect(msg).toContain('order_no');
    expect(msg).toContain('ต้องระบุเลขบิล');
  });

  it('ไม่พังเมื่อ error ไม่มีรายละเอียด', () => {
    expect(describeError({})).toBe('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ');
    expect(describeError({ message: 'เน็ตหลุด' })).toBe('เน็ตหลุด');
  });
});
