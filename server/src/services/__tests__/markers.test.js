import { describe, it, expect } from 'vitest';
import { parseAgentOutput, detectArtifactRequest } from '../markers.js';

describe('parseAgentOutput', () => {
  it('extrait une décision valide et nettoie le texte', () => {
    const text = 'Voici mon analyse. [DECISION:{"question":"Lequel choisir ?","choices":["A","B","Autre (précise)"],"context":"Important"}]';
    const r = parseAgentOutput(text);
    expect(r.decision).toEqual({ question: 'Lequel choisir ?', choices: ['A', 'B', 'Autre (précise)'], context: 'Important' });
    expect(r.content).toBe('Voici mon analyse.');
    expect(r.content).not.toContain('[DECISION');
  });

  it('extrait un agent suggéré', () => {
    const r = parseAgentOutput('Il manque un expert. [SUGGEST_AGENT: Compta, spécialiste comptabilité]');
    expect(r.suggestedAgent).toEqual({ name: 'Compta', role: 'spécialiste comptabilité' });
    expect(r.content).toBe('Il manque un expert.');
  });

  it('extrait une réunion suggérée', () => {
    const text = 'On devrait faire ça ensuite. [SUGGEST_MEETING:{"title":"Valider le budget","objective":"Arbitrer le budget final","type":"decision","reason":"Nécessaire avant de continuer","after":"R2"}]';
    const r = parseAgentOutput(text);
    expect(r.suggestedMeeting).toEqual({
      title: 'Valider le budget', objective: 'Arbitrer le budget final',
      type: 'decision', reason: 'Nécessaire avant de continuer', after: 'R2',
    });
    expect(r.content).toBe('On devrait faire ça ensuite.');
  });

  it('retombe sur le type decision si le type suggéré est invalide', () => {
    const r = parseAgentOutput('[SUGGEST_MEETING:{"title":"X","type":"bogus"}]');
    expect(r.suggestedMeeting).toEqual({ title: 'X', objective: '', type: 'decision', reason: '', after: null });
  });

  it('extrait un outil manquant enrichi du coût (NEED_TOOL, phase 4)', () => {
    const r = parseAgentOutput('Il faudrait un outil. [NEED_TOOL:{"name":"Resend","category":"messaging","need":"Envoyer les confirmations","why":"API simple","costMin":0,"costMax":"20","freeTier":"3 000 emails/mois","priceSource":"https://resend.com/pricing"}]');
    expect(r.neededTool).toEqual({
      name: 'Resend', category: 'messaging', need: 'Envoyer les confirmations', why: 'API simple',
      costMin: 0, costMax: 20, freeTier: '3 000 emails/mois', priceSource: 'https://resend.com/pricing',
    });
    expect(r.content).toBe('Il faudrait un outil.');
  });

  it('accepte l\'ancien format NEED_TOOL v4 et rejette une source non http', () => {
    const r = parseAgentOutput('[NEED_TOOL:{"id":"docker","label":"Docker","reason":"Déploiement","priceSource":"javascript:x"}]');
    expect(r.neededTool).toMatchObject({ name: 'Docker', why: 'Déploiement', priceSource: null, costMin: null });
  });

  it('ignore un marqueur sans aucun contenu et renvoie un objet neutre', () => {
    const r = parseAgentOutput('Simple message sans marqueur.');
    expect(r.decision).toBeNull();
    expect(r.suggestedAgent).toBeNull();
    expect(r.suggestedMeeting).toBeNull();
    expect(r.neededTool).toBeNull();
    expect(r.content).toBe('Simple message sans marqueur.');
  });

  // JSON invalide : le marqueur est retiré du texte mais ne produit aucune donnée
  it('gère un JSON invalide dans DECISION sans planter', () => {
    const r = parseAgentOutput('Avant.[DECISION:{"question": invalide sans guillemets}]Après.');
    expect(r.decision).toBeNull();
    expect(r.content).toBe('Avant.Après.');
  });

  it('gère un JSON invalide dans NEED_TOOL sans planter', () => {
    const r = parseAgentOutput('[NEED_TOOL:{id: docker}]');
    expect(r.neededTool).toBeNull();
    expect(r.content).toBe('');
  });

  // Marqueur en double : seule la première occurrence alimente les données,
  // toutes les occurrences sont retirées du texte
  it('ne garde que la première décision en cas de doublon', () => {
    const text = '[DECISION:{"question":"Q1 ?","choices":["A"],"context":"c1"}] milieu [DECISION:{"question":"Q2 ?","choices":["B"],"context":"c2"}]';
    const r = parseAgentOutput(text);
    expect(r.decision.question).toBe('Q1 ?');
    expect(r.content).toBe('milieu');
  });

  it('ne garde que la première réunion suggérée en cas de doublon et retire toutes les occurrences', () => {
    const text = '[SUGGEST_MEETING:{"title":"Réunion 1","type":"decision"}] texte [SUGGEST_MEETING:{"title":"Réunion 2","type":"decision"}]';
    const r = parseAgentOutput(text);
    expect(r.suggestedMeeting.title).toBe('Réunion 1');
    expect(r.content).toBe('texte');
  });

  // Crochets dans le texte qui ne sont pas des marqueurs reconnus
  it('ne confond pas des crochets ordinaires avec un marqueur', () => {
    const r = parseAgentOutput('Les options sont [A, B, C] et il faut choisir.');
    expect(r.decision).toBeNull();
    expect(r.suggestedAgent).toBeNull();
    expect(r.suggestedMeeting).toBeNull();
    expect(r.neededTool).toBeNull();
    expect(r.content).toBe('Les options sont [A, B, C] et il faut choisir.');
  });

  // Marqueur coupé (ex. troncature max_tokens) : non reconnu, laissé tel quel
  it('laisse un marqueur DECISION coupé (sans crochet fermant) tel quel', () => {
    const text = 'Il faut décider. [DECISION:{"question":"Q ?","choices":["A","B"';
    const r = parseAgentOutput(text);
    expect(r.decision).toBeNull();
    expect(r.content).toBe(text);
  });

  it('laisse un marqueur SUGGEST_MEETING coupé tel quel', () => {
    const text = 'Prochaine réunion : [SUGGEST_MEETING:{"title":"Valider le';
    const r = parseAgentOutput(text);
    expect(r.suggestedMeeting).toBeNull();
    expect(r.content).toBe(text);
  });

  it('découpe en bulles sur le séparateur [NEXT]', () => {
    const r = parseAgentOutput('Première idée.\n[NEXT]\nDeuxième idée.');
    expect(r.bubbles).toEqual(['Première idée.', 'Deuxième idée.']);
  });

  it('renvoie une seule bulle quand [NEXT] est absent', () => {
    const r = parseAgentOutput('Une seule idée.');
    expect(r.bubbles).toEqual(['Une seule idée.']);
  });
});

