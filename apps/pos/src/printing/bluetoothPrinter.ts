import { getSetting, setSetting } from '../db/db.js';

/**
 * จับคู่และพิมพ์ผ่าน Web Bluetooth — รองรับเฉพาะ Chrome บน Android
 *
 * Safari (iPad) ไม่รองรับ Web Bluetooth เลยและ Apple ไม่มีแผนจะรองรับ
 * (เอกสารออกแบบหัวข้อ 03) จึงต้องเช็ค isPrinterSupported() ก่อนแสดง UI เสมอ
 * ห้ามพูดว่า "พิมพ์ได้" กับเครื่องที่ไม่รองรับ
 *
 * รายชื่อ service UUID เป็นชุดที่พบบ่อยที่สุดในเครื่องพิมพ์ Bluetooth LE ราคาถูก
 * (โมดูล HM-10/ISSC ที่ผู้ผลิตนิยมใช้) — **ยังไม่ได้ทดสอบกับเครื่องจริง**
 * ต้องซื้อเครื่องพิมพ์ 58/80mm มาลองตามแผนหัวข้อ 05 แล้วปรับรายชื่อนี้ให้ตรง
 * ถ้าเครื่องที่ซื้อมาใช้ service คนละตัว
 */
const KNOWN_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];

const KEY_PRINTER = 'printer.pairing';

export interface PrinterPairing {
  deviceId: string;
  deviceName: string;
}

export function isPrinterSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

export async function getPrinterPairing(): Promise<PrinterPairing | null> {
  return getSetting<PrinterPairing | null>(KEY_PRINTER, null);
}

async function savePrinterPairing(pairing: PrinterPairing): Promise<void> {
  await setSetting(KEY_PRINTER, pairing);
}

export async function forgetPrinter(): Promise<void> {
  await setSetting(KEY_PRINTER, null);
}

/** หาช่องทางส่งข้อมูลตัวแรกที่เขียนได้ — ไม่รู้ล่วงหน้าว่าเครื่องพิมพ์รุ่นไหนใช้ service ตัวใด */
async function findWritableCharacteristic(
  device: BluetoothDevice,
): Promise<BluetoothRemoteGATTCharacteristic | null> {
  if (!device.gatt) return null;
  const server = device.gatt.connected ? device.gatt : await device.gatt.connect();

  const services = await server.getPrimaryServices();
  for (const service of services) {
    const characteristics = await service.getCharacteristics();
    const writable = characteristics.find(
      (c) => c.properties.write || c.properties.writeWithoutResponse,
    );
    if (writable) return writable;
  }
  return null;
}

export async function pairPrinter(): Promise<PrinterPairing> {
  if (!isPrinterSupported() || !navigator.bluetooth) {
    throw new Error('อุปกรณ์นี้ไม่รองรับการเชื่อมต่อเครื่องพิมพ์ผ่าน Bluetooth (ต้องใช้ Chrome บน Android)');
  }

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: KNOWN_SERVICE_UUIDS,
  });

  const characteristic = await findWritableCharacteristic(device);
  if (!characteristic) {
    throw new Error('เชื่อมต่อเครื่องนี้ได้ แต่ไม่พบช่องทางส่งข้อมูลที่ใช้พิมพ์ได้');
  }

  const pairing: PrinterPairing = { deviceId: device.id, deviceName: device.name || 'เครื่องพิมพ์' };
  await savePrinterPairing(pairing);
  return pairing;
}

/**
 * ดึงเครื่องที่เคยจับคู่ไว้กลับมาโดยไม่ต้องเปิด dialog ใหม่
 *
 * ใช้ navigator.bluetooth.getDevices() (Chrome "persistent permissions")
 * ถ้าเบราว์เซอร์รุ่นนั้นไม่รองรับ ต้องให้ผู้ใช้กดจับคู่ใหม่เอง — Web Bluetooth
 * บังคับว่า requestDevice() ต้องมาจากการกดของผู้ใช้เท่านั้น เรียกเองจากโค้ดไม่ได้
 */
async function getPairedDevice(pairing: PrinterPairing): Promise<BluetoothDevice> {
  if (!navigator.bluetooth?.getDevices) {
    throw new Error('เบราว์เซอร์นี้จำเครื่องพิมพ์ข้ามการโหลดหน้าไม่ได้ กรุณาจับคู่เครื่องพิมพ์ใหม่');
  }
  const devices = await navigator.bluetooth.getDevices();
  const found = devices.find((d) => d.id === pairing.deviceId);
  if (!found) {
    throw new Error(`ไม่พบเครื่องพิมพ์ "${pairing.deviceName}" ที่เคยจับคู่ไว้ กรุณาจับคู่ใหม่`);
  }
  return found;
}

/** ส่งข้อมูลเป็นก้อนเล็กๆ — เครื่องพิมพ์ BLE ราคาถูกส่วนใหญ่รับข้อมูลก้อนใหญ่ทีเดียวไม่ไหว */
const CHUNK_SIZE = 100;
const CHUNK_DELAY_MS = 20;

async function writeInChunks(
  characteristic: BluetoothRemoteGATTCharacteristic,
  bytes: Uint8Array,
): Promise<void> {
  const write = characteristic.properties.writeWithoutResponse
    ? (chunk: Uint8Array) => characteristic.writeValueWithoutResponse(chunk)
    : (chunk: Uint8Array) => characteristic.writeValue(chunk);

  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    await write(bytes.slice(offset, offset + CHUNK_SIZE));
    if (offset + CHUNK_SIZE < bytes.length) {
      await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
    }
  }
}

export async function printBytes(bytes: Uint8Array): Promise<void> {
  const pairing = await getPrinterPairing();
  if (!pairing) {
    throw new Error('ยังไม่ได้จับคู่เครื่องพิมพ์ — ไปที่ "ตั้งค่าเครื่องพิมพ์" ก่อน');
  }

  const device = await getPairedDevice(pairing);
  const characteristic = await findWritableCharacteristic(device);
  if (!characteristic) {
    throw new Error('เชื่อมต่อเครื่องพิมพ์ไม่สำเร็จ ลองปิดเปิดเครื่องพิมพ์แล้วลองใหม่');
  }

  await writeInChunks(characteristic, bytes);
}
