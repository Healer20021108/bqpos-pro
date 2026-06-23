import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 用相對路徑，部署到子路徑（如 GitHub Pages 的 /repo/）也能正常載入資源。
  base: './',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