describe('illustrations (phase 5)', () => {
  it('extrait un schéma mermaid titré et le retire des bulles', () => {
    const r = parseAgentOutput('Voici le parcours.\n[ARTIFACT_TITLE: Parcours client]\n```mermaid\ngraph LR\n  A[Accueil] --> B[Panier]\n```\n[NEXT]\nOn en parle ?');
    expect(r.artifact).toEqual({ kind: 'mermaid', title: 'Parcours client', code: 'graph LR\n  A[Accueil] --> B[Panier]' });
    expect(r.bubbles).toEqual(['Voici le parcours.', 'On en parle ?']);
  });

  it('ne confond pas les crochets du HTML avec un marqueur et garde la décision', () => {
    const r = parseAgentOutput('Maquette :\n```html\n<div data-x="[DECISION:{}]">[a]</div>\n```\n[DECISION:{"question":"Q ?","choices":["A","Autre (précise)"],"context":"c"}]');
    expect(r.artifact.kind).toBe('html');
    expect(r.artifact.title).toBe('Maquette');
    expect(r.decision.question).toBe('Q ?');
    expect(r.content).toBe('Maquette :');
  });

  it('retire aussi un bloc non refermé (réponse tronquée)', () => {
    const r = parseAgentOutput('Début.\n```svg\n<svg><rect');
    expect(r.artifact).toBeNull();
    expect(r.content).toBe('Début.');
  });

  it('laisse les autres blocs de code intacts', () => {
    const r = parseAgentOutput('```js\nconst a = 1;\n```');
    expect(r.artifact).toBeNull();
    expect(r.content).toContain('const a = 1;');
  });

  it('détecte une demande explicite, pas une simple mention', () => {
    expect(detectArtifactRequest('Fais-moi un schéma du parcours')).toBe(true);
    expect(detectArtifactRequest('Peux-tu me montrer une maquette de la page ?')).toBe(true);
    expect(detectArtifactRequest('/illustrer les étapes')).toBe(true);
    expect(detectArtifactRequest('Le schéma de la base est déjà validé.')).toBe(false);
    expect(detectArtifactRequest('On garde la maquette actuelle')).toBe(false);
  });
});
