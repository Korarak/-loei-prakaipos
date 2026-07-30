/**
 * สร้าง payload พร้อมเพย์ตามมาตรฐาน EMVCo — Merchant-Presented Mode
 *
 * ทำงานในเครื่องทั้งหมด ไม่เรียก API ธนาคาร จึง **สร้าง QR ได้ตอนเน็ตหลุด**
 * ซึ่งเป็นเหตุผลหลักที่เลือกวิธีนี้ (ดูหัวข้อ 04 ของเอกสารออกแบบ)
 *
 * ข้อควรรู้: payload นี้บอกแค่ "ให้โอนเข้าบัญชีไหน เท่าไร" เท่านั้น
 * ระบบเรา **ไม่เคยถือเงินของร้าน** เงินเข้าบัญชีร้านตรง — เลี่ยงการเข้าข่าย
 * ต้องขอใบอนุญาต e-Money จาก ธปท. (ดูหัวข้อ 12)
 */

import type { Satang } from './types.js';

const AID_PROMPTPAY = 'A000000677010111';

const TAG_PAYLOAD_FORMAT = '00';
const TAG_POI_METHOD = '01';
const TAG_MERCHANT_PROMPTPAY = '29';
const TAG_CURRENCY = '53';
const TAG_AMOUNT = '54';
const TAG_COUNTRY = '58';
const TAG_CRC = '63';

const SUBTAG_AID = '00';
const SUBTAG_MOBILE = '01';
const SUBTAG_NATIONAL_ID = '02';
const SUBTAG_EWALLET = '03';

const CURRENCY_THB = '764';
const COUNTRY_TH = 'TH';

/** QR ใช้ซ้ำได้ ไม่ระบุยอด */
const POI_STATIC = '11';
/** QR ครั้งเดียว ระบุยอดชัดเจน — ลูกค้าแก้ยอดไม่ได้ */
const POI_DYNAMIC = '12';

export type PromptPayTargetKind = 'mobile' | 'national_id' | 'ewallet';

export interface PromptPayTarget {
  kind: PromptPayTargetKind;
  /** ค่าที่ normalize แล้ว พร้อมใส่ลง payload */
  value: string;
}

/**
 * เข้ารหัสหนึ่งฟิลด์แบบ TLV: tag(2) + length(2) + value
 * ความยาวเป็นเลขฐานสิบสองหลัก เช่น "0012"
 */
