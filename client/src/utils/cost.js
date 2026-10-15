// Coût réel de l'IA (v5.1) : montants en dollars US, comme la facture Anthropic.

const usd = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatUSD(n) {
  const v = Number(n) || 0;
  if (v > 0 && v < 0.01) return '< 0,01 $';
  return usd.format(v).replace(/\s?\$US|\s?US\$/, ' $');
}

// Origine des appels (UsageLog.kind) → libellé lisible
const KIND_LABELS = {
  chat:                    'Échanges en réunion',
  'generate-deliverable':  'Comptes rendus et livrables',
  'sessions/suggest-agents': 'Suggestion d’agents',
  'quick-command':         'Demandes à BlabIA',
  'generate-timeline':     'Plan des réunions',
  'tools/analyze':         'Analyse des outils',
  'export/claude-code':    'Prompts Claude Code',
  'extract-file':          'Lecture de fichiers joints',
  'generate-memory':       'Mémoire du projet',
  mission:                 'Missions des agents',
  recap:                   'Récapitulatif du projet',
};

export function kindLabel(kind = '') {
  if (KIND_LABELS[kind]) return KIND_LABELS[kind];
  const last = kind.split('/').pop();
  return KIND_LABELS[last] || 'Autres';
}
