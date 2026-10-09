import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { convertLegacyUserTools, sanitizeUserTools, sanitizeProjectTools, monthlyTotal, formatProjectToolsForPrompt } = require('../tools/toolsStore');
const { findCatalogTool, CATEGORIES, CATEGORY_LINKS } = require('../tools/catalog');
const { applyNeedsAnalysis, parseAnalysis } = require('../tools/toolNeeds');

describe('analyse des besoins en outils', () => {
  const userTools = [
    { id: 'u1', name: 'Railway', catalogId: 'railway', category: 'hosting', cost: { type: 'usage', monthlyMin: 5, monthlyMax: 20 } },
    { id: 'u2', name: 'SQLite', catalogId: 'sqlite', category: 'database', cost: { type: 'free', monthlyMin: 0, monthlyMax: 0 } },
  ];

  it('nettoie la réponse du modèle (catégorie inconnue, doublon, id inventé)', () => {
    const needs = parseAnalysis('```json\n{"needs":[' +
      '{"category":"hosting","need":"Mettre en ligne","userToolId":"u1","fit":"ok","warning":null,"examples":[]},' +
      '{"category":"hosting","need":"doublon","userToolId":"u1","fit":"ok"},' +
      '{"category":"inconnue","need":"x"},' +
      '{"category":"messaging","need":"Emails","userToolId":"inventé","fit":"ok","warning":"Il faut envoyer des confirmations","examples":["Resend"]}' +
      ']}\n```', userTools);
    expect(needs.map(n => n.category)).toEqual(['hosting', 'messaging']);
    expect(needs[1]).toMatchObject({ userToolId: null, fit: 'none', warning: 'Il faut envoyer des confirmations' });
  });

  it('pré-remplit : adapté → validé, pas adapté → suggéré avec avertissement, manquant → rien', () => {
    const needs = [
      { category: 'hosting', need: 'Mettre en ligne', userToolId: 'u1', fit: 'ok', warning: null, examples: [] },
      { category: 'database', need: 'Plusieurs utilisateurs en même temps', userToolId: 'u2', fit: 'unsuited', warning: 'SQLite ne gère pas bien les écritures simultanées', examples: ['PostgreSQL'] },
      { category: 'messaging', need: 'Emails', userToolId: null, fit: 'none', warning: 'Il faut envoyer des emails', examples: ['Resend'] },
    ];
    const { tools, needs: stored } = applyNeedsAnalysis([], userTools, needs);
    expect(tools.map(t => `${t.name}/${t.status}/${t.warning ? 'warn' : '-'}`)).toEqual(['Railway/validated/-', 'SQLite/suggested/warn']);
    expect(stored[0]).not.toHaveProperty('userToolId');
  });

  it('ne remplace pas un outil déjà choisi par l\'humain, rafraîchit seulement l\'avertissement', () => {
    const existing = [{ id: 'p1', name: 'Vercel', catalogId: 'vercel', category: 'hosting', status: 'validated', origin: 'mine' }];
    const { tools } = applyNeedsAnalysis(existing, userTools, [{ category: 'hosting', need: 'x', userToolId: 'u1', fit: 'ok' }]);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('Vercel');
  });
});

describe('catalogue', () => {
  it('reconnaît les anciens noms approximatifs', () => {
    expect(findCatalogTool('Node.js/Express')?.id).toBe('node-express');
    expect(findCatalogTool('vue.js')?.id).toBe('vue');
    expect(findCatalogTool('next.js')?.id).toBe('nextjs');
    expect(findCatalogTool('JWT maison')?.id).toBe('jwt-custom');
    expect(findCatalogTool('inconnu')).toBeNull();
  });

  it('a 16 catégories et des liens qui pointent vers des catégories existantes', () => {
    expect(CATEGORIES).toHaveLength(16);
    const ids = new Set(['user', ...CATEGORIES.map(c => c.id)]);
    for (const [a, b] of CATEGORY_LINKS) {
      expect(ids.has(a)).toBe(true);
      expect(ids.has(b)).toBe(true);
    }
  });
});

describe('migration des anciens outils utilisateur', () => {
  it('fusionne Boîte à outils v4 et Environnement sans doublon', () => {
    const toolbox = {
      hosting: { selected: 'railway', status: 'owned' },
      database: { selected: 'postgresql', status: 'planned' },
      devtools: { selected: 'c123', status: 'evaluating' },
      _custom_devtools: [{ id: 'c123', name: 'Zed' }, { id: 'c456', name: 'Warp' }],
    };
    const techStack = {
      hebergement: ['Railway', 'Autre'], hebergement_autre: 'Hetzner',
      domaine: ['OVH'],
      frontend: ['HTML/CSS vanilla'],
    };
    const tools = convertLegacyUserTools(techStack, toolbox);
    const byName = Object.fromEntries(tools.map(t => [t.name, t]));

    expect(byName['Railway']).toMatchObject({ catalogId: 'railway', category: 'hosting', status: 'using' });
    expect(byName['PostgreSQL']).toMatchObject({ status: 'to_try' });
    expect(byName['Zed']).toMatchObject({ catalogId: null, category: 'devtools', status: 'to_try' });
    expect(byName['Warp']).toMatchObject({ status: 'to_try' });
    expect(byName['Hetzner']).toMatchObject({ catalogId: 'hetzner', status: 'using' });
    expect(byName['OVH (domaine)']).toMatchObject({ category: 'domain' });
    expect(byName['HTML / CSS']).toMatchObject({ category: 'frontend' });
    expect(tools.filter(t => t.catalogId === 'railway')).toHaveLength(1);
  });

  it('accepte des données vides ou en chaîne JSON', () => {
    expect(convertLegacyUserTools(null, null)).toEqual([]);
    expect(convertLegacyUserTools('{"bdd":["MySQL"]}', '{}')[0]).toMatchObject({ catalogId: 'mysql' });
  });
});

describe('validation des listes', () => {
  it('nettoie les entrées utilisateur', () => {
    const [t] = sanitizeUserTools([{ name: '  Figma ', category: 'inconnue', status: 'bof', cost: { type: 'x', monthlyMin: '-3' } }]);
    expect(t).toMatchObject({ name: 'Figma', category: 'devtools', status: 'using', cost: { type: 'free', monthlyMin: 0 } });
    expect(t.id).toBeTruthy();
    expect(sanitizeUserTools('pas un tableau')).toBeNull();
  });

  it('refuse les sources de prix non http', () => {
    const [t] = sanitizeProjectTools([{ name: 'X', priceSource: 'javascript:alert(1)' }]);
    expect(t.priceSource).toBeNull();
    expect(t.status).toBe('suggested');
  });

  it('total mensuel : seulement les outils validés', () => {
    const total = monthlyTotal([
      { status: 'validated', cost: { monthlyMin: 5, monthlyMax: 20 } },
      { status: 'validated', cost: { monthlyMin: 0, monthlyMax: null } },
      { status: 'suggested', cost: { monthlyMin: 100, monthlyMax: 200 } },
    ]);
    expect(total).toEqual({ min: 5, max: 20 });
  });

  it('formate les outils validés pour les prompts, par catégorie', () => {
    const txt = formatProjectToolsForPrompt([
      { name: 'React', category: 'frontend', status: 'validated' },
      { name: 'Stripe', category: 'payment', status: 'refused' },
    ]);
    expect(txt).toContain('React');
    expect(txt).not.toContain('Stripe');
  });
});
