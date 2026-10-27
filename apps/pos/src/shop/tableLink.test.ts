import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signTable, tableLink } from './tableLink.js';

describe('tableLink', () => {
  it('ลายเซ็นตรงกับ HMAC-SHA256 hex ของฝั่งเซิร์ฟเวอร์', async () => {
    const expected = createHmac('sha256', 'secret-abc').update('krua-nong:7').digest('hex');
    expect(await signTable('krua-nong', '7', 'secret-abc')).toBe(expected);
  });

  it('ต่อลิงก์พร้อม ?k= และตัดเครื่องหมาย / ท้ายที่อยู่', async () => {
    const sig = await signTable('krua-nong', '3', 's');
    expect(await tableLink('https://order.example.com/', 'krua-nong', '3', 's')).toBe(
      `https://order.example.com/t/krua-nong/3?k=${sig}`,
    );
  });
});
