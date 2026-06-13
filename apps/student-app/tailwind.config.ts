import type { Config } from 'tailwindcss';

/**
 * MunchAdda — "Editorial Appetite" design language.
 * Warm cream + charcoal ink base, appetite red-orange as the primary CTA,
 * amber as the editorial accent, hairline warm borders, soft low shadows.
 * Fraunces (display serif) pairs with Inter (UI / tabular numerals).
 */
const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary appetite accent (CTAs, active brand moments)
        brand: {
          DEFAULT: '#DD3A11',
          dark: '#B62D0A',
          light: '#F06A3C',
          pale: '#FBEADF',
        },
        // Editorial secondary accent — ratings, highlights, warmth
        amber: {
          DEFAULT: '#C17A16',
          dark: '#94590C',
          light: '#EBC178',
          pale: '#FBF0DC',
        },
        // Veg / success
        green: {
          DEFAULT: '#1E8A5A',
          dark: '#14613E',
          light: '#E2F1E8',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          2: '#FFFCF5',
        },
        // Cream "paper" page background
        bg: {
          DEFAULT: '#F4ECDD',
          2: '#FBF6EC',
        },
        // Warm charcoal ink
        text: {
          DEFAULT: '#241D15',
          2: '#6B5D4D',
          3: '#9D8E7B',
        },
        // Warm hairline borders
        border: {
          DEFAULT: '#E9DFCD',
          2: '#DBCDB3',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-fraunces)', 'Fraunces', 'Georgia', 'serif'],
      },
      letterSpacing: {
        tightest: '-0.04em',
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '26px',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(74, 53, 30, 0.05)',
        md: '0 2px 8px -1px rgba(74, 53, 30, 0.07), 0 1px 3px -1px rgba(74, 53, 30, 0.05)',
        lg: '0 10px 28px -8px rgba(74, 53, 30, 0.14), 0 4px 10px -4px rgba(74, 53, 30, 0.07)',
        xl: '0 24px 48px -12px rgba(74, 53, 30, 0.18)',
        warm: '0 6px 22px -6px rgba(221, 58, 17, 0.28)',
      },
      screens: {
        xs: '375px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};

export default config;
