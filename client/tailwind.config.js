/** @type {import('tailwindcss').Config} */

// Les couleurs sont des variables CSS (canaux RGB) définies dans src/index.css :
// valeurs claires sur :root, valeurs sombres sous html[data-theme="dark"].
//   --c-* : textes, bordures, teintes   --f-* : fonds pleins qui portent du texte blanc
const c = name => `rgb(var(--c-${name}) / <alpha-value>)`;
const f = name => `rgb(var(--f-${name}) / <alpha-value>)`;

const shades = (family, list) => Object.fromEntries(list.map(s => [s, c(`${family}-${s}`)]));
const fills = (family, list) => Object.fromEntries(list.map(s => [s, f(`${family}-${s}`)]));
const ALL = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const STRONG = [400, 500, 600, 700, 800, 900];

const palettes = {
  gray: ALL, red: ALL, green: ALL, amber: ALL, blue: ALL, violet: ALL,
  emerald: [50, 100, 200, 700], orange: [400],
};

const colors = {
  primary: {
    50: '#f0f7ff',
    100: '#e0efff',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8'
  },
  // Ancienne palette : le bleu est aligné sur « action » (refonte UX v5.1)
  blabia: {
    blue:          c('blabia-blue'),
    'blue-dark':   c('blabia-blue-dark'),
    'blue-light':  c('blabia-blue-light'),
    orange:        c('blabia-orange'),
    'orange-dark': c('blabia-orange-dark'),
    'orange-light':c('blabia-orange-light'),
  },
  // Refonte UX v5.1 — une couleur, un sens (docs/feuille-de-route-v5.1.md)
  // Ardoise bleutée plutôt que noir pur (retour utilisateur : « trop triste »)
  ink: {
    DEFAULT: c('ink'),
    soft:    c('ink-soft'),
    muted:   c('ink-muted'),
    faint:   c('ink-faint'),
  },
  canvas: c('canvas'),
  'canvas-deep': c('canvas-deep'),
  line:   c('line'),
  action: { DEFAULT: c('action'), dark: c('action-dark'), light: c('action-light'), border: c('action-border') }, // ce sur quoi on clique pour avancer
  await:  { DEFAULT: c('await'), light: c('await-light'), bg: c('await-bg'), border: c('await-border') },       // attend l'arbitrage de l'humain
  ok:     { DEFAULT: c('ok'), light: c('ok-light'), border: c('ok-border') },                                   // validé, décidé
  ai:     { DEFAULT: c('ai'), light: c('ai-light'), bg: c('ai-bg'), border: c('ai-border') },                   // produit par l'IA
  muted:  { DEFAULT: c('muted'), light: c('muted-light') },                                                     // passé, secondaire
  ...Object.fromEntries(Object.entries(palettes).map(([name, list]) => [name, shades(name, list)])),
};

// Fonds pleins (boutons, pastilles, code) : valeurs propres, pour que le texte blanc reste lisible en sombre
const backgroundColor = ({ theme }) => ({
  ...theme('colors'),
  white: c('surface'),
  'surface-2': c('surface-2'),
  blabia: { ...theme('colors.blabia'), blue: f('blabia-blue'), 'blue-dark': f('blabia-blue-dark'), orange: f('blabia-orange'), 'orange-dark': f('blabia-orange-dark') },
  ink: { ...theme('colors.ink'), DEFAULT: f('ink'), soft: f('ink-soft'), muted: f('ink-muted') },
  action: { ...theme('colors.action'), DEFAULT: f('action'), dark: f('action-dark') },
  await: { ...theme('colors.await'), DEFAULT: f('await') },
  ok: { ...theme('colors.ok'), DEFAULT: f('ok') },
  ai: { ...theme('colors.ai'), DEFAULT: f('ai') },
  muted: { ...theme('colors.muted'), DEFAULT: f('muted') },
  ...Object.fromEntries(Object.keys(palettes).map(name => [name, {
    ...theme(`colors.${name}`),
    ...fills(name, palettes[name].filter(s => STRONG.includes(s))),
    ...(name === 'gray' ? { 300: f('gray-300') } : {}),
  }])),
});

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
      colors,
      backgroundColor,
      // Le blanc et le gris très clair posés sur un fond coloré ou sombre (code, boutons pleins) ne changent pas
      textColor: { white: '#ffffff', gray: { 100: '#f3f4f6', 200: '#e5e7eb' }, green: { 200: '#bbf7d0' } },
      boxShadow: {
        header: 'var(--shadow-header)',
        card: 'var(--shadow-card)',
      },
    }
  },
  plugins: []
};
