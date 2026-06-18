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
          blue:          '#5B6FE8',
          'blue-dark':   '#4A5CD4',
          'blue-light':  '#EEF0FD',
          orange:        '#F27B2C',
          'orange-dark': '#D96A1E',
          'orange-light':'#FEF3EC',
        }
      }
    }
  },
  plugins: []
};
