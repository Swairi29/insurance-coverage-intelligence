import type { Config } from 'tailwindcss';

// Colours are defined once here (docs/frontend-plan.md §4). Components use the token names,
// never hex values. Navy (`brand`) is the product itself; indigo (`ai`) marks what the AI does.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Page background behind the white cards.
        canvas: '#f8fafc',
        ink: { DEFAULT: '#0f172a', heading: '#0f172a' },
        // #5a6b82 keeps 4.5:1 contrast on every light background used, tints included.
        muted: { DEFAULT: '#5a6b82', strong: '#475569' },
        line: '#e2e8f0',
        brand: {
          DEFAULT: '#1e3a8a',
          dark: '#172554',
          tint: '#eff6ff',
          soft: '#f5f8ff',
          border: '#dbeafe',
        },
        // The AI layer. DEFAULT is for text and filled buttons (6.3:1 with white); `bright`
        // (#6366f1, only 4.47:1) is for spinners, bars and borders, never for text.
        ai: {
          DEFAULT: '#4f46e5',
          bright: '#6366f1',
          dark: '#4338ca',
          tint: '#eef2ff',
          border: '#c7d2fe',
        },
        // Coverage status colours. Always paired with a text label, never colour alone.
        // `dot` is too light for text: only for dots, bars and card edges.
        status: {
          covered: { DEFAULT: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', dot: '#10b981' },
          conditional: { DEFAULT: '#b45309', bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b' },
          unclear: { DEFAULT: '#4b5563', bg: '#f3f4f6', border: '#d1d5db', dot: '#94a3b8' },
          excluded: { DEFAULT: '#b91c1c', bg: '#fef2f2', border: '#fecaca', dot: '#ef4444' },
          notfound: { DEFAULT: '#b91c1c', bg: '#ffffff', border: '#b91c1c', dot: '#ef4444' },
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['Manrope', '"DM Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '17px',
      },
      keyframes: {
        // Indeterminate progress bar: the API reports no progress, only the end.
        progress: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(300%)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