function tlv(tag: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${tag}${len}${value}`;
}

/**
 * CRC-16/CCITT-FALSE — poly 0x1021, init 0xFFFF, ไม่กลับบิต, ไม่ XOR ตอนจบ
 * มาตรฐาน EMVCo บังคับใช้ตัวนี้ ใช้ตัวแปรอื่นของ CRC-16 แล้วแอปธนาคารจะอ่านไม่ผ่าน
 */
export function crc16ccitt(input: string): number {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/**
 * แปลงเลขที่ผู้ใช้กรอกให้อยู่ในรูปแบบที่มาตรฐานต้องการ
 *
 * - เบอร์มือถือ 10 หลัก → "0066" + เบอร์ที่ตัด 0 นำหน้าออก (รวม 13 ตัว)
 *   เช่น 081-234-5678 → "0066812345678"
 * - เลขบัตรประชาชน / เลขผู้เสียภาษี 13 หลัก → ใช้ตามเดิม
 * - e-Wallet 15 หลัก → ใช้ตามเดิม
 *
 * โยน error ถ้ารูปแบบไม่เข้าเงื่อนไข — ดีกว่าปล่อยให้สร้าง QR ที่สแกนแล้วเงินไปผิดที่
 */
export function normalizePromptPayId(raw: string): PromptPayTarget {
  const digits = raw.replace(/\D/g, '');

  if (digits.length === 10 && digits.startsWith('0')) {
    return { kind: 'mobile', value: `0066${digits.slice(1)}` };
  }
  // เบอร์ที่กรอกมาพร้อมรหัสประเทศแล้ว เช่น 66812345678
  if (digits.length === 11 && digits.startsWith('66')) {
    return { kind: 'mobile', value: `00${digits}` };
  }
  if (digits.length === 13) {
    return { kind: 'national_id', value: digits };
  }
  if (digits.length === 15) {
    return { kind: 'ewallet', value: digits };
  }

  throw new Error(
    `เลขพร้อมเพย์ไม่ถูกต้อง: "${raw}" — ต้องเป็นเบอร์มือถือ 10 หลัก, ` +
      `เลขบัตรประชาชน/ผู้เสียภาษี 13 หลัก, หรือ e-Wallet 15 หลัก`,
  );
}

function subtagFor(kind: PromptPayTargetKind): string {
  switch (kind) {
    case 'mobile':
      return SUBTAG_MOBILE;
    case 'national_id':
      return SUBTAG_NATIONAL_ID;
    case 'ewallet':
      return SUBTAG_EWALLET;
  }
}

export interface PromptPayPayloadOptions {
  /** เลขพร้อมเพย์ของร้าน — กรอกมาดิบๆ ได้ ระบบ normalize ให้ */
  promptpayId: string;
  /**
   * ยอดเงินหน่วยสตางค์
   * ใส่ = QR ครั้งเดียวระบุยอด (ลูกค้าแก้ยอดไม่ได้)
   * ไม่ใส่ = QR ใช้ซ้ำได้ ลูกค้ากรอกยอดเอง
   */
  amount?: Satang;
}

/**
 * คืนสตริงที่เอาไปเข้ารหัสเป็นภาพ QR ได้ตรงๆ
 *
 * @example
 * buildPromptPayPayload({ promptpayId: '0812345678', amount: 12050 })
 */
export function buildPromptPayPayload(options: PromptPayPayloadOptions): string {
  const { promptpayId, amount } = options;
  const target = normalizePromptPayId(promptpayId);

  if (amount !== undefined) {
    if (!Number.isInteger(amount)) {
      throw new Error(`ยอดเงินต้องเป็นจำนวนเต็มหน่วยสตางค์ ได้รับ: ${amount}`);
    }
    if (amount <= 0) {
      throw new Error(`ยอดเงินต้องมากกว่า 0 ได้รับ: ${amount}`);
    }
  }

  const merchantInfo =
    tlv(SUBTAG_AID, AID_PROMPTPAY) + tlv(subtagFor(target.kind), target.value);

  // ลำดับแท็ก: 00 → 01 → 29 → 58 → 53 → 54 → 63
  // ตามสเปก EMVCo ผู้อ่านต้องแยกด้วย TLV จึงไม่ควรขึ้นกับลำดับ
  // แต่เรียงตามนี้เพราะเป็นลำดับเดียวกับ QR ที่ธนาคารไทยออกจริงและที่ไลบรารี
  // พร้อมเพย์ที่ใช้กันแพร่หลายสร้าง — ไม่มีเหตุให้เสี่ยงเจอแอปที่อ่านตามลำดับ
  let payload =
    tlv(TAG_PAYLOAD_FORMAT, '01') +
    tlv(TAG_POI_METHOD, amount === undefined ? POI_STATIC : POI_DYNAMIC) +
    tlv(TAG_MERCHANT_PROMPTPAY, merchantInfo) +
    tlv(TAG_COUNTRY, COUNTRY_TH) +
    tlv(TAG_CURRENCY, CURRENCY_THB);

  if (amount !== undefined) {
    // มาตรฐานกำหนดให้เป็นทศนิยม 2 ตำแหน่ง เช่น 12050 สตางค์ → "120.50"
    payload += tlv(TAG_AMOUNT, (amount / 100).toFixed(2));
  }

  // CRC คำนวณครอบสตริงทั้งหมด "รวม" หัว "6304" ของตัวมันเองด้วย
  const withCrcHeader = `${payload}${TAG_CRC}04`;
  const checksum = crc16ccitt(withCrcHeader).toString(16).toUpperCase().padStart(4, '0');

  return `${withCrcHeader}${checksum}`;
}
