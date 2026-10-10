import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// Projet « site web à créer de zéro » : plan type, décisions du registre dans le prompt de
// Claude Code, réunion « outils » guidée par les besoins, guide de mise en place.
const require = createRequire(import.meta.url);
const { WEBSITE_PLAN } = require('../websiteStarter');
const { buildClaudeCodePrompt } = require('../prompts/deliverablePrompts');
const { buildAgentSystemPrompt } = require('../prompts/agentPrompt');
const { formatNeedsForPrompt } = require('../tools/toolNeeds');
const { buildGuidePrompt } = require('../tools/setupGuide');
const { CATEGORIES } = require('../tools/catalog');

describe('plan type d’un site web', () => {
  it('décider d’abord, puis choisir les outils, enfin construire', () => {
    expect(WEBSITE_PLAN.map(m => m.type)).toEqual(['decision', 'decision', 'stack', 'claude_code']);
    expect(WEBSITE_PLAN[2].title).toMatch(/hébergement, nom de domaine/);
  });
});

describe('prompt Claude Code', () => {
  it('reprend les décisions du registre (réunions précédentes) comme contraintes', () => {
    const p = buildClaudeCodePrompt({ session: { task: 'Construire la première version du site' }, githubRepo: 'moi/site',
      registryText: '- Trois pages : accueil, menu, contact\n- Couleurs vert sauge et crème', historyText: '…' }).user;
    expect(p).toContain('Décisions déjà prises pour le projet (registre, réunions précédentes — contraintes obligatoires) :\n- Trois pages : accueil, menu, contact');
    expect(p.indexOf('registre, réunions précédentes')).toBeLessThan(p.indexOf('Génère un prompt'));
    // Sans registre : pas de section vide
    expect(buildClaudeCodePrompt({ session: { task: 'T' }, historyText: '…' }).user).not.toContain('registre, réunions précédentes');
  });
});

describe('réunion « outils »', () => {
  const needs = [
    { category: 'hosting', need: 'Mettre le site en ligne', examples: ['Netlify', 'Vercel'] },
    { category: 'domain', need: 'Une adresse en .fr', examples: [] },
  ];
  const tools = [{ name: 'OVH', category: 'domain', status: 'validated' }, { name: 'Wix', category: 'hosting', status: 'refused' }];

  it('besoins : déjà retenu, ou à demander à l’humain avec des pistes', () => {
    const t = formatNeedsForPrompt(needs, tools);
    expect(t).toContain('Hébergement) — besoin : Mettre le site en ligne — À DEMANDER À L\'HUMAIN (pistes : Netlify, Vercel)');
    expect(t).toContain('besoin : Une adresse en .fr — déjà retenu : OVH');
    expect(formatNeedsForPrompt(null, [])).toBe('');
  });

  it('les agents demandent l’outil de chaque catégorie avant d’en proposer un', () => {
    const blocks = buildAgentSystemPrompt({
      agent: { name: 'Léa', role: 'Dev', systemPrompt: '' }, session: { task: 'Choisir les outils' }, intention: ['stack'], activeAgents: [],
      project: { name: 'Site', brief: 'b' },
      toolReview: { toolCategories: CATEGORIES, userToolsText: '', needsText: formatNeedsForPrompt(needs, tools), toolSuggestionsText: '' },
    });
    const text = JSON.stringify(blocks);
    expect(text).toContain('CATÉGORIES NÉCESSAIRES À CE PROJET');
    expect(text).toContain('demande-lui d\'abord ce qu\'il utilise déjà ou préfère');
  });
});

describe('guide de mise en place', () => {
  it('relie les outils RETENUS, dans l’ordre, avec le dépôt du projet', () => {
    const p = buildGuidePrompt({
      project: { name: 'Salon', githubRepo: 'moi/salon', expertiseLevel: 1 },
      tools: [{ name: 'Netlify', category: 'hosting', status: 'validated' }, { name: 'Wix', category: 'hosting', status: 'refused' }, { name: 'OVH', category: 'domain', status: 'validated' }],
      registryText: '- Site en français seulement',
    }).user;
    expect(p).toContain('Dépôt du code : GitHub moi/salon');
    expect(p).toMatch(/Hébergement\) : Netlify\n/);
    expect(p).not.toContain('Wix');
    expect(p).toContain('Nom de domaine / DNS) : OVH');
    expect(p).toContain('## Vérification finale');
    expect(p).toContain('Explique chaque terme technique'); // maîtrise « découverte »
  });
});
