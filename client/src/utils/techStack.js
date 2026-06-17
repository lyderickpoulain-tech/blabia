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

// Mapping outil → clé de catégorie techStack (format JSON stocké en DB)
export const TOOL_CAT_KEY = {
  'railway': 'hebergement', 'vercel': 'hebergement', 'netlify': 'hebergement',
  'ovh mutualisé': 'hebergement', 'ovh vps': 'hebergement', 'aws': 'hebergement',
  'render': 'hebergement', 'fly.io': 'hebergement', 'digitalocean': 'hebergement',
  'hetzner': 'hebergement',
  'postgresql': 'bdd', 'mysql': 'bdd', 'mongodb': 'bdd', 'sqlite': 'bdd',
  'supabase': 'bdd', 'planetscale': 'bdd', 'redis': 'bdd',
  'react': 'frontend', 'vue.js': 'frontend', 'next.js': 'frontend', 'nuxt': 'frontend',
  'svelte': 'frontend', 'astro': 'frontend', 'html/css vanilla': 'frontend', 'angular': 'frontend',
  'node.js/express': 'backend', 'python/fastapi': 'backend', 'python/django': 'backend',
  'php/laravel': 'backend', 'nestjs': 'backend', 'ruby on rails': 'backend',
  'jwt maison': 'auth', 'auth0': 'auth', 'clerk': 'auth', 'supabase auth': 'auth',
  'nextauth.js': 'auth', 'keycloak': 'auth',
  'nodemailer/smtp': 'emails', 'resend': 'emails', 'sendgrid': 'emails',
  'mailgun': 'emails', 'brevo': 'emails', 'postmark': 'emails',
  'vs code': 'devtools', 'claude code': 'devtools', 'github': 'devtools',
  'gitlab': 'devtools', 'docker': 'devtools', 'cursor': 'devtools',
  'ovh': 'domaine', 'namecheap': 'domaine', 'cloudflare': 'domaine', 'gandi': 'domaine',
};

export const CAT_LABELS = {
  hebergement: 'Hébergement',
  bdd:         'Base de données',
  frontend:    'Framework frontend',
  backend:     'Framework backend',
  auth:        'Authentification',
  emails:      "Envoi d'emails",
  devtools:    'Outils de développement',
  domaine:     'Domaine',
};

// Extrait tous les noms d'outils sélectionnés depuis un objet techStack JSON
export function extractStackToolNames(techStack) {
  const names = new Set();
  if (!techStack || typeof techStack !== 'object') return names;
  for (const key of Object.keys(CAT_LABELS)) {
    const selected = techStack[key] || [];
    for (const item of selected) {
      const label = item === 'Autre' ? (techStack[`${key}_autre`] || null) : item;
      if (label) names.add(label.toLowerCase().trim());
    }
  }
  return names;
}

// Retourne la clé de catégorie d'un outil (pour mise à jour project.techStack)
export function getCategoryKey(toolName) {
  if (!toolName) return null;
  return TOOL_CAT_KEY[toolName.toLowerCase().trim()] || null;
}

export const PRICING_CONFIG = {
  gratuit:      { label: 'Gratuit',    color: 'bg-green-100 text-green-700',   dot: '🟢' },
  freemium:     { label: 'Freemium',   color: 'bg-yellow-100 text-yellow-700', dot: '🟡' },
  payant:       { label: 'Payant',     color: 'bg-blue-100 text-blabia-blue',     dot: '🔵' },
  subscription: { label: 'Abonnement', color: 'bg-orange-100 text-orange-700', dot: '🟠' },
};

export function getPricing(toolName) {
  if (!toolName) return null;
  return TOOL_PRICING[toolName.toLowerCase()] || null;
}
