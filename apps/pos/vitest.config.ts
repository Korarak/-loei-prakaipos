import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@prakaipos/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    // fake-indexeddb ทำให้ทดสอบ Dexie ได้โดยไม่ต้องเปิดเบราว์เซอร์จริง
    include: ['src/**/*.test.ts'],
  },
});
