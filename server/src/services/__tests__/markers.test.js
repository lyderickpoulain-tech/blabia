import { describe, it, expect } from 'vitest';
import { parseAgentOutput } from '../markers.js';

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

  it('extrait un outil manquant (NEED_TOOL)', () => {
    const r = parseAgentOutput('Il faudrait un outil. [NEED_TOOL:{"id":"docker","label":"Docker","required":true}]');
    expect(r.neededTool).toEqual({ id: 'docker', label: 'Docker', required: true });
    expect(r.content).toBe('Il faudrait un outil.');
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
