import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // GitPulse custom palette (from reference poster)
        bg: {
          primary: '#0a0e14',
          card: '#111827',
        },
        border: {
          subtle: '#1f2937',
        },
        accent: {
          primary: '#22c55e',    // emerald/mint green - "Pulse" wordmark, primary CTAs
          secondary: '#a855f7',  // purple/violet - secondary icons
        },
        text: {
          primary: '#f9fafb',
          muted: '#9ca3af',
        },
        terminal: {
          red: '#ef4444',
          yellow: '#fbbf24',
          green: '#22c55e',
        },
      },
      fontFamily: {
        sans: ['Geist Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        card: '0.75rem',    // 12px
        terminal: '0.5rem', // 8px
      },
      boxShadow: {
        'card-hover': '0 10px 40px -10px rgba(34, 197, 94, 0.15)',
        'terminal-glow': '0 0 30px -5px rgba(34, 197, 94, 0.1)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;