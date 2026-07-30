import { describe, expect, it } from 'vitest';
import {
  buildPromptPayPayload,
  crc16ccitt,
  normalizePromptPayId,
} from './promptpay.js';

/**
 * ตัวถอด TLV แยกอิสระจากตัวสร้าง — จงใจเขียนใหม่ไม่ใช้โค้ดร่วมกัน
 * เพื่อให้ทดสอบได้จริงว่า payload ที่สร้างออกมาถอดกลับได้ถูกต้อง
 * ถ้าใช้โค้ดร่วมกัน บั๊กที่สมมาตรจะรอดการทดสอบไปทั้งคู่
 */
function decodeTlv(payload: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  while (i < payload.length) {
    const tag = payload.slice(i, i + 2);
    const len = Number.parseInt(payload.slice(i + 2, i + 4), 10);
    if (Number.isNaN(len)) throw new Error(`ความยาวไม่ถูกต้องที่ตำแหน่ง ${i + 2}`);
    out.set(tag, payload.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return out;
}

describe('crc16ccitt', () => {
  it('ตรงกับ check value มาตรฐานของ CRC-16/CCITT-FALSE', () => {
    // ค่านี้เป็น check value ที่นิยามไว้ในแคตตาล็อก CRC สำหรับสตริง "123456789"
    // ถ้าตรง แปลว่าเลือก poly/init/reflect/xorout ถูกทั้งชุด
    expect(crc16ccitt('123456789')).toBe(0x29b1);
  });

  it('คืน 0xFFFF สำหรับสตริงว่าง (ค่า init)', () => {
    expect(crc16ccitt('')).toBe(0xffff);
  });
});

describe('normalizePromptPayId', () => {
  it('แปลงเบอร์มือถือ 10 หลักเป็นรูปแบบ 0066xxxxxxxxx', () => {
    expect(normalizePromptPayId('0812345678')).toEqual({
      kind: 'mobile',
      value: '0066812345678',
    });
  });

  it('ยอมรับเบอร์ที่มีขีดคั่นและเว้นวรรค', () => {
    expect(normalizePromptPayId('081-234-5678').value).toBe('0066812345678');
    expect(normalizePromptPayId('081 234 5678').value).toBe('0066812345678');
  });

  it('ยอมรับเบอร์ที่ใส่รหัสประเทศมาแล้ว', () => {
    expect(normalizePromptPayId('66812345678').value).toBe('0066812345678');
  });

  it('รับเลขบัตรประชาชน/ผู้เสียภาษี 13 หลัก', () => {
    expect(normalizePromptPayId('1234567890123')).toEqual({
      kind: 'national_id',
      value: '1234567890123',
    });
  });

  it('รับ e-Wallet 15 หลัก', () => {
    expect(normalizePromptPayId('123456789012345').kind).toBe('ewallet');
  });

  it('โยน error เมื่อความยาวไม่เข้าเงื่อนไข แทนที่จะสร้าง QR ที่เงินไปผิดที่', () => {
    expect(() => normalizePromptPayId('12345')).toThrow();
    expect(() => normalizePromptPayId('')).toThrow();
  });
});

describe('buildPromptPayPayload', () => {
  it('สร้าง QR แบบไม่ระบุยอด (ใช้ซ้ำได้)', () => {
    const payload = buildPromptPayPayload({ promptpayId: '0812345678' });
    const fields = decodeTlv(payload);

    expect(fields.get('00')).toBe('01');
    expect(fields.get('01')).toBe('11'); // static — ลูกค้ากรอกยอดเอง
    expect(fields.get('58')).toBe('TH');
    expect(fields.get('53')).toBe('764');
    expect(fields.has('54')).toBe(false);

    const merchant = decodeTlv(fields.get('29') ?? '');
    expect(merchant.get('00')).toBe('A000000677010111');
    expect(merchant.get('01')).toBe('0066812345678');
  });

  it('สร้าง QR แบบระบุยอด และแปลงสตางค์เป็นบาททศนิยม 2 ตำแหน่ง', () => {
    const payload = buildPromptPayPayload({ promptpayId: '0812345678', amount: 12050 });
    const fields = decodeTlv(payload);

    expect(fields.get('01')).toBe('12'); // dynamic — ลูกค้าแก้ยอดไม่ได้
    expect(fields.get('54')).toBe('120.50');
  });

  it('ยอดที่ลงท้ายด้วย 0 สตางค์ยังคงมีทศนิยม 2 ตำแหน่ง', () => {
    const fields = decodeTlv(
      buildPromptPayPayload({ promptpayId: '0812345678', amount: 10000 }),
    );
    expect(fields.get('54')).toBe('100.00');
  });

  it('CRC ท้าย payload ตรวจสอบผ่าน', () => {
    const payload = buildPromptPayPayload({ promptpayId: '0812345678', amount: 12050 });

    // สเปกกำหนดให้ CRC ครอบทุกอย่าง "รวม" หัว "6304" ของตัวมันเอง
    const body = payload.slice(0, -4);
    const stated = payload.slice(-4);

    expect(body.endsWith('6304')).toBe(true);
    expect(stated).toBe(crc16ccitt(body).toString(16).toUpperCase().padStart(4, '0'));
    expect(stated).toMatch(/^[0-9A-F]{4}$/);
  });

  it('ใช้แท็ก 02 สำหรับเลขผู้เสียภาษี ไม่ใช่แท็ก 01', () => {
    const fields = decodeTlv(buildPromptPayPayload({ promptpayId: '1234567890123' }));
    const merchant = decodeTlv(fields.get('29') ?? '');

    expect(merchant.get('02')).toBe('1234567890123');
    expect(merchant.has('01')).toBe(false);
  });

  it('ปฏิเสธยอดเงินที่ไม่ใช่จำนวนเต็มสตางค์ หรือไม่เป็นบวก', () => {
    expect(() =>
      buildPromptPayPayload({ promptpayId: '0812345678', amount: 120.5 }),
    ).toThrow();
    expect(() =>
      buildPromptPayPayload({ promptpayId: '0812345678', amount: 0 }),
    ).toThrow();
    expect(() =>
      buildPromptPayPayload({ promptpayId: '0812345678', amount: -100 }),
    ).toThrow();
  });

  it('payload ถอด TLV ได้ครบไม่มีไบต์เหลือ', () => {
    const payload = buildPromptPayPayload({ promptpayId: '0812345678', amount: 999900 });
    // ถ้า length field ผิดแม้แต่ตัวเดียว decodeTlv จะไถลและอ่านแท็กเพี้ยน
    const fields = decodeTlv(payload);
    expect([...fields.keys()]).toEqual(['00', '01', '29', '58', '53', '54', '63']);
  });
});
