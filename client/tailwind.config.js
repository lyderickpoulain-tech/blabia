/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#f0f7ff',
          100: '#e0efff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8'
        },
        // Ancienne palette : le bleu est aligné sur « action » (refonte UX v5.1)
        blabia: {
          blue:          '#3352E0',
          'blue-dark':   '#2338B0',
          'blue-light':  '#E6EAFF',
          orange:        '#F27B2C',
          'orange-dark': '#D96A1E',
          'orange-light':'#FEF3EC',
        },
        // Refonte UX v5.1 — une couleur, un sens (docs/feuille-de-route-v5.1.md)
        // Ardoise bleutée plutôt que noir pur (retour utilisateur : « trop triste »)
        ink: {
          DEFAULT: '#1E2238',
          soft:    '#363C57',
          muted:   '#565D78',
          faint:   '#6A7190',
        },
        canvas: '#F3F5FB',
        line:   '#E1E5F0',
        action: { DEFAULT: '#3352E0', dark: '#2338B0', light: '#E6EAFF', border: '#B3BEF8' }, // ce sur quoi on clique pour avancer
        await:  { DEFAULT: '#9A4A06', light: '#FFF1D6', bg: '#FFF9EE', border: '#F6CF78' },   // attend l'arbitrage de l'humain
        ok:     { DEFAULT: '#15803D', light: '#DCFCE7', border: '#86EFAC' },                  // validé, décidé
        ai:     { DEFAULT: '#6D35D9', light: '#F0E9FF', bg: '#FAF7FF', border: '#D5C2FB' },   // produit par l'IA
        muted:  { DEFAULT: '#565D78', light: '#ECEFF6' },                                     // passé, secondaire
      }
    }
  },
  plugins: []
};
