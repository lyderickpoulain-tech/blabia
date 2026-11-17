// BlabIA + : contrôle juridique et sécurité d'un site AVANT sa mise en ligne (décision du porteur
// du 18/11/2026 : ce qu'il fabrique avec BlabIA doit respecter la loi et être irréprochable en
// cybersécurité). Contrôles automatiques, sans IA : ils vérifient ce que l'agent promet.
// Chaque point : { level: 'important' | 'conseil', topic: 'loi' | 'sécurité' | 'référencement',
// text (pour le porteur, en mots simples), fix (la retouche à demander) }.
// Le porteur décide : rien ne bloque la mise en ligne (il est le seul utilisateur).

const SECRET_PATTERNS = [
  [/\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}/, 'clé d’accès'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'clé d’accès'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'clé d’accès'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'clé privée'],
  [/\b(?:api[_-]?key|secret|password|mot[_-]?de[_-]?passe)\s*[:=]\s*["'][^"'\s]{8,}["']/i, 'mot de passe ou clé'],
];
const text = f => Buffer.from(f.content).toString('utf8');
const isHtml = f => /\.html$/i.test(f.path);

function checkSite(files) {
  const out = [];
  const add = (level, topic, msg, fix) => { if (!out.some(o => o.text === msg)) out.push({ level, topic, text: msg, fix }); };
  const html = files.filter(isHtml);
  const all = files.filter(f => /\.(html|js|css|txt|xml|json|svg)$/i.test(f.path)).map(f => ({ path: f.path, body: text(f) }));
  const pages = html.map(f => ({ path: f.path, body: text(f) }));

  // ── Loi ──
  const legal = pages.find(p => /mentions?[-_ ]?l[ée]gales/i.test(p.path) || /<h1[^>]*>\s*Mentions l[ée]gales/i.test(p.body));
  if (!legal) add('important', 'loi', 'Il manque la page « Mentions légales », obligatoire pour tout site (qui l’édite, qui l’héberge).', 'Ajoutez une page « Mentions légales » reliée depuis le pied de chaque page.');
  else if (/à compléter|\[à compléter\]|a completer/i.test(legal.body.replace(/<!--[\s\S]*?-->/g, ''))) add('important', 'loi', 'La page « Mentions légales » contient encore des informations « à compléter » (votre nom, votre adresse, l’hébergeur).', 'Complétez les mentions légales avec : [votre nom], [votre adresse ou celle de votre entreprise], [votre adresse e-mail].');
  const hasForm = pages.some(p => /<form\b/i.test(p.body));
  const privacy = pages.some(p => /confidentialit|donn[ée]es personnelles|privacy/i.test(p.path) || /<h1[^>]*>[^<]*(confidentialit|donn[ée]es personnelles)/i.test(p.body));
  if (hasForm && !privacy) add('important', 'loi', 'Le site a un formulaire mais pas de page expliquant ce que deviennent les informations des visiteurs.', 'Ajoutez une page « Politique de confidentialité » qui explique ce que deviennent les messages du formulaire de contact.');
  const sells = pages.some(p => /(acheter|ajouter au panier|commander|paiement)\b/i.test(p.body.replace(/<[^>]+>/g, ' ')) && /\b\d+[,.]?\d*\s?€/.test(p.body));
  if (sells && !pages.some(p => /(cgv|conditions[-_ ]g[ée]n[ée]rales[-_ ]de[-_ ]vente)/i.test(p.path + p.body.slice(0, 2000)))) add('important', 'loi', 'Le site semble vendre quelque chose mais n’a pas de conditions générales de vente (avec le droit de rétractation de 14 jours).', 'Ajoutez une page « Conditions générales de vente » avec le droit de rétractation de 14 jours.');
  const tracking = all.some(f => /googletagmanager|google-analytics|gtag\(|adsbygoogle|facebook\.net|hotjar/i.test(f.body));
  if (tracking && !all.some(f => /consentement|cookie/i.test(f.body))) add('important', 'loi', 'Le site utilise des statistiques ou de la publicité sans demander l’accord des visiteurs (bandeau de cookies obligatoire).', 'Ajoutez un bandeau de consentement aux cookies : « Accepter » et « Refuser » aussi visibles l’un que l’autre, rien n’est déposé avant l’accord.');

  // ── Sécurité ──
  for (const f of all) {
    for (const [re, what] of SECRET_PATTERNS) {
      if (re.test(f.body)) add('important', 'sécurité', `Un fichier du site (${f.path}) semble contenir une ${what} : tout le monde pourrait la lire.`, `Retirez de ${f.path} toute clé, tout mot de passe et tout identifiant secret.`);
    }
  }
  const external = new Set();
  for (const p of pages) {
    for (const m of p.body.matchAll(/<(script|link|img|iframe|video|audio|source)\b[^>]*\b(?:src|href)\s*=\s*["'](https?:)?\/\/([^"'/]+)/gi)) {
      if (!(m[1].toLowerCase() === 'link' && !/stylesheet|preload|icon/i.test(m[0]))) external.add(m[3].toLowerCase());
    }
  }
  if (external.size) add('conseil', 'sécurité', `Le site charge des éléments depuis d’autres sites (${[...external].slice(0, 3).join(', ')}) : ils peuvent changer sans vous et suivre vos visiteurs. Ils seront bloqués une fois en ligne.`, 'Remplacez les éléments chargés depuis d’autres sites par des fichiers du site lui-même.');
  if (all.some(f => /\.js$/i.test(f.path) && /\beval\s*\(|new Function\s*\(|document\.write\s*\(/.test(f.body))) add('important', 'sécurité', 'Le programme du site utilise des instructions dangereuses (exécution de texte comme du code).', 'Réécrivez le programme du site sans eval, new Function ni document.write.');
  if (all.some(f => /\.js$/i.test(f.path) && /\.innerHTML\s*=(?!=)/.test(f.body))) add('conseil', 'sécurité', 'Le programme du site insère du texte comme du code HTML : à éviter dès que ce texte peut venir d’un visiteur.', 'Dans le programme du site, remplacez innerHTML par textContent ou par des éléments créés un par un.');
  if (pages.some(p => /<a\b[^>]*target\s*=\s*["']_blank["'](?![^>]*\brel\s*=\s*["'][^"']*noopener)[^>]*>/i.test(p.body))) add('conseil', 'sécurité', 'Des liens s’ouvrent dans un nouvel onglet sans la protection qui empêche le site visité d’agir sur le vôtre.', 'Ajoutez rel="noopener noreferrer" à tous les liens qui s’ouvrent dans un nouvel onglet.');
  if (pages.some(p => /\b(?:href|src|action)\s*=\s*["']http:\/\//i.test(p.body))) add('conseil', 'sécurité', 'Des liens pointent vers des adresses non sécurisées (http:// au lieu de https://).', 'Remplacez les adresses en http:// par leur version en https://.');
  if (pages.some(p => /<form\b[^>]*\baction\s*=\s*["']https?:\/\//i.test(p.body))) add('important', 'sécurité', 'Un formulaire envoie les informations des visiteurs vers un autre site.', 'Faites envoyer le formulaire par la messagerie du visiteur (mailto) au lieu d’un autre site.');

  // ── Référencement ──
  const noTitle = pages.filter(p => !/<title>[^<]{3,}<\/title>/i.test(p.body)).map(p => p.path);
  if (noTitle.length) add('conseil', 'référencement', `Des pages n’ont pas de titre pour Google (${noTitle.slice(0, 3).join(', ')}).`, 'Donnez un titre propre à chaque page.');
  const noDesc = pages.filter(p => !/<meta\s+name=["']description["']/i.test(p.body)).map(p => p.path);
  if (noDesc.length) add('conseil', 'référencement', `Des pages n’ont pas de description pour Google (${noDesc.slice(0, 3).join(', ')}).`, 'Ajoutez une description de deux phrases à chaque page.');

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'important' ? -1 : 1));
}

module.exports = { checkSite };
