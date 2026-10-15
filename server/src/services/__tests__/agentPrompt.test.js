import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { buildAgentSystemPrompt } = require('../prompts/agentPrompt');

const agents = [
  { id: 'a1', name: 'Léa', role: 'Stratège', systemPrompt: 'Tu es Léa, stratège.' },
  { id: 'a2', name: 'Max', role: 'Critique', systemPrompt: 'Tu es Max, critique.' },
];
const base = {
  project: { brief: 'OBJECTIF : ouvrir un salon de thé.', context: '[01/10/2026 — Concept]\nSalon cosy.' },
  session: { task: 'Choisir l’emplacement' },
  intention: ['decision'],
  activeAgents: agents,
  decisionRegistry: { activeText: '- Public : actifs du quartier', reopenedText: '' },
};

describe('prompt agent : mise en cache', () => {
  it('rend deux blocs, le premier marqué pour le cache', () => {
    const blocks = buildAgentSystemPrompt({ ...base, agent: agents[0] });
    expect(blocks).toHaveLength(2);
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(blocks[1].cache_control).toBeUndefined();
  });

  it('bloc commun identique quel que soit l’agent et ce qui varie d’un tour à l’autre', () => {
    const t1 = buildAgentSystemPrompt({ ...base, agent: agents[0], reason: 'Ouvre le débat', decisionBudget: { used: 0, max: 8 } });
    const t2 = buildAgentSystemPrompt({
      ...base, agent: agents[1], reason: 'Répond à Léa', decisionBudget: { used: 3, max: 8 },
      priorDecisionQuestions: ['- "Quel quartier ?" (Léa)'], artifactRequest: 'un plan du local',
      preparationSection: '\nPRÉPARATION\n',
    });
    expect(t2[0].text).toBe(t1[0].text);
  });

  it('ce qui varie est dans le bloc du tour, pas dans le bloc commun', () => {
    const [shared, turn] = buildAgentSystemPrompt({
      ...base, agent: agents[1], reason: 'Répond à Léa', decisionBudget: { used: 3, max: 8 },
      priorDecisionQuestions: ['- "Quel quartier ?" (Léa)'], artifactRequest: 'un plan du local',
    });
    for (const dynamic of ['Max', 'Répond à Léa', 'il reste 5 cartes', 'Quel quartier ?', 'un plan du local']) {
      expect(shared.text).not.toContain(dynamic === 'Max' ? 'tu es Max' : dynamic);
      expect(turn.text).toContain(dynamic);
    }
  });

  it('le projet (brief, mémoire, registre) est dans le bloc commun', () => {
    const [shared] = buildAgentSystemPrompt({ ...base, agent: agents[0] });
    expect(shared.text).toContain('ouvrir un salon de thé');
    expect(shared.text).toContain('Salon cosy');
    expect(shared.text).toContain('actifs du quartier');
  });

  it('réunion outils : les outils déjà proposés sortent du bloc commun', () => {
    const toolReview = { toolCategories: [{ id: 'pos', label: 'Caisse', technical: 'POS' }], userToolsText: '', toolSuggestionsText: '- SumUp' };
    const [shared, turn] = buildAgentSystemPrompt({ ...base, intention: ['stack'], agent: agents[0], toolReview });
    expect(shared.text).toContain('GRILLE DES CATÉGORIES');
    expect(shared.text).not.toContain('SumUp');
    expect(turn.text).toContain('SumUp');
  });

  it('bloc commun assez long pour être mis en cache (≥ 1 024 tokens, ~4 caractères/token)', () => {
    const [shared] = buildAgentSystemPrompt({ ...base, agent: agents[0] });
    expect(shared.text.length / 4).toBeGreaterThan(1024);
  });
});


