import type { Config } from 'tailwindcss';

/** A colour token backed by the `--color-<name>` variable (an "r g b" triplet), so opacity
 *  modifiers such as `bg-brand/50` keep working. */
const v = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`;

// Colour tokens are named here and valued in src/index.css (docs/frontend-plan.md §4).
// Components use the token names, never hex values. `brand` is the product itself; `ai` marks
// what the AI does.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Every colour except the aurora is a CSS variable (src/index.css): the dark palette on
        // screen, the original light palette when printing, so a printed report is dark on white.
        canvas: v('canvas'),
        ink: { DEFAULT: v('ink'), heading: v('ink-heading') },
        muted: { DEFAULT: v('muted'), strong: v('muted-strong') },
        // `strong` is for dashed drop-zone borders.
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        brand: {
          DEFAULT: v('brand'),
          dark: v('brand-dark'),
          tint: v('brand-tint'),
          soft: v('brand-soft'),
          border: v('brand-border'),
          // Secondary text on a navy background.
          muted: v('brand-muted'),
        },
        // The AI layer. DEFAULT is for text and filled buttons; `bright` is for spinners, bars,
        // borders and focus rings, never text.
        ai: {
          DEFAULT: v('ai'),
          bright: v('ai-bright'),
          dark: v('ai-dark'),
          tint: v('ai-tint'),
          border: v('ai-border'),
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
        status: Object.fromEntries(
          ['covered', 'conditional', 'unclear', 'excluded', 'notfound'].map((status) => [
            status,
            {
              DEFAULT: v(`status-${status}`),
              bg: v(`status-${status}-bg`),
              border: v(`status-${status}-border`),
              dot: v(`status-${status}-dot`),
            },
          ]),
        ),
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
