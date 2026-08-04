import type { Satang } from './types.js';
import type { SelectedModifier } from './types.js';

/**
 * ตรรกะร่วมของตัวเลือก/ท็อปปิ้ง ใช้ทั้งฝั่ง POS และฝั่งลูกค้า (QR Order)
 * เพื่อให้คิดราคาและตัดสินว่า "เลือกเหมือนกันหรือไม่" ตรงกันทั้งสองที่
 */

export function sumModifierDeltas(modifiers: readonly SelectedModifier[]): Satang {
  return modifiers.reduce((sum, m) => sum + m.priceDelta, 0);
}

/** ลายเซ็นของตัวเลือกที่เลือกไว้ ไม่สนลำดับ — ใช้เทียบว่าสองบรรทัดเลือกเหมือนกันหรือไม่ */
export function modifiersKey(modifiers: readonly SelectedModifier[]): string {
  return modifiers
    .map((m) => `${m.groupName}:${m.optionName}`)
    .sort()
    .join('|');
}
