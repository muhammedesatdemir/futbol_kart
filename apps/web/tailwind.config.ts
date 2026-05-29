import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        pitch: {
          DEFAULT: '#1f6b3a',
          dark: '#0a2614',
          deep: '#061a0e',
          light: '#2f8a4d',
          neon: '#5fe07a',
        },
        accent: {
          gold: '#f0c14b',
          goldHi: '#ffd76b',
        },
        side: {
          red: '#c8323d',
          redDark: '#7a1d24',
          blue: '#2c5fd6',
          blueDark: '#1a3a87',
        },
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-gold': '0 0 24px rgba(240,193,75,0.45), 0 4px 18px rgba(0,0,0,0.4)',
        'glow-neon': '0 0 28px rgba(95,224,122,0.45)',
        card: '0 10px 30px -10px rgba(0,0,0,0.6), 0 4px 12px -4px rgba(0,0,0,0.5)',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-3px)' },
        },
        'pitch-sweep': {
          '0%': { transform: 'translateX(-30vw)', opacity: '0' },
          '20%': { opacity: '0.35' },
          '80%': { opacity: '0.35' },
          '100%': { transform: 'translateX(120vw)', opacity: '0' },
        },
        'cta-pulse': {
          '0%, 100%': {
            boxShadow:
              '0 0 24px rgba(240,193,75,0.35), 0 4px 18px rgba(0,0,0,0.4)',
          },
          '50%': {
            boxShadow:
              '0 0 44px rgba(255,215,107,0.7), 0 4px 22px rgba(0,0,0,0.5)',
          },
        },
        'cta-ring': {
          '0%': { transform: 'scale(1)', opacity: '0.6' },
          '70%': { transform: 'scale(1.35)', opacity: '0' },
          '100%': { transform: 'scale(1.35)', opacity: '0' },
        },
        'stinger-in-left': {
          '0%': { transform: 'translateX(-110%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'stinger-in-right': {
          '0%': { transform: 'translateX(110%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
      animation: {
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
        'float-slow': 'float-slow 4s ease-in-out infinite',
        'pitch-sweep': 'pitch-sweep 28s ease-in-out infinite',
        'cta-pulse': 'cta-pulse 2.6s ease-in-out infinite',
        'cta-ring': 'cta-ring 2.6s ease-out infinite',
        'stinger-in-left': 'stinger-in-left 600ms cubic-bezier(0.22,1,0.36,1) both',
        'stinger-in-right': 'stinger-in-right 600ms cubic-bezier(0.22,1,0.36,1) both',
      },
    },
  },
  plugins: [],
};

export default config;
