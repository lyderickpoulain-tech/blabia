// Secrets chiffrés en base (AES-256-GCM, clé dérivée de JWT_SECRET et d'un usage) : même schéma
// que le jeton Railway (services/railway.js). Un secret illisible (JWT_SECRET changé) donne null.
const crypto = require('crypto');

const keyFor = purpose => crypto.createHash('sha256').update(`${purpose}:${process.env.JWT_SECRET || ''}`).digest();

function seal(purpose, text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyFor(purpose), iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map(b => b.toString('base64url')).join('.');
}

function open(purpose, blob) {
  try {
    const [iv, tag, data] = String(blob || '').split('.').map(s => Buffer.from(s, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', keyFor(purpose), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch { return null; }
}

module.exports = { seal, open };
