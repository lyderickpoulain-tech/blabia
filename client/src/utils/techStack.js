// Lookup pricing par nom d'outil (insensible à la casse)
const TOOL_PRICING = {
  // Hébergement
  'railway':        'freemium',
  'vercel':         'freemium',
  'netlify':        'freemium',
  'ovh mutualisé':  'subscription',
  'ovh vps':        'subscription',
  'aws':            'payant',
  'render':         'freemium',
  'fly.io':         'freemium',
  'digitalocean':   'payant',
  'hetzner':        'payant',
  // Base de données
  'postgresql':     'gratuit',
  'mysql':          'gratuit',
  'mongodb':        'freemium',
  'sqlite':         'gratuit',
  'supabase':       'freemium',
  'planetscale':    'freemium',
  'redis':          'freemium',
  // Frontend
  'react':          'gratuit',
  'next.js':        'gratuit',
  'vue.js':         'gratuit',
  'nuxt':           'gratuit',
  'svelte':         'gratuit',
  'astro':          'gratuit',
  'html/css vanilla': 'gratuit',
  'angular':        'gratuit',
  // Backend
  'node.js/express':   'gratuit',
  'python/fastapi':    'gratuit',
  'python/django':     'gratuit',
  'php/laravel':       'gratuit',
  'nestjs':            'gratuit',
  'ruby on rails':     'gratuit',
  // Auth
  'jwt maison':        'gratuit',
  'auth0':             'freemium',
  'clerk':             'freemium',
  'supabase auth':     'freemium',
  'nextauth.js':       'gratuit',
  'keycloak':          'gratuit',
  // Emails
  'nodemailer/smtp':   'gratuit',
  'resend':            'freemium',
  'sendgrid':          'freemium',
  'mailgun':           'freemium',
  'brevo':             'freemium',
  'postmark':          'freemium',
  // Devtools
  'vs code':           'gratuit',
  'claude code':       'subscription',
  'github':            'freemium',
  'gitlab':            'freemium',
  'docker':            'freemium',
  'cursor':            'subscription',
  // Domaine
  'ovh':               'subscription',
  'namecheap':         'subscription',
  'cloudflare':        'freemium',
  'gandi':             'subscription',
  // CMS
  'wordpress':         'freemium',
  'strapi':            'freemium',
  'sanity':            'freemium',
  'contentful':        'freemium',
  'notion':            'freemium',
  // Paiement
  'stripe':            'payant',
  'paypal':            'payant',
  'lemon squeezy':     'payant',
  'paddle':            'payant',
  // Analytics
  'plausible':         'subscription',
  'google analytics':  'gratuit',
  'posthog':           'freemium',
  'sentry':            'freemium',
  'umami':             'freemium',
};

export const PRICING_CONFIG = {
  gratuit:      { label: 'Gratuit',    color: 'bg-green-100 text-green-700',   dot: '🟢' },
  freemium:     { label: 'Freemium',   color: 'bg-yellow-100 text-yellow-700', dot: '🟡' },
  payant:       { label: 'Payant',     color: 'bg-blue-100 text-blue-700',     dot: '🔵' },
  subscription: { label: 'Abonnement', color: 'bg-orange-100 text-orange-700', dot: '🟠' },
};

export function getPricing(toolName) {
  if (!toolName) return null;
  return TOOL_PRICING[toolName.toLowerCase()] || null;
}
