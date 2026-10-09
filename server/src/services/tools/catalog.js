// v5.0 phase 4 : catalogue unique des outils (catégories, outils connus, coûts
// indicatifs, positions sur la carte). Servi au client par GET /api/tools/catalog —
// c'est la seule source de vérité, côté client comme côté serveur.

// zone : main (chaîne utilisateur → données), services (autour du serveur),
// delivery (chaîne de livraison), around (outils transverses).
// map : coin haut-gauche de la case dans un repère 1000 × 780.
const CATEGORIES = [
  { id: 'frontend',     icon: '🎨', label: "Ce que l'utilisateur voit",       technical: 'Interface / frontend',            explanation: "Les écrans, boutons et pages avec lesquels on interagit dans le navigateur ou l'app.", zone: 'main',     map: { x: 200, y: 30 } },
  { id: 'backend',      icon: '🧠', label: "Le cerveau de l'application",     technical: 'Serveur / backend / API',         explanation: 'Applique les règles, fait les calculs et répond aux demandes de l\'interface.',        zone: 'main',     map: { x: 450, y: 30 } },
  { id: 'database',     icon: '🗄️', label: 'Où sont rangées les données',     technical: 'Base de données',                 explanation: 'Conserve durablement les comptes, contenus et historiques.',                          zone: 'main',     map: { x: 700, y: 30 } },
  { id: 'auth',         icon: '🔐', label: "Qui a le droit d'entrer",         technical: 'Authentification',                explanation: 'Inscription, connexion et vérification de qui peut faire quoi.',                      zone: 'services', map: { x: 0,   y: 230 } },
  { id: 'messaging',    icon: '📧', label: 'Envoyer des messages',            technical: 'Emails / notifications',          explanation: 'Emails de confirmation, alertes, notifications envoyées aux utilisateurs.',            zone: 'services', map: { x: 200, y: 230 } },
  { id: 'ai',           icon: '✨', label: "L'intelligence artificielle",     technical: 'IA / LLM',                        explanation: 'Les modèles qui génèrent du texte, analysent ou répondent à la place d\'un humain.',   zone: 'services', map: { x: 400, y: 230 } },
  { id: 'payment',      icon: '💳', label: "Encaisser de l'argent",           technical: 'Paiement',                        explanation: 'Paiements par carte, abonnements et factures.',                                      zone: 'services', map: { x: 600, y: 230 } },
  { id: 'storage',      icon: '🖼️', label: 'Fichiers et images',              technical: 'Stockage de fichiers',            explanation: 'Range les photos, PDF et autres fichiers envoyés par les utilisateurs.',              zone: 'services', map: { x: 800, y: 230 } },
  { id: 'devtools',     icon: '🛠️', label: 'Construire et coder',             technical: 'Outils de développement',         explanation: 'Les logiciels avec lesquels on écrit et teste le code.',                              zone: 'delivery', map: { x: 0,   y: 430 } },
  { id: 'git',          icon: '📦', label: 'Ranger et versionner le code',    technical: 'Git / dépôt',                     explanation: 'Sauvegarde chaque version du code et permet de revenir en arrière.',                  zone: 'delivery', map: { x: 250, y: 430 } },
  { id: 'hosting',      icon: '🌐', label: "Où vit l'application en ligne",   technical: 'Hébergement',                     explanation: 'Les serveurs qui font tourner l\'application et la rendent accessible sur internet.', zone: 'delivery', map: { x: 500, y: 430 } },
  { id: 'domain',       icon: '🔗', label: "L'adresse du site",               technical: 'Nom de domaine / DNS',            explanation: "Le nom qu'on tape dans le navigateur (monsite.fr) et son aiguillage.",                zone: 'delivery', map: { x: 750, y: 430 } },
  { id: 'monitoring',   icon: '🚨', label: 'Surveiller que tout marche',      technical: 'Monitoring / logs',               explanation: 'Prévient quand quelque chose plante et garde la trace des erreurs.',                  zone: 'around',   map: { x: 0,   y: 630 } },
  { id: 'nocode',       icon: '🔁', label: 'Automatiser sans coder',          technical: 'No-code / automatisations',       explanation: 'Relie des services entre eux par des scénarios, sans écrire de code.',                zone: 'around',   map: { x: 250, y: 630 } },
  { id: 'analytics',    icon: '📊', label: "Mesurer l'audience",              technical: 'Analytics',                       explanation: 'Combien de visiteurs, d\'où ils viennent, ce qu\'ils utilisent.',                    zone: 'around',   map: { x: 500, y: 630 } },
  { id: 'organization', icon: '🗂️', label: 'Organiser le travail',            technical: 'Documentation / gestion de projet', explanation: 'Notes, tâches, documentation partagée de l\'équipe.',                               zone: 'around',   map: { x: 750, y: 630 } },
];

