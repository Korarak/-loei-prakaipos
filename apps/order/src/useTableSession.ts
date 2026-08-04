import { useEffect, useState } from 'react';
import { pb } from './pb.js';

/**
 * ยืนยันลิงก์โต๊ะกับเซิร์ฟเวอร์ แล้วได้รอบนั่งกลับมา
 *
 * เรียกเส้นทางนี้ก่อนเสมอ ก่อนจะแสดงเมนูหรือให้สั่งอะไรได้ทั้งนั้น
 * เพราะลายเซ็นในลิงก์ (`?k=...`) คือสิ่งเดียวที่กันคนแกล้งสแกน URL มั่วๆ
 * เข้ามาดูเมนูหรือสั่งอาหารแทนโต๊ะอื่น (ดู backend/pb_hooks/qr_order.pb.js)
 *
 * ตั้งใจไม่แยกขั้น "ดูเมนู" ออกจาก "ยืนยันลายเซ็น" — ถ้าไม่มีลายเซ็นที่ถูกต้อง
 * ไม่ควรเห็นอะไรเลยนอกจากข้อความว่าลิงก์ผิด
 */

export interface ActiveOrderLine {
  nameSnapshot: string;
  qty: number;
  note: string;
  unitPrice: number;
}

export interface ActiveOrder {
  orderNo: number;
  status: 'pending' | 'open';
  lines: ActiveOrderLine[];
  total: number;
}

export interface TableSession {
  sessionId: string;
  shopId: string;
  shopName: string;
  tableNo: string;
  qrOrderMode: 'auto' | 'staff_confirm';
  /** ออร์เดอร์ที่ยังไม่จบของรอบนั่งนี้ ณ ตอนโหลดหน้า — กันลูกค้ารีเฟรชแล้วมองไม่เห็นว่าสั่งไปแล้ว */
  activeOrders: ActiveOrder[];
}

export interface TableSessionState {
  loading: boolean;
  session: TableSession | null;
  /** ข้อความที่แสดงให้ลูกค้าเห็นได้ตรงๆ — ไม่มีรายละเอียดทางเทคนิค */
  error: string | null;
}

export function useTableSession(
  shopCode: string,
  tableNo: string,
  signature: string | null,
): TableSessionState {
  const [state, setState] = useState<TableSessionState>({
    loading: true,
    session: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();

    async function load() {
      if (!signature) {
        setState({
          loading: false,
          session: null,
          error: 'ลิงก์นี้ไม่สมบูรณ์ กรุณาสแกน QR ที่โต๊ะอีกครั้ง',
        });
        return;
      }

      try {
        const res = await fetch(
          `${pb.baseURL}/api/public/table-session/${encodeURIComponent(shopCode)}/${encodeURIComponent(tableNo)}?k=${encodeURIComponent(signature)}`,
          { signal: abort.signal },
        );

        if (cancelled) return;

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setState({
            loading: false,
            session: null,
            error:
              res.status === 404
                ? 'ไม่พบร้านนี้ กรุณาตรวจสอบลิงก์อีกครั้ง'
                : (body?.message ?? 'ลิงก์นี้ไม่ถูกต้อง กรุณาสแกน QR ที่โต๊ะอีกครั้ง'),
          });
          return;
        }

        const session = (await res.json()) as TableSession;
        setState({ loading: false, session, error: null });
      } catch {
        if (cancelled) return;
        setState({
          loading: false,
          session: null,
          error: 'เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [shopCode, tableNo, signature]);

  return state;
}
