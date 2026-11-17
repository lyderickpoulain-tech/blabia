import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// v6, règle du minimum de technique : les textes des écrans accessibles sans le mode avancé
// ne contiennent aucun terme de la liste interdite (outils, modèles, « API », « jeton »,
// « dépôt », « $ », « brief », « stack », repères internes, mots de travail de la v6).
// Écrans couverts : ceux de la v6. Les écrans v5.1 encore visibles hors mode avancé
// (tableau de bord, réunions, menu du projet…) passent derrière le mode avancé ou sont
// réécrits en phase 4 ; ils rejoindront alors cette liste.
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SCREENS = [
  'client/src/pages/NewProjectStory.jsx',
  'client/src/pages/project/ProjectHome.jsx',
  'client/src/pages/project/ProjectWork.jsx',
  'client/src/components/work/WorkDocument.jsx',
  'client/src/pages/ReviewRoom.jsx',   // phase 2 : réunion de revue
  'client/src/pages/MeetingRoute.jsx',
  'client/src/pages/project/ProjectMeetings.jsx', // phase 4 : réunions sans le mode avancé
  'client/src/components/Layout.jsx',
  'client/src/pages/Dashboard.jsx',
  'client/src/components/NewProjectChoiceModal.jsx',
  'client/src/components/site/SiteCard.jsx', // BlabIA + : construction du site
];
// Messages renvoyés à l'écran par le serveur v6
const SERVER = ['server/src/routes/work.js', 'server/src/services/work/builder.js', 'server/src/services/work/review.js', 'server/src/routes/site.js', 'server/src/services/plus/siteBuilder.js', 'server/src/services/plus/sitePublisher.js'];

const FORBIDDEN = [
  /\bgithub\b/i, /\bclaude\b/i, /\brailway\b/i, /\bAPI\b/, /\bsonnet\b/i, /\bopus\b/i, /\bhaiku\b/i, /\bfable\b/i,
  /\btokens?\b/i, /\bjetons?\b/i, /\bdépôts?\b/i, /\bhébergeur/i, /\$/, /\bbrief\b/i, /\bstack\b/i,
  /\bprompt\b/i, /\bworkflow\b/i, /\bdeploy/i,
  /\b[RAV]\d+\b/, // repères internes (R2, A3, V0)
  /\bouvrage\b/i, // mot de travail de la v6, pas de l'écran
];

// Textes visibles : chaînes contenant une espace, et texte entre balises JSX
function visibleTexts(source) {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/^import .*$/gm, '')
    .replace(/className=(?:"[^"]*"|\{`[^`]*`\})/g, '');
  const texts = [];
  for (const m of code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    const s = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, ' ');
    if (/\s/.test(s.trim()) && !/^[/.]|\/projects\//.test(s.trim())) texts.push(s);
  }
  for (const m of code.matchAll(/>([^<>{}]*[A-Za-zÀ-ÿ][^<>{}]*)</g)) texts.push(m[1]);
  return texts;
}

// Serveur : seulement les messages renvoyés à l'écran (« error: '…' », « new BuildError('…') »)
const MESSAGE = /(?:error:\s*|BuildError\(|ReviewError\(|SiteError\(|PublishError\(|message = [^?\n]*\?\s*)'((?:[^'\\\n]|\\.)*)'/g;
const serverMessages = source => [...source.matchAll(MESSAGE)].map(m => m[1]);

describe('règle du minimum de technique (v6)', () => {
  it('le contrôle lui-même repère un terme interdit', () => {
    const hits = visibleTexts("const a = 'Votre dépôt GitHub'; <p>Coût : 3 $</p>").filter(t => FORBIDDEN.some(r => r.test(t)));
    expect(hits.length).toBe(2);
    expect(serverMessages("res.json({ error: 'Clé API refusée' })")).toEqual(['Clé API refusée']);
  });

  for (const file of [...SCREENS, ...SERVER]) {
    it(`aucun terme interdit : ${file}`, () => {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      const texts = SERVER.includes(file) ? serverMessages(source) : visibleTexts(source);
      expect(texts.length).toBeGreaterThan(0);
      const hits = texts.flatMap(t => FORBIDDEN.filter(r => r.test(t)).map(r => `« ${t.trim().slice(0, 80)} » (${r})`));
      expect(hits).toEqual([]);
    });
  }
});
