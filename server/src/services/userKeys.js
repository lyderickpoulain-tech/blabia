// « Apportez votre clé API » (v5.1, 17/10/2026) : l'IA d'un projet est facturée sur la clé
// Anthropic de son propriétaire s'il en a renseigné une (Profil) ; sans clé, ou si elle ne
// fonctionne plus, la clé de BlabIA prend le relais (services/anthropic.js).
// Un abonnement Claude (Pro, Max) ne peut pas servir ici : Anthropic réserve ses jetons à
// Claude.ai et Claude Code ; un service comme BlabIA doit passer par une clé API.
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../utils/db');
const { seal, open } = require('../utils/secretBox');

const PURPOSE = 'anthropic-key';
const KEY_RE = /^sk-ant-[A-Za-z0-9_-]{20,}$/;
const CACHE_MS = 60 * 1000;           // clé relue au plus une fois par minute et par personne
const NO_CREDIT_RETRY_MS = 60 * 60 * 1000; // crédit épuisé : nouvel essai au bout d'une heure

const owners = new Map();   // projectId → userId (le propriétaire ne change pas)
const keys = new Map();     // userId → { apiKey, status, checkedAt, at }
const clients = new Map();  // apiKey → client Anthropic

function clientFor(apiKey) {
  if (!clients.has(apiKey)) clients.set(apiKey, new Anthropic({ apiKey, maxRetries: 1 }));
  return clients.get(apiKey);
}

async function ownerOf(projectId) {
  if (!owners.has(projectId)) {
    const p = await db('Project').where({ id: projectId }).select('userId').first();
    if (!p) return null;
    owners.set(projectId, p.userId);
  }
  return owners.get(projectId);
}

async function keyOf(userId) {
  const hit = keys.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  const u = await db('User').where({ id: userId })
    .select('anthropicApiKey', 'anthropicKeyStatus', 'anthropicKeyCheckedAt').first();
  const entry = {
    apiKey: u?.anthropicApiKey ? open(PURPOSE, u.anthropicApiKey) : null,
    status: u?.anthropicKeyStatus || null,
    checkedAt: u?.anthropicKeyCheckedAt ? new Date(u.anthropicKeyCheckedAt).getTime() : 0,
    at: Date.now(),
  };
  keys.set(userId, entry);
  return entry;
}

const usable = k => !!k?.apiKey && k.status !== 'invalid'
  && !(k.status === 'no_credit' && Date.now() - k.checkedAt < NO_CREDIT_RETRY_MS);

// Clé à utiliser pour un appel, d'après le contexte de la requête (services/usage.js) :
// celle du propriétaire du projet ; hors projet, celle de la personne connectée.
async function resolve(ctx) {
  if (!ctx) return null;
  const userId = ctx.projectId ? await ownerOf(ctx.projectId) : (ctx.req?.user?.id || ctx.userId || null);
  if (!userId) return null;
  const k = await keyOf(userId);
  return usable(k) ? { userId, apiKey: k.apiKey } : null;
}

// Erreur de la clé du porteur → bascule sur la clé BlabIA ?
// invalid / no_credit : mémorisés ; rate_limited / unsupported : pour cet appel seulement.
// Panne d'Anthropic (5xx) ou demande interrompue : pas de bascule, l'erreur remonte.
function classify(err) {
  const status = err?.status;
  const msg = String(err?.error?.error?.message || err?.message || '');
  if (status === 401 || status === 403) return 'invalid';
  if (status === 402 || (status === 400 && /credit balance|billing|purchase credits|insufficient/i.test(msg))) return 'no_credit';
  if (status === 429) return 'rate_limited';
  if (status === 400 || status === 404) return 'unsupported'; // modèle, bêta ou recherche web absents de son compte
  return null;
}

async function markKey(userId, status, error = null) {
  const persistent = status === 'ok' || status === 'invalid' || status === 'no_credit';
  if (!persistent) return;
  await db('User').where({ id: userId }).update({
    anthropicKeyStatus: status, anthropicKeyError: error ? String(error).slice(0, 300) : null, anthropicKeyCheckedAt: new Date(),
  });
  keys.delete(userId);
}

// Vérification à l'enregistrement : un appel minuscule au modèle le moins cher
async function testKey(apiKey, params) {
  try {
    await new Anthropic({ apiKey, maxRetries: 0 }).messages.create(params);
    return { status: 'ok' };
  } catch (err) {
    const verdict = classify(err);
    return { status: verdict === 'invalid' || verdict === 'no_credit' ? verdict : verdict ? 'ok' : 'error', error: err?.error?.error?.message || err?.message };
  }
}

async function saveKey(userId, apiKey, { status, error = null }) {
  await db('User').where({ id: userId }).update({
    anthropicApiKey: seal(PURPOSE, apiKey), anthropicKeyLast4: apiKey.slice(-4),
    anthropicKeyStatus: status, anthropicKeyError: error ? String(error).slice(0, 300) : null, anthropicKeyCheckedAt: new Date(),
  });
  keys.delete(userId);
}

async function removeKey(userId) {
  await db('User').where({ id: userId }).update({
    anthropicApiKey: null, anthropicKeyLast4: null, anthropicKeyStatus: null, anthropicKeyError: null, anthropicKeyCheckedAt: null,
  });
  keys.delete(userId);
}

module.exports = { KEY_RE, resolve, classify, markKey, clientFor, testKey, saveKey, removeKey };
