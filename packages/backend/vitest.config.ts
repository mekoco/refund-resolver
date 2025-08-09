import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
    testTimeout: 120000,
    hookTimeout: 120000,
    setupFiles: ['tests/setup.ts'],
    reporters: ['default'],
    pool: 'threads',
    singleThread: true,
  },
}); 