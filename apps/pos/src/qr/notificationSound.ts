/**
 * เสียงเตือนเมื่อมีออร์เดอร์ใหม่จาก QR เข้ามา
 *
 * สร้างเสียงเองผ่าน Web Audio API แทนที่จะโหลดไฟล์เสียง — ไม่ต้องมีไฟล์
 * แนบมากับแอป และเล่นได้ทันทีไม่ต้องรอโหลด สองครั้งสั้นๆ ให้ต่างจาก
 * เสียงแจ้งเตือนทั่วไปของระบบปฏิบัติการ พนักงานจะได้แยกออกว่าเป็นเสียงร้าน
 */
export function playOrderChime(): void {
  try {
    const Ctx = window.AudioContext ?? (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();

    const beep = (startAt: number, freq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + startAt);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + startAt + 0.02);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + startAt + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + startAt);
      osc.stop(ctx.currentTime + startAt + 0.2);
    };

    beep(0, 880);
    beep(0.22, 1046.5);

    // ปิด context ทิ้งหลังเล่นจบ กันสะสมค้างในหน่วยความจำถ้าเรียกบ่อยๆ
    setTimeout(() => void ctx.close(), 600);
  } catch {
    // เบราว์เซอร์บางตัวบล็อกเสียงจนกว่าจะมีการแตะหน้าจอก่อน — เงียบไว้
    // ไม่ทำให้แอปพัง พนักงานยังเห็นตัวเลขแจ้งเตือนบนหน้าจอได้อยู่ดี
  }
}
