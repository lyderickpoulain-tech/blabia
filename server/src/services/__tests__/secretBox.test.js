import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { seal, open, read, openFresh } = require('../../utils/secretBox');

const saved = { jwt: process.env.JWT_SECRET, key: process.env.SECRETS_ENCRYPTION_KEY };
const setEnv = (jwt, key) => {
  process.env.JWT_SECRET = jwt;
  if (key === undefined) delete process.env.SECRETS_ENCRYPTION_KEY; else process.env.SECRETS_ENCRYPTION_KEY = key;
};

describe('secretBox (clé de chiffrement séparée, v6)', () => {
  beforeEach(() => setEnv('jwt-1', undefined));
  afterAll(() => setEnv(saved.jwt, saved.key));

  it('sans clé dédiée : ancien format, dérivé de JWT_SECRET (rien ne change)', () => {
    const blob = seal('anthropic-key', 'sk-ant-xyz');
    expect(blob.split('.')).toHaveLength(3);
    expect(open('anthropic-key', blob)).toBe('sk-ant-xyz');
    setEnv('jwt-2', undefined);
    expect(open('anthropic-key', blob)).toBeNull();
  });

  it('avec clé dédiée : nouveau format, indépendant de JWT_SECRET', () => {
    setEnv('jwt-1', 'cle-dediee');
    const blob = seal('anthropic-key', 'sk-ant-xyz');
    expect(blob.startsWith('v2.')).toBe(true);
    setEnv('jwt-2', 'cle-dediee');
    expect(open('anthropic-key', blob)).toBe('sk-ant-xyz');
    expect(open('railway', blob)).toBeNull(); // une clé par usage
    setEnv('jwt-2', 'autre-cle');
    expect(open('anthropic-key', blob)).toBeNull();
    setEnv('jwt-2', undefined);
    expect(open('anthropic-key', blob)).toBeNull();
  });

  it('ancien secret lu en repli, signalé à rechiffrer', () => {
    const old = seal('railway', 'refresh-1');
    setEnv('jwt-1', 'cle-dediee');
    expect(read('railway', old)).toEqual({ text: 'refresh-1', stale: true });
    expect(read('railway', seal('railway', 'refresh-1')).stale).toBe(false);
  });

  it('openFresh rechiffre à la première lecture réussie, une seule fois', async () => {
    const old = seal('anthropic-key', 'sk-ant-xyz');
    setEnv('jwt-1', 'cle-dediee');
    let stored = old;
    const rewrite = async blob => { stored = blob; };
    expect(await openFresh('anthropic-key', stored, rewrite)).toBe('sk-ant-xyz');
    expect(stored.startsWith('v2.')).toBe(true);
    const after = stored;
    expect(await openFresh('anthropic-key', stored, rewrite)).toBe('sk-ant-xyz');
    expect(stored).toBe(after);
    // JWT_SECRET peut maintenant changer sans rien perdre
    setEnv('jwt-2', 'cle-dediee');
    expect(open('anthropic-key', stored)).toBe('sk-ant-xyz');
  });

  it('openFresh : un échec d’écriture ne bloque pas la lecture ; illisible → null sans écriture', async () => {
    const old = seal('anthropic-key', 'sk-ant-xyz');
    setEnv('jwt-1', 'cle-dediee');
    const err = console.error; console.error = () => {};
    try {
      expect(await openFresh('anthropic-key', old, async () => { throw new Error('base indisponible'); })).toBe('sk-ant-xyz');
    } finally { console.error = err; }
    let called = false;
    setEnv('jwt-2', 'cle-dediee');
    expect(await openFresh('anthropic-key', old, async () => { called = true; })).toBeNull();
    expect(called).toBe(false);
    expect(open('anthropic-key', null)).toBeNull();
    expect(open('anthropic-key', 'n.importe.quoi')).toBeNull();
  });
});
