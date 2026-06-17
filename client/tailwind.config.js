/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f7ff',
          100: '#e0efff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8'
        },
        blabia: {
          blue:   '#5B6FE8',
          orange: '#F27B2C',
        }
      }
    }
  },
  plugins: []
};
