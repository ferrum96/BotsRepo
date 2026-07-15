/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#060b14',
        surface: {
          DEFAULT: '#0a1120',
          dim: '#060b14',
          bright: '#1a2236',
          1: '#0a1120',
          2: '#111a2e',
          3: '#0d1528',
        },
        'surface-container': {
          lowest: '#060e20',
          low: '#131b2e',
          DEFAULT: '#171f33',
          high: '#222a3d',
          highest: '#2d3449',
        },
        'surface-variant': '#2d3449',
        'on-surface': {
          DEFAULT: '#dae2fd',
          variant: '#b9cacb',
        },
        primary: {
          DEFAULT: '#dbfcff',
          container: '#00f0ff',
          fixed: '#7df4ff',
          'fixed-dim': '#00dbe9',
        },
        'on-primary': '#00363a',
        secondary: {
          DEFAULT: '#4edea3',
          container: '#00a572',
        },
        'on-secondary': '#003824',
        tertiary: {
          DEFAULT: '#fff5de',
          container: '#fed639',
        },
        'on-tertiary': '#3b2f00',
        outline: {
          DEFAULT: '#849495',
          variant: '#3b494b',
          level: '#1e293b',
        },
        error: {
          DEFAULT: '#ffb4ab',
          container: '#93000a',
          'on-container': '#ffdad6',
        },
        electric: {
          DEFAULT: '#00f0ff',
          blue: '#00f0ff',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'headline-md': ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'headline-lg': ['24px', { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'body-sm': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'body-lg': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'label-caps': ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '600' }],
        'stats-number': ['28px', { lineHeight: '32px', fontWeight: '700' }],
        display: ['36px', { lineHeight: '44px', letterSpacing: '-0.02em', fontWeight: '700' }],
      },
      spacing: {
        'sidebar': '260px',
        'container': '24px',
        'stack-sm': '8px',
        'stack-md': '16px',
        'stack-lg': '32px',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
      },
    },
  },
  plugins: [],
}
