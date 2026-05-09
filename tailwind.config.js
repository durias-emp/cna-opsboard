/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#0A0A0A',
          900: '#111111',
          800: '#1A1A1A',
          700: '#242424',
        },
        accent: {
          DEFAULT: '#FFFFFF',
          dark: '#D1D5DB',
          light: '#FFFFFF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