// Audit du 13/10/2026 : profils de niveau et d'humour nettement distincts ; règles fixes
// pour la réunion dans le bloc commun (cache), court rappel en fin de bloc du tour
describe('prompt agent : comment tu parles', () => {
  const build = (expertiseLevel, humorLevel, humorRoll = 0.5) => buildAgentSystemPrompt({ ...base, agent: agents[0], expertiseLevel, humorLevel, humorRoll });
  const sharedFor = (e, h) => build(e, h)[0].text;

  it('règles de style dans le bloc commun ; le tour se termine par un court rappel', () => {
    const [shared, turn] = build(1, 1);
    expect(shared.text).toContain('COMMENT TU PARLES (le plus important');
    expect(shared.text).toContain('Réponds d\'abord à ce qui vient d\'être dit');
    expect(turn.text).not.toContain('COMMENT TU PARLES (le plus important');
    expect(turn.text.trimEnd().endsWith('ton de collègue, pas de mémo.')).toBe(true);
    expect(turn.text).toContain('RAPPEL AVANT DE PARLER');
    expect(turn.text.length).toBeLessThan(900); // le bloc du tour, au plein tarif, reste court
  });

  it('bloc commun identique d\'un tour à l\'autre malgré le tirage de l\'humour', () => {
    expect(build(3, 5, 0.1)[0].text).toBe(build(3, 5, 0.9)[0].text);
    expect(build(3, 5, 0.1)[1].text).not.toBe(build(3, 5, 0.9)[1].text);
  });

  it('niveaux distincts : pas de fichier ni de repère seul jusqu’au niveau 3, références exactes au niveau 5', () => {
    expect(sharedFor(1, 2)).toContain('Environ 20 mots');
    expect(sharedFor(1, 2)).toContain('ni repère interne seul');
    expect(sharedFor(3, 2)).toContain('ni repère interne seul');
    expect(sharedFor(5, 2)).not.toContain('ni repère interne seul');
    expect(sharedFor(5, 2)).toContain('références exactes');
    expect(sharedFor(5, 2)).toContain('35 mots au plus');
    expect(build(1, 2)[1].text).toContain('niveau Découverte : environ 20 mots');
  });

  it('humour tiré au sort à chaque tour selon sa fréquence ; niveau inconnu → valeurs par défaut', () => {
    expect(build(3, 5, 0.8)[1].text).toContain("CE TOUR-CI : glisse UNE vraie touche d'humour");
    expect(build(3, 3, 0.8)[1].text).toContain("pas d'humour, ton naturel suffit");
    expect(build(3, 1, 0)[1].text).not.toContain('CE TOUR-CI');
    expect(sharedFor(9, 9)).toContain('Intermédiaire');
    expect(sharedFor(9, 9)).toContain('Détendu');
  });

  it('hypothèse en bulle « Hypothèse : » (reconnue par l’interface), plus de formule imposée', () => {
    const [shared] = buildAgentSystemPrompt({ ...base, agent: agents[0] });
    expect(shared.text).toContain('commence par « Hypothèse : »');
    expect(shared.text).not.toContain('sauf avis contraire');
    expect(shared.text).not.toContain('Pour expliquer simplement');
  });
});

// Audit du 13/10/2026 (suite) : le cap, contre la dérive des réunions longues
describe('prompt agent : le cap', () => {
  const { projectObjective } = require('../../utils/projectObjective');
  const brief = "OBJECTIF : Identifier une shortlist de projets de niche.\n\nNOTES : Pas d'outil de devis.";

  it('objectif du projet tiré du brief, sinon de la description', () => {
    expect(projectObjective({ brief })).toBe('Identifier une shortlist de projets de niche.');
    expect(projectObjective({ brief: '', description: 'Ouvrir un salon' })).toBe('Ouvrir un salon');
    expect(projectObjective({})).toBe('');
  });

  it('cap dans le bloc commun, avec la règle anti-surenchère ; objectif rappelé en fin de tour', () => {
    const [shared, turn] = buildAgentSystemPrompt({ ...base, project: { brief }, agent: agents[0] });
    expect(shared.text).toContain('Objectif de CETTE réunion : Choisir l’emplacement');
    expect(shared.text).toContain('Objectif du projet : Identifier une shortlist de projets de niche.');
    expect(shared.text).toContain('PAS DE SURENCHÈRE');
    expect(turn.text).toContain('rapproche de l\'objectif « Choisir l’emplacement », sans surenchère');
  });

  it('orchestrateur : objectif du projet et repérage de la dérive dans le même appel', () => {
    const { buildOrchestratorPrompt } = require('../prompts/orchestratorPrompt');
    const p = buildOrchestratorPrompt({ session: { task: 'Scorer', intention: ['decision'] }, agentsForSelection: agents, turnCount: 3, projectGoal: 'Shortlist de niches' });
    expect(p).toContain('Objectif du projet : "Shortlist de niches"');
    expect(p).toContain('"offTrack": false');
  });
});

// 15/10/2026 : le mode de questions règle ce qui revient à l'humain, pas seulement le plafond
describe('prompt agent : mode de questions', () => {
  const sharedFor = questionMode => buildAgentSystemPrompt({ ...base, agent: agents[0], questionMode })[0].text;
  it('« Équilibré » : les choix qui appartiennent à l’humain passent par une carte', () => {
    expect(sharedFor('balanced')).toContain('Ce qui APPARTIENT à l\'humain se tranche par une carte');
    expect(sharedFor('balanced')).toContain('2 à 4');
    expect(sharedFor('delegate')).toContain('L\'humain DÉLÈGUE');
    expect(sharedFor('control')).toContain('VEUT TOUT TRANCHER');
    expect(sharedFor(undefined)).toContain('Ce qui APPARTIENT');
  });
  it('orchestrateur : aucune carte après quelques tours → faire consulter l’humain', () => {
    const { buildOrchestratorPrompt } = require('../prompts/orchestratorPrompt');
    const p = (turnCount, decisionsAsked, questionMode) => buildOrchestratorPrompt({ session: { task: 'T', intention: ['decision'] }, agentsForSelection: agents, turnCount, decisionsAsked, questionMode, decisionsLeft: 8 });
    expect(p(4, 0, 'balanced')).toContain('Aucune question n\'a encore été soumise');
    expect(p(3, 0, 'balanced')).not.toContain('Aucune question');
    expect(p(4, 1, 'balanced')).not.toContain('Aucune question');
    expect(p(9, 0, 'delegate')).not.toContain('Aucune question');
    expect(p(2, 0, 'control')).toContain('tout trancher');
  });
});
