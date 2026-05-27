import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.tsx'],
    pool: 'threads',
    poolOptions: {
      threads: { singleThread: true },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/shared/utils/calculations.ts',
        'src/services/agentSurfaces.ts',
        'src/services/replacementPeers.ts',
        'src/services/dividendCalendar.ts',
        'src/hooks/useWashSaleStatus.ts',
        'src/hooks/useMarginalRate.ts',
      ],
      thresholds: {
        'src/shared/utils/calculations.ts': {
          lines: 80,
          branches: 80,
          functions: 80,
          statements: 80,
        },
        'src/services/agentSurfaces.ts': {
          lines: 80,
          branches: 80,
          functions: 80,
          statements: 80,
        },
        'src/services/replacementPeers.ts': {
          lines: 80,
          branches: 80,
          functions: 80,
          statements: 80,
        },
        'src/services/dividendCalendar.ts': {
          lines: 80,
          branches: 80,
          functions: 80,
          statements: 80,
        },
        'src/hooks/useWashSaleStatus.ts': {
          lines: 80,
          branches: 75,
          functions: 80,
          statements: 80,
        },
        'src/hooks/useMarginalRate.ts': {
          lines: 80,
          branches: 75,
          functions: 80,
          statements: 80,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
});
