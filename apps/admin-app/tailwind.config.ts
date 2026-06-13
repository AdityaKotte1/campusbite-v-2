import type { Config } from 'tailwindcss';

/**
 * CampusBite Admin — "Editorial Appetite" (work-mode variant).
 * Same warm token system as the student app, tuned denser for data UIs:
 * cream paper background, charcoal ink, appetite red-orange + amber accents.
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
        brand: {
          DEFAULT: '#DD3A11',
          dark: '#B62D0A',
          light: '#F06A3C',
          pale: '#FBEADF',
        },
        amber: {
          DEFAULT: '#C17A16',
          dark: '#94590C',
          light: '#EBC178',
          pale: '#FBF0DC',
        },
        green: {
          DEFAULT: '#1E8A5A',
          dark: '#14613E',
          light: '#E2F1E8',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          2: '#FFFCF5',
        },
        bg: {
          DEFAULT: '#F4ECDD',
          2: '#FBF6EC',
        },
        text: {
          DEFAULT: '#241D15',
          2: '#6B5D4D',
          3: '#9D8E7B',
        },
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
    },
  },
  plugins: [],
};

export default config;
