import { defineConfig } from 'vitest/config';
import path from 'node:path';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths({ configNames: ['tsconfig.test.json'] })],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/mocks/console.ts'],
    include: ['**/*.{test,spec}.{js,ts}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    reporters: ['verbose'],
    pool: 'threads',
    poolOptions: {
      threads: { singleThread: true },
    },
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'html', 'lcov'],
      all: true,
      include: ['src/**/*.ts'],
      exclude: [
        'src/tools/**',
        'scripts/**',
        // type barrels and trivial re-exports
        'src/index.ts',
        'src/core/index.ts',
        'src/lib/index.ts',
        'src/tools/index.ts',
      ],
    },
  },
  define: {
    'import.meta.main': 'true',
  },
  resolve: {
    alias: {
      'bun:sqlite': path.resolve(process.cwd(), 'test/mocks/bun-sqlite.ts'),
    },
  },
});
