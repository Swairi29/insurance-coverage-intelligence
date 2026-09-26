import type { Config } from 'tailwindcss';

// Colours are defined once here (docs/frontend-plan.md §4). Brand colours come from the old
// InsureIntel styles (LANDING_CONTENT.md). Components use the token names, never hex values.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#172033', heading: '#172b4d' },
        muted: { DEFAULT: '#697386', strong: '#53627a' },
        line: '#e6eaf1',
        brand: {
          DEFAULT: '#3563e9',
          dark: '#2a4fc0',
          tint: '#f0f4ff',
          soft: '#f5f8ff',
          border: '#e0e8ff',
        },
        // Coverage status colours. Always paired with a text label, never colour alone.
        status: {
          covered: { DEFAULT: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
          conditional: { DEFAULT: '#b45309', bg: '#fffbeb', border: '#fde68a' },
          unclear: { DEFAULT: '#4b5563', bg: '#f3f4f6', border: '#d1d5db' },
          excluded: { DEFAULT: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
          notfound: { DEFAULT: '#b91c1c', bg: '#ffffff', border: '#b91c1c' },
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['Manrope', '"DM Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '17px',
      },
    },
  },
  plugins: [],
} satisfies Config;
