import type { Config } from 'tailwindcss';

// Colours are defined once here (docs/frontend-plan.md §4). Components use the token names,
// never hex values. Navy (`brand`) is the product itself; indigo (`ai`) marks what the AI does.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Page background behind the white cards; a touch cool so the aurora glows blend in.
        canvas: '#050b18',
        ink: { DEFAULT: '#e5edf9', heading: '#f8fbff' },
        // #5a6b82 keeps 4.5:1 contrast on every light background used, tints included.
        muted: { DEFAULT: '#9aabc4', strong: '#bac8dc' },
        // `strong` (slate-400) is for dashed drop-zone borders.
        line: { DEFAULT: '#263a56', strong: '#3b5272' },
        brand: {
          DEFAULT: '#2563eb',
          dark: '#1d4ed8',
          tint: '#102746',
          soft: '#0d2039',
          border: '#25466d',
          // Secondary text on a navy background (7:1).
          muted: '#cbd8ea',
        },
        // The AI layer. DEFAULT is for text and filled buttons (6.3:1 with white); `bright`
        // (#6366f1, only 4.47:1) is for spinners, bars, borders and focus rings, never text.
        ai: {
          DEFAULT: '#2563eb',
          bright: '#38bdf8',
          dark: '#1d4ed8',
          tint: '#0b263d',
          border: '#1d4b70',
        },
        // Soft glows for `.bg-aurora` (landing hero and auth pages only, never behind data).
        aurora: {
          indigo: '#0b2142',
          sky: '#0b2844',
          cyan: '#082a39',
          violet: '#171b3d',
        },
        // Coverage status colours. Always paired with a text label, never colour alone.
        // `dot` is too light for text: only for dots, bars and card edges.
        status: {
          covered: { DEFAULT: '#6ee7b7', bg: '#102a2a', border: '#1d5a4c', dot: '#34d399' },
          conditional: { DEFAULT: '#fcd34d', bg: '#302819', border: '#705522', dot: '#fbbf24' },
          unclear: { DEFAULT: '#cbd5e1', bg: '#202b3a', border: '#46566c', dot: '#94a3b8' },
          excluded: { DEFAULT: '#fda4af', bg: '#351d2a', border: '#713344', dot: '#fb7185' },
          notfound: { DEFAULT: '#fda4af', bg: '#351d2a', border: '#713344', dot: '#fb7185' },
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
        soft: '0 8px 22px -14px rgb(0 0 0 / 0.55)',
        card: '0 14px 36px -20px rgb(0 0 0 / 0.7), 0 0 0 1px rgb(56 189 248 / 0.04)',
        lift: '0 24px 54px -24px rgb(0 0 0 / 0.78), 0 0 30px -18px rgb(37 99 235 / 0.5)',
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
