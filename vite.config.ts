import { defineConfig } from 'vitest/config';
import { qrcode } from 'vite-plugin-qrcode';

export default defineConfig({
  // 用相對路徑，部署到子路徑（如 GitHub Pages 的 /repo/）也能正常載入資源。
  base: './',
  // 啟動時在終端機印出 QR Code，手機掃碼即可開啟（需與電腦同一個 Wi-Fi）。
  plugins: [qrcode()],
  server: {
    // host: true 會額外開放區網網址（Network），讓手機可連。
    host: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
