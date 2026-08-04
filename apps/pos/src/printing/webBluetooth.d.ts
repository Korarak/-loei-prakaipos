/**
 * ประกาศชนิดขั้นต่ำของ Web Bluetooth API เท่าที่โค้ดนี้ใช้จริง
 *
 * TypeScript lib มาตรฐานไม่มีชุดนี้ให้ (ยังไม่ใช่มาตรฐานสมบูรณ์ และมีแค่ Chromium
 * ที่รองรับ) จึงประกาศเองเฉพาะส่วนที่เรียกใช้ ไม่พยายามครอบคลุมทั้งสเปก
 */

interface BluetoothRemoteGATTCharacteristic {
  readonly properties: {
    readonly write: boolean;
    readonly writeWithoutResponse: boolean;
  };
  writeValue(value: Uint8Array): Promise<void>;
  writeValueWithoutResponse(value: Uint8Array): Promise<void>;
}

interface BluetoothRemoteGATTService {
  getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>;
}

interface BluetoothRemoteGATTServer {
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  getPrimaryServices(): Promise<BluetoothRemoteGATTService[]>;
}

interface BluetoothDevice {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
}

interface RequestDeviceOptions {
  acceptAllDevices?: boolean;
  optionalServices?: string[];
}

interface Bluetooth {
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
  /** ยังไม่ใช่มาตรฐานทุกเบราว์เซอร์ — ต้องเช็คว่ามีก่อนเรียกเสมอ */
  getDevices?: () => Promise<BluetoothDevice[]>;
}

interface Navigator {
  readonly bluetooth?: Bluetooth;
}
