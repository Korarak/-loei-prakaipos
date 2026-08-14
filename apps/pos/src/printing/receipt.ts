import type { Order, PaymentMethod } from '@prakaipos/shared';
import { formatSatang } from '@prakaipos/shared';
import { CMD, concatBytes, divider, line, twoColumn, wrapText } from './escpos.js';

/** จำนวนตัวอักษรต่อบรรทัด — 32 พอดีกับกระดาษ 58mm ตัวอักษรมาตรฐาน */
export const CHARS_PER_LINE_58MM = 32;
export const CHARS_PER_LINE_80MM = 48;

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'เงินสด',
  promptpay: 'พร้อมเพย์',
};

const CHANNEL_LABEL: Record<Order['channel'], string> = {
  pos: 'หน้าร้าน',
  qr: 'ลูกค้าสั่งผ่าน QR',
};

export interface ReceiptOptions {
  /**
   * ชื่อพนักงานที่ขายให้แสดงบนใบเสร็จ — ไม่บังคับ เว้นว่างได้ (เช่น พิมพ์ซ้ำ
   * จากบิลย้อนหลังบนเครื่องที่พนักงานคนนั้นไม่เคยล็อกอิน จึงหาชื่อจากแคชไม่เจอ)
   */
  staffName?: string;
  charsPerLine?: number;
}

/**
 * แปลงบิลที่ปิดแล้วเป็นใบเสร็จ ESC/POS พร้อมพิมพ์
 *
 * จัดหน้าตามใบเสร็จร้านอาหาร/ร้านค้าทั่วไปที่คนไทยคุ้นตา: ชื่อร้านตัวโตกลางหน้า
 * หัวเรื่อง "ใบเสร็จรับเงิน" ตามด้วยบล็อกข้อมูลบิล คั่นหัว/ท้ายด้วยเส้น "="
 * ให้เด่นกว่าเส้น "-" ที่คั่นรายการย่อย
 */
export function buildOrderReceipt(
  order: Order,
  shopName: string,
  options: ReceiptOptions = {},
): Uint8Array {
  const { staffName, charsPerLine = CHARS_PER_LINE_58MM } = options;
  const parts: Uint8Array[] = [CMD.init, CMD.alignCenter, CMD.sizeDouble];

  parts.push(line(shopName));
  parts.push(CMD.sizeNormal);
  parts.push(CMD.boldOn);
  parts.push(line('ใบเสร็จรับเงิน'));
  parts.push(CMD.boldOff);
  parts.push(CMD.alignLeft);
  parts.push(divider(charsPerLine, '='));

  parts.push(line(`บิลเลขที่ ${order.orderNo}`));
  if (order.tableNo) parts.push(line(`โต๊ะ ${order.tableNo}`));
  parts.push(line(new Date(order.createdAt).toLocaleString('th-TH')));
  parts.push(line(`ช่องทาง ${CHANNEL_LABEL[order.channel]}`));
  if (staffName) parts.push(line(`พนักงาน ${staffName}`));
  parts.push(divider(charsPerLine));

  for (const l of order.lines) {
    for (const wrapped of wrapText(l.nameSnapshot, charsPerLine)) {
      parts.push(line(wrapped));
    }
    const extra = [...l.modifiers.map((m) => m.optionName), l.note].filter(Boolean).join(', ');
    if (extra) {
      for (const wrapped of wrapText(`  (${extra})`, charsPerLine)) {
        parts.push(line(wrapped));
      }
    }
    const qtyPrice = `  ${l.qty} x ${formatSatang(l.unitPrice)}`;
    const lineTotal = formatSatang(l.unitPrice * l.qty);
    parts.push(line(twoColumn(qtyPrice, lineTotal, charsPerLine)));
  }
  parts.push(divider(charsPerLine));

  parts.push(line(twoColumn('ยอดรวม', formatSatang(order.subtotal), charsPerLine)));
  if (order.discount > 0) {
    parts.push(line(twoColumn('ส่วนลด', `-${formatSatang(order.discount)}`, charsPerLine)));
  }
  parts.push(CMD.boldOn);
  parts.push(line(twoColumn('รวมทั้งสิ้น', formatSatang(order.total), charsPerLine)));
  parts.push(CMD.boldOff);
  parts.push(divider(charsPerLine, '='));

  if (order.payment) {
    parts.push(line(twoColumn('ชำระโดย', METHOD_LABEL[order.payment.method], charsPerLine)));
    if (order.payment.method === 'cash') {
      parts.push(line(twoColumn('รับเงิน', formatSatang(order.payment.amount), charsPerLine)));
      parts.push(line(twoColumn('เงินทอน', formatSatang(order.payment.change), charsPerLine)));
    }
  }

  parts.push(line());
  parts.push(CMD.alignCenter);
  parts.push(line('ขอบคุณที่ใช้บริการ'));
  parts.push(line('Powered by PrakaiPOS'));
  parts.push(line());
  parts.push(line());
  parts.push(line());
  parts.push(CMD.cutFull);

  return concatBytes(parts);
}