// Liens affichés sur la carte (catégorie → catégorie). "user" = l'utilisateur final.
const CATEGORY_LINKS = [
  ['user', 'frontend'], ['frontend', 'backend'], ['backend', 'database'],
  ['backend', 'auth'], ['backend', 'messaging'], ['backend', 'ai'], ['backend', 'payment'], ['backend', 'storage'],
  ['devtools', 'git'], ['git', 'hosting'], ['hosting', 'domain'],
  ['hosting', 'backend'], ['domain', 'frontend'],
  ['monitoring', 'hosting'], ['analytics', 'frontend'], ['nocode', 'backend'],
];

// cost.type : free | freemium | subscription | usage — montants indicatifs en €/mois
const c = (type, monthlyMin, monthlyMax, freeTier = null) => ({ type, monthlyMin, monthlyMax, freeTier });

const TOOLS = [
  // Interface
  { id: 'react',      name: 'React',               category: 'frontend', role: 'Construit des interfaces interactives.',                 cost: c('free', 0, 0) },
  { id: 'nextjs',     name: 'Next.js',             category: 'frontend', role: 'React avec rendu côté serveur, bon pour le référencement.', cost: c('free', 0, 0) },
  { id: 'vue',        name: 'Vue.js',              category: 'frontend', role: 'Alternative à React, réputée plus accessible.',           cost: c('free', 0, 0) },
  { id: 'svelte',     name: 'Svelte',              category: 'frontend', role: 'Framework léger qui compile l\'interface.',              cost: c('free', 0, 0) },
  { id: 'astro',      name: 'Astro',               category: 'frontend', role: 'Sites rapides centrés sur le contenu.',                  cost: c('free', 0, 0) },
  { id: 'html-css',   name: 'HTML / CSS',          category: 'frontend', role: 'Pages web simples sans framework.',                      cost: c('free', 0, 0) },
  { id: 'tailwind',   name: 'Tailwind CSS',        category: 'frontend', role: 'Mise en forme rapide par classes utilitaires.',          cost: c('free', 0, 0) },
  { id: 'expo',       name: 'Expo / React Native', category: 'frontend', role: 'Applications mobiles iOS et Android en JavaScript.',     cost: c('freemium', 0, 19, 'Builds gratuits limités') },
  // Serveur
  { id: 'node-express',   name: 'Node.js / Express', category: 'backend', role: 'Serveur en JavaScript.',                cost: c('free', 0, 0) },
  { id: 'nestjs',         name: 'NestJS',            category: 'backend', role: 'Serveur JavaScript structuré.',         cost: c('free', 0, 0) },
  { id: 'python-fastapi', name: 'Python / FastAPI',  category: 'backend', role: 'API rapides en Python.',                cost: c('free', 0, 0) },
  { id: 'python-django',  name: 'Python / Django',   category: 'backend', role: 'Framework Python complet.',             cost: c('free', 0, 0) },
  { id: 'php-laravel',    name: 'PHP / Laravel',     category: 'backend', role: 'Framework PHP pour sites et API.',      cost: c('free', 0, 0) },
  { id: 'rails',          name: 'Ruby on Rails',     category: 'backend', role: 'Framework Ruby complet.',               cost: c('free', 0, 0) },
  // Données
  { id: 'postgresql',  name: 'PostgreSQL',  category: 'database', role: 'Base relationnelle fiable, convient à la plupart des projets.', cost: c('free', 0, 0) },
  { id: 'mysql',       name: 'MySQL',       category: 'database', role: 'Base relationnelle très répandue.',            cost: c('free', 0, 0) },
  { id: 'sqlite',      name: 'SQLite',      category: 'database', role: 'Base dans un simple fichier, idéale en local.', cost: c('free', 0, 0) },
  { id: 'mongodb',     name: 'MongoDB',     category: 'database', role: 'Base de documents flexibles.',                 cost: c('freemium', 0, 60, '512 Mo gratuits (Atlas)') },
  { id: 'supabase',    name: 'Supabase',    category: 'database', role: 'PostgreSQL hébergé + auth + stockage.',        cost: c('freemium', 0, 25, '500 Mo de base gratuits') },
  { id: 'redis',       name: 'Redis',       category: 'database', role: 'Données en mémoire pour le cache et les files.', cost: c('freemium', 0, 10, 'Petite instance gratuite') },
  { id: 'firebase',    name: 'Firebase',    category: 'database', role: 'Base temps réel + services Google.',           cost: c('freemium', 0, 25, 'Offre Spark gratuite') },
  // Authentification
  { id: 'jwt-custom',    name: 'JWT maison',     category: 'auth', role: 'Connexion codée soi-même.',                cost: c('free', 0, 0) },
  { id: 'clerk',         name: 'Clerk',          category: 'auth', role: 'Connexion clé en main.',                   cost: c('freemium', 0, 25, '10 000 utilisateurs actifs/mois') },
  { id: 'auth0',         name: 'Auth0',          category: 'auth', role: 'Connexion clé en main, orientée entreprise.', cost: c('freemium', 0, 35, '25 000 utilisateurs actifs/mois') },
  { id: 'supabase-auth', name: 'Supabase Auth',  category: 'auth', role: 'Connexion incluse avec Supabase.',         cost: c('freemium', 0, 25, '50 000 utilisateurs actifs/mois') },
  { id: 'nextauth',      name: 'Auth.js',        category: 'auth', role: 'Connexion pour Next.js.',                  cost: c('free', 0, 0) },
  // Messages
  { id: 'resend',     name: 'Resend',          category: 'messaging', role: 'Envoi d\'emails par API.',              cost: c('freemium', 0, 20, '3 000 emails/mois') },
  { id: 'nodemailer', name: 'Nodemailer / SMTP', category: 'messaging', role: 'Envoi via un serveur mail existant.', cost: c('free', 0, 0) },
  { id: 'sendgrid',   name: 'SendGrid',        category: 'messaging', role: 'Envoi d\'emails en volume.',            cost: c('freemium', 0, 20, '100 emails/jour') },
  { id: 'brevo',      name: 'Brevo',           category: 'messaging', role: 'Emails transactionnels et newsletters.', cost: c('freemium', 0, 25, '300 emails/jour') },
  { id: 'mailgun',    name: 'Mailgun',         category: 'messaging', role: 'Envoi d\'emails par API.',              cost: c('freemium', 0, 35, '100 emails/jour') },
  // IA
  { id: 'claude-api', name: 'API Claude (Anthropic)', category: 'ai', role: 'Modèles de langage Claude pour générer et analyser du texte.', cost: c('usage', 1, 50) },
  { id: 'openai-api', name: 'API OpenAI',             category: 'ai', role: 'Modèles GPT pour générer et analyser du texte.',              cost: c('usage', 1, 50) },
  { id: 'mistral-api', name: 'API Mistral',           category: 'ai', role: 'Modèles de langage européens.',                               cost: c('usage', 1, 30) },
  // Paiement
  { id: 'stripe',        name: 'Stripe',         category: 'payment', role: 'Paiements par carte et abonnements.', cost: c('usage', 0, 0, 'Pas d\'abonnement, commission par transaction') },
  { id: 'paypal',        name: 'PayPal',         category: 'payment', role: 'Paiements PayPal.',                   cost: c('usage', 0, 0, 'Commission par transaction') },
  { id: 'lemonsqueezy',  name: 'Lemon Squeezy',  category: 'payment', role: 'Vente de logiciels, TVA gérée.',      cost: c('usage', 0, 0, 'Commission par transaction') },
  // Fichiers
  { id: 'cloudinary',       name: 'Cloudinary',        category: 'storage', role: 'Images et vidéos optimisées.',        cost: c('freemium', 0, 89, '25 crédits/mois') },
  { id: 'aws-s3',           name: 'AWS S3',            category: 'storage', role: 'Stockage de fichiers à grande échelle.', cost: c('usage', 0, 5) },
  { id: 'cloudflare-r2',    name: 'Cloudflare R2',     category: 'storage', role: 'Stockage sans frais de sortie.',       cost: c('freemium', 0, 5, '10 Go gratuits') },
  { id: 'supabase-storage', name: 'Supabase Storage',  category: 'storage', role: 'Fichiers inclus avec Supabase.',       cost: c('freemium', 0, 25, '1 Go gratuit') },
  // Construire et coder
  { id: 'vscode',      name: 'VS Code',     category: 'devtools', role: 'Éditeur de code.',                         cost: c('free', 0, 0) },
  { id: 'claude-code', name: 'Claude Code', category: 'devtools', role: 'Assistant IA qui code dans le terminal.', cost: c('subscription', 18, 100) },
  { id: 'cursor',      name: 'Cursor',      category: 'devtools', role: 'Éditeur de code avec IA intégrée.',        cost: c('freemium', 0, 20, 'Offre gratuite limitée') },
  { id: 'docker',      name: 'Docker',      category: 'devtools', role: 'Emballe l\'application pour qu\'elle tourne partout pareil.', cost: c('freemium', 0, 0, 'Gratuit en usage perso') },
  // Git
  { id: 'github', name: 'GitHub', category: 'git', role: 'Héberge le code et son historique.', cost: c('freemium', 0, 4, 'Dépôts privés gratuits') },
  { id: 'gitlab', name: 'GitLab', category: 'git', role: 'Héberge le code, avec intégration continue.', cost: c('freemium', 0, 29, 'Offre gratuite') },
  // Hébergement
  { id: 'railway',      name: 'Railway',      category: 'hosting', role: 'Déploie l\'application depuis GitHub.', cost: c('usage', 5, 20, 'Essai gratuit') },
  { id: 'vercel',       name: 'Vercel',       category: 'hosting', role: 'Héberge les sites et apps Next.js.',    cost: c('freemium', 0, 20, 'Projets perso gratuits') },
  { id: 'netlify',      name: 'Netlify',      category: 'hosting', role: 'Héberge les sites statiques.',          cost: c('freemium', 0, 19, 'Offre gratuite') },
  { id: 'render',       name: 'Render',       category: 'hosting', role: 'Héberge applications et bases.',        cost: c('freemium', 0, 25, 'Services gratuits mis en veille') },
  { id: 'flyio',        name: 'Fly.io',       category: 'hosting', role: 'Héberge des applications proches des utilisateurs.', cost: c('usage', 0, 20) },
  { id: 'ovh-vps',      name: 'OVH VPS',      category: 'hosting', role: 'Serveur privé à administrer soi-même.', cost: c('subscription', 5, 15) },
  { id: 'hetzner',      name: 'Hetzner',      category: 'hosting', role: 'Serveurs privés bon marché.',           cost: c('subscription', 4, 15) },
  { id: 'aws',          name: 'AWS',          category: 'hosting', role: 'Cloud professionnel complet.',          cost: c('usage', 0, 100) },
  // Domaine
  { id: 'ovh-domain', name: 'OVH (domaine)',  category: 'domain', role: 'Achat et gestion de nom de domaine.', cost: c('subscription', 1, 2, '~10 €/an') },
  { id: 'cloudflare', name: 'Cloudflare',     category: 'domain', role: 'Domaine au prix coûtant + protection.', cost: c('freemium', 0, 1, 'DNS et CDN gratuits') },
  { id: 'namecheap',  name: 'Namecheap',      category: 'domain', role: 'Achat de nom de domaine.',             cost: c('subscription', 1, 2, '~10 €/an') },
  { id: 'gandi',      name: 'Gandi',          category: 'domain', role: 'Registrar français.',                  cost: c('subscription', 1, 2, '~15 €/an') },
  // Surveillance
  { id: 'sentry',      name: 'Sentry',       category: 'monitoring', role: 'Remonte les erreurs avec leur contexte.', cost: c('freemium', 0, 26, '5 000 erreurs/mois') },
  { id: 'betterstack', name: 'Better Stack', category: 'monitoring', role: 'Surveille la disponibilité et les logs.', cost: c('freemium', 0, 25, '10 moniteurs gratuits') },
  { id: 'uptimerobot', name: 'UptimeRobot',  category: 'monitoring', role: 'Vérifie que le site répond.',             cost: c('freemium', 0, 7, '50 moniteurs gratuits') },
  // No-code
  { id: 'zapier', name: 'Zapier', category: 'nocode', role: 'Relie des services par des scénarios.', cost: c('freemium', 0, 20, '100 tâches/mois') },
  { id: 'make',   name: 'Make',   category: 'nocode', role: 'Scénarios d\'automatisation visuels.',   cost: c('freemium', 0, 10, '1 000 opérations/mois') },
  { id: 'n8n',    name: 'n8n',    category: 'nocode', role: 'Automatisations auto-hébergeables.',     cost: c('freemium', 0, 20, 'Gratuit en auto-hébergement') },
  // Audience
  { id: 'plausible',        name: 'Plausible',        category: 'analytics', role: 'Statistiques simples et respectueuses de la vie privée.', cost: c('subscription', 9, 19) },
  { id: 'google-analytics', name: 'Google Analytics', category: 'analytics', role: 'Statistiques d\'audience détaillées.',                   cost: c('free', 0, 0) },
  { id: 'posthog',          name: 'PostHog',          category: 'analytics', role: 'Analyse du comportement produit.',                       cost: c('freemium', 0, 0, '1 M d\'événements/mois') },
  { id: 'umami',            name: 'Umami',            category: 'analytics', role: 'Statistiques légères et open source.',                   cost: c('freemium', 0, 9, 'Gratuit en auto-hébergement') },
  // Organisation
  { id: 'notion', name: 'Notion', category: 'organization', role: 'Notes, documentation et bases partagées.', cost: c('freemium', 0, 10, 'Usage perso gratuit') },
  { id: 'trello', name: 'Trello', category: 'organization', role: 'Tableaux de tâches en colonnes.',         cost: c('freemium', 0, 5, 'Offre gratuite') },
  { id: 'linear', name: 'Linear', category: 'organization', role: 'Suivi de tâches pour équipes produit.',   cost: c('freemium', 0, 8, 'Offre gratuite') },
];

const USER_STATUSES    = ['using', 'account', 'to_try'];
const PROJECT_STATUSES = ['suggested', 'validated', 'refused'];
const COST_TYPES       = ['free', 'freemium', 'subscription', 'usage'];

const CATEGORY_IDS = new Set(CATEGORIES.map(c => c.id));

function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

// Retrouve un outil du catalogue par id ou par nom approximatif ("Node.js/Express", "vue.js"…)
function findCatalogTool(idOrName) {
  if (!idOrName) return null;
  const key = normalize(idOrName);
  return TOOLS.find(t => t.id === idOrName || normalize(t.id) === key || normalize(t.name) === key) || null;
}

module.exports = {
  CATEGORIES, CATEGORY_LINKS, TOOLS, USER_STATUSES, PROJECT_STATUSES, COST_TYPES,
  CATEGORY_IDS, findCatalogTool, normalize,
};
