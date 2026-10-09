// v5.0 phase 4 : lecture/écriture de User.tools et Project.tools.
// Migration des anciennes données (User.techStack, User.toolbox, Project.techStack,
// Session.pendingToolSuggestions) faite en JS à la première lecture : la colonne
// vaut NULL tant qu'elle n'a pas été migrée, puis un tableau (même vide), ce qui
// garantit une migration unique sans écraser les modifications ultérieures.
const { randomUUID } = require('crypto');
const db = require('../../utils/db');
const { parseJsonField } = require('../../utils/parseJsonField');
const {
  CATEGORIES, CATEGORY_IDS, USER_STATUSES, PROJECT_STATUSES, COST_TYPES, findCatalogTool, normalize,
} = require('./catalog');

// Anciennes clés de catégorie (Environnement + Boîte à outils v4) → nouvelles
const LEGACY_CATEGORY = {
  hebergement: 'hosting', hosting: 'hosting',
  bdd: 'database', database: 'database',
  frontend: 'frontend', backend: 'backend', auth: 'auth',
  emails: 'messaging', devtools: 'devtools',
  domaine: 'domain', domain: 'domain',
};
const LEGACY_ALIASES = { ovh: 'ovh-domain', htmlcssvanilla: 'html-css' };
const LEGACY_USER_STATUS = { owned: 'using', planned: 'to_try', evaluating: 'to_try' };

function resolveLegacyTool(nameOrId, legacyCategory) {
  const alias = LEGACY_ALIASES[normalize(nameOrId)];
  const tool = findCatalogTool(alias || nameOrId);
  if (tool) return { catalogId: tool.id, name: tool.name, category: tool.category, cost: { ...tool.cost } };
  return {
    catalogId: null,
    name: String(nameOrId).trim(),
    category: LEGACY_CATEGORY[legacyCategory] || 'devtools',
    cost: null,
  };
}

function pushUnique(list, entry) {
  const key = entry.catalogId || normalize(entry.name);
  if (!key || list.some(t => (t.catalogId || normalize(t.name)) === key)) return;
  list.push(entry);
}

// ── Utilisateur ─────────────────────────────────────────────────────────────

function convertLegacyUserTools(techStack, toolbox) {
  const tools = [];
  const ts = parseJsonField(techStack, {});
  const tb = parseJsonField(toolbox, {});

  // Boîte à outils v4 : { catId: { selected, status }, _custom_catId: [{ id, name }] }
  for (const [key, val] of Object.entries(tb)) {
    if (key.startsWith('_custom_') || !val || typeof val !== 'object' || !val.selected) continue;
    const custom = (tb[`_custom_${key}`] || []).find(t => t.id === val.selected);
    const base = resolveLegacyTool(custom ? custom.name : val.selected, key);
    pushUnique(tools, { id: randomUUID(), ...base, status: LEGACY_USER_STATUS[val.status] || 'using', note: '' });
  }
  // Outils personnalisés non sélectionnés : conservés en "à essayer"
  for (const [key, list] of Object.entries(tb)) {
    if (!key.startsWith('_custom_') || !Array.isArray(list)) continue;
    const catKey = key.slice('_custom_'.length);
    for (const t of list) {
      if (!t?.name) continue;
      pushUnique(tools, { id: randomUUID(), ...resolveLegacyTool(t.name, catKey), status: 'to_try', note: '' });
    }
  }
  // Environnement : { catKey: ['Railway', 'Autre'], catKey_autre: 'Hetzner' }
  for (const [key, val] of Object.entries(ts)) {
    if (!Array.isArray(val) || !LEGACY_CATEGORY[key]) continue;
    for (const item of val) {
      const label = item === 'Autre' ? ts[`${key}_autre`] : item;
      if (!label) continue;
      pushUnique(tools, { id: randomUUID(), ...resolveLegacyTool(label, key), status: 'using', note: '' });
    }
  }
  return tools;
}

async function getUserTools(userId) {
  const [user] = await db('User').select(['tools', 'techStack', 'toolbox']).where({ id: userId }).limit(1);
  if (!user) return null;
  if (user.tools !== null && user.tools !== undefined) return parseJsonField(user.tools, []);
  const tools = convertLegacyUserTools(user.techStack, user.toolbox);
  await db('User').where({ id: userId }).whereNull('tools').update({ tools: JSON.stringify(tools) });
  return tools;
}

