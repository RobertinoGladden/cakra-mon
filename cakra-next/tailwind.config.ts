import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      backgroundImage: {
        'grid-light':
          'radial-gradient(#e2e8f0 1px, transparent 1px)',
        'grid-dark':
          'radial-gradient(#27272a 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '16px 16px',
      },
      boxShadow: {
        'card-sm': '0 1px 2px 0 rgb(0 0 0 / 0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
