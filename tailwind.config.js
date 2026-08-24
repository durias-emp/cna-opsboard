/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#171717',   // Tesla-app ground
          900: '#1C1C1C',
          800: '#232324',   // cards
          700: '#2E2E2F',
        },
        accent: {
          DEFAULT: '#2CB9BD',   // the livery teal
          dark: '#1F9296',
          light: '#56D3D6',
        },
      },
      fontFamily: {
        // Apple's system font (SF Pro on iOS/macOS) — the native look
        sans: ['-apple-system', 'BlinkMacSystemFont', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
