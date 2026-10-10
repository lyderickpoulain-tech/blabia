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

describe('structure réelle du dépôt (guide et discussion)', () => {
  const github = require('../github');
  const { repoOverview, formatOverview } = require('../repoOverview');
  const b64 = s => Buffer.from(s).toString('base64');
  // Cas réel du « Site de numérologie » : README à la racine, l'appli dans client/ et server/
  const tree = {
    '': [{ name: 'README.md', type: 'file' }, { name: 'client', type: 'dir' }, { name: 'server', type: 'dir' }, { name: 'supabase', type: 'dir' }, { name: '.github', type: 'dir' }],
    client: [{ name: 'package.json', type: 'file' }, { name: 'vite.config.js', type: 'file' }, { name: '.env.example', type: 'file' }, { name: 'src', type: 'dir' }],
    server: [{ name: 'package.json', type: 'file' }, { name: '.env.example', type: 'file' }],
  };
  const files = {
    'client/package.json': JSON.stringify({ name: 'numvibe-client', scripts: { dev: 'vite', build: 'vite build' }, dependencies: { react: '19' }, devDependencies: { vite: '8' } }),
    'client/.env.example': 'VITE_SUPABASE_URL=\nVITE_SUPABASE_ANON_KEY=\n# commentaire\n',
    'server/package.json': JSON.stringify({ name: 'numvibe-server', scripts: { start: 'node src/index.js' }, dependencies: { express: '5' } }),
    'server/.env.example': 'SUPABASE_SERVICE_KEY=\nANTHROPIC_API_KEY=\nCLIENT_URL=http://localhost:5173\n',
  };

  it('repère les parties à déployer, leurs scripts et les NOMS des variables', async () => {
    const real = github.gh;
    github.gh = async (_inst, _m, path) => {
      const p = decodeURIComponent(path.replace(/^\/repos\/moi\/site\/contents\/?/, ''));
      if (tree[p]) return tree[p];
      if (files[p]) return { content: b64(files[p]) };
      throw Object.assign(new Error('Not Found'), { status: 404 });
    };
    try {
      const o = await repoOverview('77', 'moi/site');
      expect(o.parts.map(p => p.dir)).toEqual(['client', 'server']); // supabase et .github ignorés
      expect(o.parts[0]).toMatchObject({ frameworks: ['vite'], configs: ['vite.config.js'], envNames: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] });
      const text = formatOverview('moi/site', o);
      expect(text).toContain('fichiers README.md');
      expect(text).toContain('Partie « server » (numvibe-server) — express — scripts : start = « node src/index.js »');
      expect(text).toContain('UN SERVICE PAR PARTIE, avec le « dossier racine » (Root Directory) réglé sur /client ou /server');
      expect(text).not.toContain('localhost'); // jamais de valeur, seulement les noms
    } finally { github.gh = real; }
  });

  it('le guide suit la structure réelle et reprend les problèmes rencontrés', () => {
    const p = buildGuidePrompt({
      project: { name: 'Numérologie', githubRepo: 'moi/site' }, tools: [{ name: 'Railway', category: 'hosting', status: 'validated' }],
      repoText: 'Partie « client » — vite', chat: [{ role: 'user', content: 'The build failed because the repo root only contains a README' }, { role: 'assistant', content: 'Root Directory : /client' }],
    }).user;
    expect(p).toContain('STRUCTURE RÉELLE DU DÉPÔT');
    expect(p).toContain('HUMAIN : The build failed');
    expect(p).toContain('## En cas d\'erreur');
    expect(p).toContain('Root Directory');
  });

  it('discussion : message d’erreur traité avec le guide et le dépôt ; le code passe par Claude Code', () => {
    const { buildGuideChatPrompt } = require('../tools/setupGuide');
    const p = buildGuideChatPrompt({ project: { name: 'N', githubRepo: 'moi/site' }, tools: [], repoText: 'Partie « client »', guide: '## Étape 1', message: 'Erreur Railway' }).user;
    expect(p).toContain('NOUVEAU MESSAGE DE L\'HUMAIN');
    expect(p).toContain('## Étape 1');
    expect(p).toContain('réunion Claude Code');
    expect(p).toContain('Correction du guide');
  });

  it('prompt Claude Code : code déployable tel quel et section « Déploiement » du README', () => {
    const p = buildClaudeCodePrompt({ session: { task: 'Site' }, githubRepo: 'moi/site', stackLines: ['- Hébergement : Railway'], historyText: '…' }).user;
    expect(p).toContain('déployable TELLE QUELLE chez cet hébergeur');
    expect(p).toContain('section « Déploiement »');
  });
});
