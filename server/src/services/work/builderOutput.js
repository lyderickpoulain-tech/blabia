// v6 : lecture de la réponse balisée du constructeur (prompts/builderPrompt.js).
// Tolérante : une balise manquante donne une valeur vide ; sans <ouvrage>, tout le texte
// (hors autres balises) devient l'ouvrage. Fonctions pures, testées sans IA.

const tag = (text, name) => {
  const m = String(text || '').match(new RegExp(`<${name}>([\\s\\S]*?)(?:</${name}>|$)`, 'i'));
  return m ? m[1].trim() : '';
};

const bullets = block => block.split(/\r?\n/)
  .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
  .filter(Boolean);

const unquote = s => s.trim().replace(/^[«"“]\s*/, '').replace(/\s*[»"”]$/, '').trim();

// « - libellé :: valeur »
function parseAssumptions(block) {
  return bullets(block).map(l => {
    const i = l.indexOf('::');
    if (i < 0) return null;
    const statement = l.slice(0, i).trim().replace(/\s*:$/, '');
    const value = l.slice(i + 2).trim();
    return statement && value ? { statement: statement.slice(0, 200), value: value.slice(0, 500) } : null;
  }).filter(Boolean);
}

// « - + « ses mots » :: Partie » (idée nouvelle) ; « - I3 :: Partie » (idée connue)
// « :: pas encore — raison » : idée absente de cette version
function parseIdeas(block) {
  return bullets(block).map(l => {
    const i = l.indexOf('::');
    const head = (i < 0 ? l : l.slice(0, i)).trim();
    const where = i < 0 ? '' : l.slice(i + 2).trim();
    const absent = !where || /^pas encore/i.test(where);
    const presence = { present: !absent, where: absent ? (where.replace(/^pas encore\s*[—–-]?\s*/i, '') || null) : where };
    const ref = head.match(/^I(\d+)\b/i);
    if (ref) return { ref: `I${ref[1]}`, ...presence };
    const text = unquote(head.replace(/^\+\s*/, ''));
    return text ? { text: text.slice(0, 500), ...presence } : null;
  }).filter(Boolean);
}

// « - C2 :: pas encore — ce qui manque » / « - C1 :: atteint — où »
function parseCriteriaStatus(block) {
  return bullets(block).map(l => {
    const m = l.match(/^C(\d+)\s*::\s*(.*)$/i);
    if (!m) return null;
    const rest = m[2].trim();
    const met = /^atteint/i.test(rest);
    const note = rest.replace(/^(atteint|pas encore|non atteint)\s*[—–-]?\s*/i, '').trim().slice(0, 300) || null;
    return { ref: `C${m[1]}`, met, note };
  }).filter(Boolean);
}

// « - retouche :: Ajoutez … » / « - equipe :: … » / « - vous :: … » ; « aucune » → []
const STEP_KINDS = { retouche: 'retouche', equipe: 'equipe', 'équipe': 'equipe', vous: 'vous' };
function parseNextSteps(block) {
  return bullets(block).map(l => {
    const m = l.match(/^([a-zé]+)\s*::\s*(.+)$/i);
    const kind = m && STEP_KINDS[m[1].toLowerCase()];
    return kind ? { kind, text: m[2].trim().slice(0, 400) } : null;
  }).filter(Boolean).slice(0, 2);
}

function parseBuilderOutput(text) {
  const raw = String(text || '');
  let content = tag(raw, 'ouvrage');
  if (!content) {
    content = raw.replace(/<(nom|gabarit|resume|suppositions|idees|fini_quand|etat_fini|prochaines_etapes)>[\s\S]*?(<\/\1>|$)/gi, '').trim();
  }
  return {
    name: tag(raw, 'nom').replace(/\s+/g, ' ').slice(0, 120),
    template: tag(raw, 'gabarit').toLowerCase().replace(/[^a-z]/g, ''),
    summary: tag(raw, 'resume'),
    content,
    assumptions: parseAssumptions(tag(raw, 'suppositions')),
    ideas: parseIdeas(tag(raw, 'idees')),
    criteriaStatus: parseCriteriaStatus(tag(raw, 'etat_fini')),
    nextSteps: parseNextSteps(tag(raw, 'prochaines_etapes')),
    criteria: bullets(tag(raw, 'fini_quand')).map(t => t.replace(/^ce sera fini quand\s*/i, '').trim()).filter(Boolean).slice(0, 6),
  };
}

// Parties d'un ouvrage Markdown (« ## Titre ») : pour commenter une partie
function splitSections(markdown) {
  const parts = [];
  let current = { title: null, body: [] };
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const m = line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (m) {
      if (current.title || current.body.join('').trim()) parts.push(current);
      current = { title: m[1], body: [] };
    } else current.body.push(line);
  }
  if (current.title || current.body.join('').trim()) parts.push(current);
  return parts.map(p => ({ title: p.title, body: p.body.join('\n').trim() }));
}

const normalize = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

module.exports = { parseBuilderOutput, parseAssumptions, parseIdeas, parseCriteriaStatus, parseNextSteps, splitSections, normalize };
