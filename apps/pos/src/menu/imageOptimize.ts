/**
 * ย่อและบีบอัดรูปเมนูก่อนอัปโหลดทุกครั้ง
 *
 * รูปจากกล้องมือถือมักใหญ่หลาย MB และมีด้านยาวเป็นพันพิกเซล — ใหญ่เกินความ
 * จำเป็นมาก เพราะ PocketBase สร้าง thumbnail 200x200/600x0 ให้เองอยู่แล้ว
 * (ดู backend/pb_migrations/1753900000_init_phase1.js) ตัวไฟล์ต้นทางที่อัปโหลด
 * จึงไม่จำเป็นต้องใหญ่กว่าที่จอแสดงจริง — ย่อฝั่งเครื่องก่อนช่วยทั้งอัปโหลดเร็วขึ้น
 * มากตอนเน็ตร้านไม่ดี และประหยัดพื้นที่เก็บบนเซิร์ฟเวอร์
 *
 * แปลงเป็น JPEG เสมอ (ไม่ใช้ WebP) เพราะ canvas.toBlob('image/webp') ยังไม่ชัวร์
 * ว่ารองรับครบทุก Safari ในกลุ่มอุปกรณ์เป้าหมาย (เอกสารออกแบบหัวข้อ 03/05)
 * JPEG คุณภาพ 0.82 ที่ด้านยาวไม่เกิน 1280px คมพอสำหรับรูปเมนูอาหารและเบากว่า
 * ไฟล์ต้นฉบับมาก
 *
 * ถ้าขั้นตอนไหนล้มเหลว (เบราว์เซอร์แปลก, ไฟล์ไม่ใช่รูปจริง ฯลฯ) คืนไฟล์เดิม
 * เสมอ — ย่อไม่สำเร็จไม่ควรทำให้อัปโหลดรูปไม่ได้เลย
 */

export interface ImageOptimizeOptions {
  /** ด้านยาวสุดหลังย่อ เป็นพิกเซล */
  maxDimension?: number;
  /** คุณภาพ JPEG 0-1 */
  quality?: number;
}

const DEFAULTS: Required<ImageOptimizeOptions> = { maxDimension: 1280, quality: 0.82 };

function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height };
  const scale = width > height ? max / width : max / height;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function optimizeImage(file: File, options: ImageOptimizeOptions = {}): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const { maxDimension, quality } = { ...DEFAULTS, ...options };

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDimension);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    // ไฟล์เล็กอยู่แล้ว (เช่น สติกเกอร์ไอคอน) บีบแล้วอาจใหญ่กว่าเดิม — ใช้ไฟล์เดิมดีกว่า
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.\w+$/, '') || 'menu-item';
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
