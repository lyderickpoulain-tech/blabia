// Secrets chiffrés en base (AES-256-GCM, une clé par usage : clé API Anthropic, jeton Railway…).
//
// v6 (15/11/2026) : la clé vient de SECRETS_ENCRYPTION_KEY, indépendante de JWT_SECRET.
// Avant, elle était dérivée de JWT_SECRET : changer ce secret (rotation après l'incident
// Railway du 21/10/2026) rendait illisibles toutes les clés enregistrées.
// - Nouveau format : « v2.iv.tag.data » (clé HKDF de SECRETS_ENCRYPTION_KEY et de l'usage).
// - Ancien format : « iv.tag.data » (clé sha256(usage:JWT_SECRET)), lu en repli.
// - Sans SECRETS_ENCRYPTION_KEY, tout reste à l'ancien format (rien ne casse).
// Un secret lu à l'ancien format alors que la clé dédiée existe est « stale » : l'appelant le
// réenregistre aussitôt (openFresh), sans aucun script à lancer.
const crypto = require('crypto');

const V2 = 'v2';
const masterKey = () => process.env.SECRETS_ENCRYPTION_KEY || '';
const legacyKey = purpose => crypto.createHash('sha256').update(`${purpose}:${process.env.JWT_SECRET || ''}`).digest();
const v2Key = purpose => Buffer.from(crypto.hkdfSync('sha256', masterKey(), 'blabia-secretbox', purpose, 32));

const b64 = b => b.toString('base64url');

function seal(purpose, text) {
  const v2 = !!masterKey();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', v2 ? v2Key(purpose) : legacyKey(purpose), iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  const parts = [iv, c.getAuthTag(), data].map(b64);
  return (v2 ? [V2, ...parts] : parts).join('.');
}

function decryptWith(key, [iv, tag, data]) {
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
  } catch { return null; }
}

// { text, stale } : text null si illisible ; stale = à réenregistrer avec la clé dédiée.
function read(purpose, blob) {
  const parts = String(blob || '').split('.');
  if (parts[0] === V2 && parts.length === 4) {
    return { text: masterKey() ? decryptWith(v2Key(purpose), parts.slice(1)) : null, stale: false };
  }
  if (parts.length !== 3) return { text: null, stale: false };
  const text = decryptWith(legacyKey(purpose), parts);
  return { text, stale: text !== null && !!masterKey() };
}

const open = (purpose, blob) => read(purpose, blob).text;

// Lit un secret et, s'il est encore à l'ancien format, le rechiffre aussitôt :
// rewrite(nouveauBlob) l'enregistre. Un échec d'écriture ne bloque pas la lecture.
async function openFresh(purpose, blob, rewrite) {
  const { text, stale } = read(purpose, blob);
  if (stale) {
    try { await rewrite(seal(purpose, text)); }
    catch (err) { console.error(`[secretBox] rechiffrement « ${purpose} » impossible :`, err.message); }
  }
  return text;
}

module.exports = { seal, open, read, openFresh };
