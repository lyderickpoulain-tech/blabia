import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// Réunion Claude Code : les agents voient le code du dépôt (cas réel : « Le menu Plan d'un
// projet ne respecte pas la charte graphique » — sans le code, ils demandaient ce qu'est le menu Plan).
const require = createRequire(import.meta.url);
const github = require('../github');
const anthropic = require('../anthropic');
const { buildCodeContext, compactTree, keywordPick } = require('../codeContext');
const { buildAgentSystemPrompt } = require('../prompts/agentPrompt');

const TASK = 'Le menu "Plan" d\'un projet ne respecte pas la charte graphique du site. Reprenons cela';
const PATHS = [
  'CLAUDE.md', 'README.md', 'client/package-lock.json', 'client/node_modules/x/index.js', 'client/src/App.jsx',
  'client/src/components/project/ProjectShell.jsx', 'client/src/pages/project/ProjectPlan.jsx',
  'client/src/index.css', 'client/tailwind.config.js', 'client/public/logo.png', 'server/src/routes/plan.js',
];
const FILES = {
  'CLAUDE.md': 'Toujours répondre en français.',
  'README.md': '# BlabIA',
  'client/src/components/project/ProjectShell.jsx': "const NAV = [{ to: 'reunions', label: 'Plan' }];",
  'client/src/pages/project/ProjectPlan.jsx': '<div className="bg-blue-500">Plan des réunions</div>',
  'client/tailwind.config.js': 'colors: { action: "#3b5bdb" }',
};

function stubGitHub() {
  const real = github.gh;
  github.gh = async (_inst, _m, path) => {
    if (path === '/repos/moi/blabia') return { default_branch: 'main' };
    if (path.startsWith('/repos/moi/blabia/git/trees/main')) return { tree: PATHS.map(p => ({ path: p, type: 'blob' })) };
    const file = decodeURIComponent(path.replace('/repos/moi/blabia/contents/', ''));
    if (FILES[file]) return { content: Buffer.from(FILES[file]).toString('base64') };
    throw Object.assign(new Error('Not Found'), { status: 404 });
  };
  return () => { github.gh = real; };
}

describe('contexte de code d’une réunion Claude Code', () => {
  it('arborescence compacte, sans dépendances ni fichiers de verrouillage ni images', async () => {
    expect(compactTree(['a.js', 'client/src/App.jsx', 'client/src/main.jsx'])).toBe('./ : a.js\nclient/src/ : App.jsx, main.jsx');
    expect(keywordPick(TASK, PATHS)).toEqual(['client/src/pages/project/ProjectPlan.jsx', 'server/src/routes/plan.js']);
  });

  it('les fichiers choisis par le modèle léger sont lus ; chemins inventés écartés', async () => {
    const restore = stubGitHub();
    const realCreate = anthropic.messages.create;
    let asked = null;
    anthropic.messages.create = async params => {
      asked = params;
      return { content: [{ type: 'text', text: '["client/src/components/project/ProjectShell.jsx","client/src/pages/project/ProjectPlan.jsx","invente.js","client/tailwind.config.js"]' }] };
    };
    try {
      const text = await buildCodeContext('77', 'moi/blabia', TASK);
      expect(asked.model).toMatch(/haiku/);
      expect(asked.messages[0].content).toContain('client/src/pages/project/ProjectPlan.jsx');
      expect(asked.messages[0].content).not.toContain('node_modules');
      expect(text).toContain('client/src/components/project/ : ProjectShell.jsx');
      expect(text).toContain('CLAUDE.md :\nToujours répondre en français.');
      expect(text).toContain("--- client/src/components/project/ProjectShell.jsx ---\nconst NAV = [{ to: 'reunions', label: 'Plan' }];");
      expect(text).toContain('--- client/tailwind.config.js ---');
      expect(text).not.toContain('invente.js');
      expect(text).not.toContain('package-lock');

      // Modèle injoignable : repli sur les mots de l'objectif
      anthropic.messages.create = async () => { throw new Error('panne'); };
      expect(await buildCodeContext('77', 'moi/blabia', TASK)).toContain('--- client/src/pages/project/ProjectPlan.jsx ---');
    } finally {
      restore();
      anthropic.messages.create = realCreate;
    }
  });

  it('dans le bloc commun (mis en cache) du prompt, avec la consigne de ne pas demander ce que le code montre', () => {
    const blocks = buildAgentSystemPrompt({
      agent: { name: 'Léa', role: 'Designer', systemPrompt: '' }, session: { task: TASK }, intention: ['claude_code'], activeAgents: [],
      project: { name: 'BlabIA', brief: 'b', githubRepo: 'moi/blabia' }, codeText: "--- ProjectShell.jsx ---\nlabel: 'Plan'",
    });
    const shared = blocks.find(b => b.cache_control);
    expect(shared.text).toContain('CODE DU PROJET');
    expect(shared.text).toContain("label: 'Plan'");
    expect(shared.text).toContain('ne demande JAMAIS à l\'humain ce que le code montre');
  });
});
