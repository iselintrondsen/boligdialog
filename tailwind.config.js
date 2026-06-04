/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1A56A0',
          light: '#D5E8F0',
          dark: '#134080',
        },
        surface: '#F5F7FA',
        text: {
          DEFAULT: '#1A1A2E',
          muted: '#6B7280',
        },
        status: {
          open: '#EF4444',
          in_progress: '#F59E0B',
          resolved: '#10B981',
        },
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
