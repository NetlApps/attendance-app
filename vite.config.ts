import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' позволяет размещать сборку и в корне домена, и в подпапке
// (например, на GitHub Pages), не меняя конфигурацию.
export default defineConfig({
  plugins: [react()],
  base: './',
});
