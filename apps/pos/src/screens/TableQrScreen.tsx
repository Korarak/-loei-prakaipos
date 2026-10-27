import { Printer } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { getSetting, setSetting } from '../db/db.js';
import type { ShopSettings } from '../shop/shopSettings.js';
import { tableLink } from '../shop/tableLink.js';
import { pb } from '../sync/pb.js';

/**
 * QR สั่งอาหารประจำโต๊ะ — สร้างในเครื่องและพิมพ์เป็นป้ายโต๊ะละใบ
 *
 * ลิงก์คือ {ที่อยู่หน้าลูกค้า}/t/{รหัสร้าน}/{เลขโต๊ะ}?k={ลายเซ็น} (ดู shop/tableLink.ts)
 * ลายเซ็นต้องใช้กุญแจลับของร้าน (qr_secret) จึงดึงมาตอนเปิดหน้านี้เท่านั้น
 * ไม่เก็บลงแคชในเครื่อง และเปิดหน้านี้ต้องมีเน็ต
 *
 * ที่อยู่หน้าลูกค้าเป็นคนละโดเมน/พอร์ตกับแอป POS จึงให้แก้ได้และจำไว้ในเครื่อง
 * ค่าเริ่มต้นมาจาก VITE_ORDER_URL ถ้าไม่ตั้งจะเดาเป็นโฮสต์เดียวกันพอร์ต 5184 (โหมด dev)
 */

const KEY_ORDER_URL = 'shop.orderBaseUrl';

function defaultOrderUrl(): string {
  const fromEnv = import.meta.env.VITE_ORDER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  return `${window.location.protocol}//${window.location.hostname}:5184`;
}

export function TableQrScreen({ shop }: { shop: ShopSettings | null }) {
  const [baseUrl, setBaseUrl] = useState(defaultOrderUrl());
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [sampleLink, setSampleLink] = useState('');

  useEffect(() => {
    void getSetting<string>(KEY_ORDER_URL, '').then((v) => {
      if (v) setBaseUrl(v);
    });
  }, []);

  const shopId = shop?.id;
  useEffect(() => {
    if (!shopId) return;
    if (!navigator.onLine) {
      setError('การสร้าง QR ต้องต่ออินเทอร์เน็ตก่อน');
      return;
    }
    pb.collection('shops')
      .getOne<{ qr_secret: string }>(shopId)
      .then((r) => {
        if (r.qr_secret) setSecret(r.qr_secret);
        else setError('ร้านนี้ยังไม่มีกุญแจ QR กรุณาติดต่อทีมงาน');
      })
      .catch(() => setError('ดึงข้อมูลสำหรับสร้าง QR ไม่สำเร็จ ลองใหม่อีกครั้ง'));
  }, [shopId]);

  const count = shop?.tableCount ?? 0;
  const code = shop?.code ?? '';
  const tables = Array.from({ length: count }, (_, i) => String(i + 1));

  useEffect(() => {
    if (!code || count === 0 || !secret) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        Array.from({ length: count }, (_, i) => String(i + 1)).map(async (t) => {
          const link = await tableLink(baseUrl, code, t, secret);
          return [t, link, await QRCode.toDataURL(link, { width: 360, margin: 1 })] as const;
        }),
      );
      if (cancelled) return;
      setImages(Object.fromEntries(entries.map(([t, , img]) => [t, img])));
      setSampleLink(entries[0]?.[1] ?? '');
    })();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, code, count, secret]);

  if (!shop || count === 0) {
    return (
      <div className="panel">
        <h1>ยังไม่ได้ตั้งจำนวนโต๊ะ</h1>
        <p className="muted">ไปที่ ตั้งค่าร้าน เพื่อใส่จำนวนโต๊ะก่อน แล้วกลับมาพิมพ์ QR</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel">
        <h1>สร้าง QR ไม่ได้</h1>
        <p className="alert">{error}</p>
      </div>
    );
  }

  return (
    <>
      <div className="panel qrsheet__controls">
        <label className="field">
          <span>ที่อยู่หน้าสั่งอาหารของลูกค้า</span>
          <input
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value);
              void setSetting(KEY_ORDER_URL, e.target.value);
            }}
            placeholder="https://order.example.com"
          />
          <small className="hint">
            ลิงก์โต๊ะ 1 (มีลายเซ็นกันคนอื่นปลอม): {sampleLink || 'กำลังสร้าง…'}
          </small>
        </label>
        <button type="button" className="btn btn--primary" onClick={() => window.print()}>
          <Printer size={16} aria-hidden="true" />
          พิมพ์ QR ทุกโต๊ะ
        </button>
      </div>

      <div className="qrsheet">
        {tables.map((t) => (
          <figure key={t} className="qrsheet__card">
            <figcaption className="qrsheet__shop">{shop.name}</figcaption>
            {images[t] ? <img src={images[t]} alt={`QR โต๊ะ ${t}`} /> : <div className="qrsheet__ph" />}
            <div className="qrsheet__table">โต๊ะ {t}</div>
            <div className="qrsheet__hint">สแกนเพื่อสั่งอาหาร</div>
          </figure>
        ))}
      </div>
    </>
  );
}
