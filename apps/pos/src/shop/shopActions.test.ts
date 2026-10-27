import { describe, expect, it } from 'vitest';
import { validateShopSettings, type ShopSettingsInput } from './shopActions.js';

const base: ShopSettingsInput = {
  promptpayId: '',
  tablesEnabled: false,
  tableCount: 0,
  qrOrderMode: 'staff_confirm',
};

describe('validateShopSettings', () => {
  it('ยอมให้ว่างทั้งหมด (ร้านที่รับแต่เงินสด)', () => {
    expect(validateShopSettings(base)).toBeNull();
  });

  it('รับเบอร์มือถือ 10 หลัก', () => {
    expect(validateShopSettings({ ...base, promptpayId: '081-234-5678' })).toBeNull();
  });

  it('ปฏิเสธเลขพร้อมเพย์ที่ความยาวไม่ถูก', () => {
    expect(validateShopSettings({ ...base, promptpayId: '12345' })).toMatch(/เลขพร้อมเพย์/);
  });

  it('เปิดผังโต๊ะต้องมีจำนวนโต๊ะ', () => {
    expect(validateShopSettings({ ...base, tablesEnabled: true })).toMatch(/อย่างน้อย 1/);
    expect(validateShopSettings({ ...base, tablesEnabled: true, tableCount: 8 })).toBeNull();
  });

  it('จำกัดจำนวนโต๊ะ 0-200 และต้องเป็นจำนวนเต็ม', () => {
    expect(validateShopSettings({ ...base, tableCount: 201 })).toMatch(/0-200/);
    expect(validateShopSettings({ ...base, tableCount: -1 })).toMatch(/0-200/);
    expect(validateShopSettings({ ...base, tableCount: 2.5 })).toMatch(/0-200/);
  });
});