function sanitizeCost(cost) {
  if (!cost || typeof cost !== 'object') return null;
  const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Math.max(0, Number(v)));
  return {
    type: COST_TYPES.includes(cost.type) ? cost.type : 'free',
    monthlyMin: num(cost.monthlyMin),
    monthlyMax: num(cost.monthlyMax),
    freeTier: cost.freeTier ? String(cost.freeTier).slice(0, 200) : null,
  };
}

function sanitizeUserTools(list) {
  if (!Array.isArray(list)) return null;
  return list
    .filter(t => t && t.name && String(t.name).trim())
    .slice(0, 200)
    .map(t => ({
      id: typeof t.id === 'string' && t.id ? t.id : randomUUID(),
      catalogId: t.catalogId && findCatalogTool(t.catalogId) ? t.catalogId : null,
      name: String(t.name).trim().slice(0, 100),
      category: CATEGORY_IDS.has(t.category) ? t.category : 'devtools',
      cost: sanitizeCost(t.cost),
      status: USER_STATUSES.includes(t.status) ? t.status : 'using',
      note: t.note ? String(t.note).slice(0, 500) : '',
    }));
}

// ── Projet ──────────────────────────────────────────────────────────────────

function projectEntry(base, extra) {
  return {
    id: randomUUID(),
    catalogId: base.catalogId,
    name: base.name,
    category: base.category,
    origin: 'mine',
    status: 'validated',
    need: '', why: '',
    cost: base.cost,
    priceSource: null,
    sessionId: null,
    ...extra,
  };
}

async function convertLegacyProjectTools(project) {
  const tools = [];
  const ts = parseJsonField(project.techStack, {});

  // v4 : outils effectifs = boîte à outils du propriétaire, sauf surcharges du projet
  if (project.hasTechnicalStack || ts.v4) {
    const [owner] = await db('User').select(['toolbox']).where({ id: project.userId }).limit(1);
    const tb = parseJsonField(owner?.toolbox, {});
    const overrides = ts.v4?.overrides || {};
    const catKeys = new Set([
      ...Object.keys(tb).filter(k => !k.startsWith('_custom_')),
      ...Object.keys(overrides),
    ]);
    for (const catKey of catKeys) {
      const toolId = catKey in overrides ? overrides[catKey] : tb[catKey]?.selected;
      if (!toolId) continue;
      const custom = (tb[`_custom_${catKey}`] || []).find(t => t.id === toolId);
      pushUnique(tools, projectEntry(resolveLegacyTool(custom ? custom.name : toolId, catKey)));
    }
  }
  // Ancien format par listes (projets non techniques / historiques)
  for (const [key, val] of Object.entries(ts)) {
    if (!Array.isArray(val) || !LEGACY_CATEGORY[key]) continue;
    for (const item of val) {
      const label = item === 'Autre' ? ts[`${key}_autre`] : item;
      if (label) pushUnique(tools, projectEntry(resolveLegacyTool(label, key)));
    }
  }
  // Outils signalés par les agents ([NEED_TOOL] v4) → complémentaires à valider
  const sessions = await db('Session').select(['id', 'pendingToolSuggestions'])
    .where({ projectId: project.id }).whereNotNull('pendingToolSuggestions');
  for (const s of sessions) {
    for (const t of parseJsonField(s.pendingToolSuggestions, [])) {
      if (!t?.label && !t?.name) continue;
      pushUnique(tools, projectEntry(resolveLegacyTool(t.label || t.name, t.category), {
        origin: 'complementary', status: 'suggested', why: t.reason || '', sessionId: s.id,
      }));
    }
  }
  return tools;
}

async function getProjectTools(project) {
  if (project.tools !== null && project.tools !== undefined) return parseJsonField(project.tools, []);
  const tools = await convertLegacyProjectTools(project);
  await db('Project').where({ id: project.id }).whereNull('tools').update({ tools: JSON.stringify(tools) });
  return tools;
}

