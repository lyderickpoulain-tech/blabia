import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { checkSite } = require('../plus/siteChecks');

const file = (path, body) => ({ path, content: Buffer.from(body) });
const page = (title, body) => `<!doctype html><html lang="fr"><head><title>${title}</title><meta name="description" content="x"></head><body>${body}</body></html>`;

describe('BlabIA + : contrôle avant mise en ligne', () => {
  it('un site complet et propre ne lève aucun point', () => {
    const r = checkSite([
      file('index.html', page('Accueil', '<a href="mentions-legales.html">Mentions légales</a><a href="https://exemple.fr" target="_blank" rel="noopener noreferrer">x</a>')),
      file('mentions-legales.html', page('Mentions légales', '<h1>Mentions légales</h1><p>Éditeur : Gérard Martin</p>')),
      file('site.js', 'document.querySelector("p").textContent = "ok";'),
    ]);
    expect(r).toEqual([]);
  });

  it('repère ce que la loi impose et ce qui expose le site', () => {
    const r = checkSite([
      file('index.html', page('Accueil', '<form action="https://collecte.example.com/x"><input name="email"></form><img src="https://cdn.example.com/a.png"><a href="http://vieux.fr" target="_blank">x</a><script async src="https://www.googletagmanager.com/gtag/js"></script>')),
      file('mentions-legales.html', page('Mentions légales', '<h1>Mentions légales</h1><p>Nom : [à compléter]</p>')),
      file('site.js', 'const apiKey = "sk-ant-abcdefghijklmnopqrstuvwxyz"; el.innerHTML = x; eval(y);'),
    ]);
    const texts = r.map(x => x.text).join('\n');
    expect(r[0].level).toBe('important'); // les points importants d'abord
    expect(texts).toMatch(/« à compléter »/);
    expect(texts).toMatch(/formulaire mais pas de page/);
    expect(texts).toMatch(/sans demander l’accord des visiteurs/);
    expect(texts).toMatch(/site\.js\) semble contenir une clé d’accès/);
    expect(texts).toMatch(/instructions dangereuses/);
    expect(texts).toMatch(/innerHTML|comme du code HTML/);
    expect(texts).toMatch(/cdn\.example\.com/);
    expect(texts).toMatch(/nouvel onglet sans la protection/);
    expect(texts).toMatch(/http:\/\//);
    expect(texts).toMatch(/envoie les informations des visiteurs vers un autre site/);
    expect(r.every(x => x.fix && ['loi', 'sécurité', 'référencement'].includes(x.topic))).toBe(true);
  });

  it('sans page de mentions légales, et pages sans titre ni description', () => {
    const r = checkSite([file('index.html', '<html><body><h1>Accueil</h1></body></html>')]);
    expect(r.map(x => x.text).join('\n')).toMatch(/Il manque la page « Mentions légales »/);
    expect(r.some(x => x.topic === 'référencement')).toBe(true);
  });
});
