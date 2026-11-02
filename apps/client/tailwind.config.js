/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ceviz: { DEFAULT: '#2B1A12', 700: '#3A2419', 600: '#4A2F21', 400: '#7A5642' },
        cuha: { DEFAULT: '#1E5A45', 700: '#174636', 400: '#2E7A5E', 200: '#9FC8B6' },
        pirinc: { DEFAULT: '#D4A44C', 300: '#E8C988', 700: '#9C7429' },
        cay: { DEFAULT: '#B23A2E', 300: '#E07A6E' },
        fildisi: { DEFAULT: '#FAF5EA', 200: '#EFE6D2' },
        duman: '#8C9A93',
      },
      fontFamily: { sans: ['"Bricolage Grotesque Variable"', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