function sanitizeProjectTools(list) {
  if (!Array.isArray(list)) return null;
  return list
    .filter(t => t && t.name && String(t.name).trim())
    .slice(0, 200)
    .map(t => ({
      id: typeof t.id === 'string' && t.id ? t.id : randomUUID(),
      catalogId: t.catalogId && findCatalogTool(t.catalogId) ? t.catalogId : null,
      name: String(t.name).trim().slice(0, 100),
      category: CATEGORY_IDS.has(t.category) ? t.category : 'devtools',
      origin: t.origin === 'complementary' ? 'complementary' : 'mine',
      status: PROJECT_STATUSES.includes(t.status) ? t.status : 'suggested',
      need: t.need ? String(t.need).slice(0, 300) : '',
      why: t.why ? String(t.why).slice(0, 500) : '',
      cost: sanitizeCost(t.cost),
      priceSource: typeof t.priceSource === 'string' && /^https?:\/\//.test(t.priceSource) ? t.priceSource.slice(0, 500) : null,
      sessionId: typeof t.sessionId === 'string' ? t.sessionId : null,
      warning: t.warning ? String(t.warning).slice(0, 500) : null,
    }));
}

// Coût mensuel estimé : somme des fourchettes des outils retenus (statut validé)
function monthlyTotal(tools) {
  let min = 0, max = 0;
  for (const t of tools) {
    if (t.status !== 'validated' || !t.cost) continue;
    min += t.cost.monthlyMin || 0;
    max += t.cost.monthlyMax ?? t.cost.monthlyMin ?? 0;
  }
  return { min, max };
}

// Texte injecté dans les prompts (agents, export, livrable Claude Code)
function formatProjectToolsForPrompt(tools) {
  const kept = tools.filter(t => t.status === 'validated');
  if (kept.length === 0) return '';
  const byCat = new Map();
  for (const t of kept) {
    if (!byCat.has(t.category)) byCat.set(t.category, []);
    byCat.get(t.category).push(t.name);
  }
  return CATEGORIES
    .filter(c => byCat.has(c.id))
    .map(c => `- ${c.label} (${c.technical}) : ${byCat.get(c.id).join(', ')}`)
    .join('\n');
}

// ── Réunion de type stack : outils proposés via [NEED_TOOL] ─────────────────

// Entrée stockée dans Session.pendingToolSuggestions à partir du marqueur parsé
function toolSuggestionFromMarker(neededTool, agentName) {
  const known = findCatalogTool(neededTool.name);
  const hasAgentCost = neededTool.costMin !== null || neededTool.costMax !== null;
  let cost;
  if (hasAgentCost) {
    const min = neededTool.costMin ?? 0;
    const max = neededTool.costMax ?? min;
    cost = { type: max === 0 ? 'free' : (min === 0 ? 'freemium' : 'subscription'), monthlyMin: min, monthlyMax: max, freeTier: neededTool.freeTier || null };
  } else {
    cost = known ? { ...known.cost } : null;
  }
  return {
    id: randomUUID(),
    catalogId: known ? known.id : null,
    name: known ? known.name : neededTool.name.slice(0, 100),
    category: CATEGORY_IDS.has(neededTool.category) ? neededTool.category : (known ? known.category : 'devtools'),
    need: String(neededTool.need || '').slice(0, 300),
    why: String(neededTool.why || '').slice(0, 500),
    cost,
    priceSource: neededTool.priceSource || null,
    agentName,
    timestamp: new Date().toISOString(),
  };
}

// Max 15 par réunion, dédoublonnage par nom. Retourne true si stockée.
async function appendToolSuggestion(sessionId, entry) {
  const [row] = await db('Session').select('pendingToolSuggestions').where({ id: sessionId });
  const existing = parseJsonField(row?.pendingToolSuggestions, []);
  if (existing.length >= 15) return false;
  if (existing.some(t => normalize(t.name || t.label) === normalize(entry.name))) return false;
  await db.raw(
    `UPDATE "Session" SET "pendingToolSuggestions" = COALESCE("pendingToolSuggestions", '[]'::jsonb) || ?::jsonb WHERE id = ?`,
    [JSON.stringify([entry]), sessionId]
  );
  return true;
}

function formatUserToolsForPrompt(tools) {
  const STATUS = { using: 'utilisé', account: 'compte ouvert', to_try: 'à essayer' };
  return tools.map(t => `- ${t.name} (${CATEGORIES.find(c => c.id === t.category)?.label || t.category}, ${STATUS[t.status] || t.status})`).join('\n');
}

module.exports = {
  getUserTools, sanitizeUserTools, getProjectTools, sanitizeProjectTools,
  convertLegacyUserTools, convertLegacyProjectTools, monthlyTotal, formatProjectToolsForPrompt,
  formatUserToolsForPrompt, toolSuggestionFromMarker, appendToolSuggestion, sanitizeCost,
};
