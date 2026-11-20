/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages（プロジェクトサイト）では /<repo>/ を base にする。
// Actions からは VITE_BASE を渡す。ローカルでは相対パス './' で動作する。
export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  plugins: [react()],
  // Plotly / ExcelJS は単体で大きいため警告閾値を引き上げる（ExcelJS は動的 import で分割済み）
  build: { chunkSizeWarningLimit: 1600 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
