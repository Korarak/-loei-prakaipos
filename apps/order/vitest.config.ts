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
    // ต้องมี localStorage จริงในการทดสอบตะกร้า
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
  },
});
