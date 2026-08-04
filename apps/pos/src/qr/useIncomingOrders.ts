import type { Satang, SelectedModifier } from '@prakaipos/shared';
import { useEffect, useRef, useState } from 'react';
import { pb } from '../sync/pb.js';
import { playOrderChime } from './notificationSound.js';

/**
 * ออร์เดอร์จาก QR ที่แสดงบนแท็บเล็ต POS
 *
 * ใช้ realtime subscribe ของ PocketBase แทนการ poll เป็นระยะ เพื่อให้
 * พนักงานเห็นออร์เดอร์ใหม่ทันทีที่ลูกค้ากดสั่ง — ร้านอาหารมีหน้าต่างเวลาสั้น
 * มากระหว่าง "ลูกค้าสั่ง" กับ "ครัวต้องเริ่มทำ" ถ้าช้าไปหลายวินาทีจะกระทบจริง
 *
 * กรองด้วยรหัสร้านฝั่งไคลเอนต์อีกชั้น แม้ subscribe('*') จะถูกกฎ listRule
 * ของ collection กรองให้แล้วในระดับเซิร์ฟเวอร์ก็ตาม — กันพลาดถ้าพฤติกรรม
 * ของ realtime engine เปลี่ยนไปในเวอร์ชันถัดๆ ไป
 */

interface OrderLineRecord {
  menuItemId: string;
  clientUuid: string;
  nameSnapshot: string;
  qty: number;
  note: string;
  unitPrice: Satang;
  orderedBy: string;
  /** ว่างได้ — บิลเก่าก่อนมีตัวเลือกไม่มีฟิลด์นี้ */
  modifiers?: SelectedModifier[];
}

export interface IncomingOrder {
  id: string;
  orderNo: number;
  tableNo: string;
  tableSessionId: string;
  lines: OrderLineRecord[];
  total: Satang;
  status: 'pending' | 'open';
  createdAt: string;
}

interface OrderRecord {
  id: string;
  shop: string;
  channel: string;
  status: string;
  order_no: number;
  table_no: string;
  table_session: string;
  lines: OrderLineRecord[];
  total: number;
  created: string;
}

function toIncoming(r: OrderRecord): IncomingOrder {
  return {
    id: r.id,
    orderNo: r.order_no,
    tableNo: r.table_no,
    tableSessionId: r.table_session,
    lines: r.lines,
    total: r.total,
    status: r.status as 'pending' | 'open',
    createdAt: r.created,
  };
}

export interface IncomingOrdersState {
  /** รอพนักงานยืนยัน (โหมด staff_confirm) — ต้องกดยืนยันหรือปฏิเสธ */
  pending: IncomingOrder[];
  /** เข้าระบบแล้ว (ยืนยันแล้ว หรือโหมด auto) — ไว้ให้ครัวเห็น ไม่ต้องกดอะไร */
  open: IncomingOrder[];
  confirm: (id: string) => Promise<void>;
  reject: (id: string) => Promise<void>;
}

export function useIncomingOrders(shopId: string): IncomingOrdersState {
  const [orders, setOrders] = useState<Map<string, IncomingOrder>>(new Map());
  // เก็บ id ที่เคยเห็นแล้วไว้ กันเล่นเสียงซ้ำตอนโหลดรายการครั้งแรก
  // (ควรเล่นเสียงเฉพาะออร์เดอร์ที่เพิ่งเข้ามาใหม่จริงๆ ระหว่างเปิดหน้าจอค้างไว้)
  const knownIds = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  useEffect(() => {
    if (!shopId) return;
    let cancelled = false;
    knownIds.current = new Set();
    firstLoad.current = true;

    async function loadInitial() {
      const records = await pb.collection('orders').getFullList<OrderRecord>({
        filter: `shop="${shopId}" && channel="qr" && (status="pending" || status="open")`,
        sort: 'created',
      });
      if (cancelled) return;

      const map = new Map<string, IncomingOrder>();
      for (const r of records) {
        map.set(r.id, toIncoming(r));
        knownIds.current.add(r.id);
      }
      setOrders(map);
      firstLoad.current = false;
    }

    void loadInitial();

    const unsubscribe = pb.collection('orders').subscribe<OrderRecord>('*', (e) => {
      if (e.record.shop !== shopId || e.record.channel !== 'qr') return;

      setOrders((prev) => {
        const next = new Map(prev);

        if (e.action === 'delete' || e.record.status === 'void' || e.record.status === 'paid') {
          // ปิดจบไปแล้ว (ยกเลิก/ปิดบิลแล้ว) ไม่ต้องค้างอยู่ในรายการเตือน
          next.delete(e.record.id);
          return next;
        }

        if (e.record.status !== 'pending' && e.record.status !== 'open') return next;

        const isNew = !knownIds.current.has(e.record.id);
        knownIds.current.add(e.record.id);

        // เล่นเสียงเฉพาะออร์เดอร์ใหม่จริงๆ ที่เข้ามาระหว่างเปิดหน้าจอค้างไว้
        // ไม่ใช่ตอนโหลดรายการเดิมครั้งแรก มิฉะนั้นเปิดแอปมาแล้วมี 5 ออร์เดอร์
        // ค้างอยู่จะเล่นเสียงรัว 5 ครั้งทันที ซึ่งน่ารำคาญกว่าจะมีประโยชน์
        if (isNew && !firstLoad.current && e.record.status === 'pending') {
          playOrderChime();
        }

        next.set(e.record.id, toIncoming(e.record));
        return next;
      });
    });

    return () => {
      cancelled = true;
      void unsubscribe.then((fn) => fn());
    };
  }, [shopId]);

  const list = [...orders.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    pending: list.filter((o) => o.status === 'pending'),
    open: list.filter((o) => o.status === 'open'),
    async confirm(id) {
      await pb.collection('orders').update(id, { status: 'open' });
    },
    async reject(id) {
      await pb.collection('orders').update(id, { status: 'void' });
    },
  };
}
