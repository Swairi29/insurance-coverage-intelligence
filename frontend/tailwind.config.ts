import type { Config } from 'tailwindcss';

// Colours are defined once here (docs/frontend-plan.md §4). Components use the token names,
// never hex values. Navy (`brand`) is the product itself; indigo (`ai`) marks what the AI does.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Page background behind the white cards; a touch cool so the aurora glows blend in.
        canvas: '#f6f8fc',
        ink: { DEFAULT: '#0f172a', heading: '#0f172a' },
        // #5a6b82 keeps 4.5:1 contrast on every light background used, tints included.
        muted: { DEFAULT: '#5a6b82', strong: '#475569' },
        // `strong` (slate-400) is for dashed drop-zone borders.
        line: { DEFAULT: '#e2e8f0', strong: '#94a3b8' },
        brand: {
          DEFAULT: '#1e3a8a',
          dark: '#172554',
          tint: '#eff6ff',
          soft: '#f5f8ff',
          border: '#dbeafe',
          // Secondary text on a navy background (7:1).
          muted: '#cbd5e1',
        },
        // The AI layer. DEFAULT is for text and filled buttons (6.3:1 with white); `bright`
        // (#6366f1, only 4.47:1) is for spinners, bars, borders and focus rings, never text.
        ai: {
          DEFAULT: '#4f46e5',
          bright: '#6366f1',
          dark: '#4338ca',
          tint: '#eef2ff',
          border: '#c7d2fe',
        },
        // Soft glows for `.bg-aurora` (landing hero and auth pages only, never behind data).
        aurora: {
          indigo: '#e0e7ff',
          sky: '#dbeafe',
          cyan: '#e0f2fe',
          violet: '#ede9fe',
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
      // Type scale: hero, page title, section, body, meta.
      fontSize: {
        display: ['3.5rem', { lineHeight: '3.75rem', letterSpacing: '-0.02em' }],
        title: ['2.25rem', { lineHeight: '2.75rem', letterSpacing: '-0.01em' }],
        section: ['1.5rem', { lineHeight: '2rem' }],
        body: ['1rem', { lineHeight: '1.625rem' }],
        meta: ['0.8125rem', { lineHeight: '1.25rem' }],
      },
      borderRadius: {
        card: '20px',
        panel: '14px',
        control: '10px',
        pill: '999px',
      },
      boxShadow: {
        soft: '0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)',
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px -8px rgb(15 23 42 / 0.10)',
        lift: '0 2px 4px rgb(15 23 42 / 0.04), 0 20px 48px -16px rgb(30 58 138 / 0.22)',
      },
      keyframes: {
        // Indeterminate progress bar: used where the API reports no progress.
        progress: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(300%)' },
        },
        // The agent that is working right now.
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgb(99 102 241 / 0.45)' },
          '70%': { boxShadow: '0 0 0 10px rgb(99 102 241 / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(99 102 241 / 0)' },
        },
        // One reveal on the landing hero.
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.8s ease-out infinite',
        'fade-up': 'fade-up 0.6s ease-out both',
      },
    },
  },
  plugins: [],
} satisfies Config;
