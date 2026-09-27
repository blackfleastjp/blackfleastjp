import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#192521',
        moss: '#315b47',
        paper: '#f5f6f1',
        signal: '#d2ec62',
      },
    },
  },
  plugins: [],
} satisfies Config;
