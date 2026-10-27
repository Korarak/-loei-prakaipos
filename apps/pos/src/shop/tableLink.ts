/**
 * ลิงก์ QR ประจำโต๊ะ — {ที่อยู่หน้าลูกค้า}/t/{รหัสร้าน}/{เลขโต๊ะ}?k={ลายเซ็น}
 *
 * ลายเซ็น = HMAC-SHA256(`${รหัสร้าน}:${เลขโต๊ะ}`, qr_secret ของร้าน) เป็น hex
 * ต้องตรงกับที่เซิร์ฟเวอร์คำนวณใน backend/pb_hooks/qr_order.pb.js ทุกตัวอักษร
 * ไม่งั้นลูกค้าสแกนแล้วเจอ "ลิงก์ไม่ถูกต้อง"
 */

export async function signTable(shopCode: string, tableNo: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${shopCode}:${tableNo}`));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function tableLink(
  baseUrl: string,
  shopCode: string,
  tableNo: string,
  secret: string,
): Promise<string> {
  const base = baseUrl.trim().replace(/\/+$/, '');
  const sig = await signTable(shopCode, tableNo, secret);
  return `${base}/t/${encodeURIComponent(shopCode)}/${encodeURIComponent(tableNo)}?k=${sig}`;
}
