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
    expect(build(3, 5, 0.3)[1].text).toContain("CE TOUR-CI : glisse UNE vraie touche d'humour");
    expect(build(3, 5, 0.8)[1].text).toContain("pas d'humour, ton naturel suffit"); // même « potes » : une respiration, pas un tic
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

// Réunion « WorldOfMetal » (17/10/2026) : DNS débattu devant un non-technicien, « je n'ai pas
// vérifié » à chaque message, blague en chute un message sur deux, projet appelé « BlabIA »
describe('prompt agent : réunion « Gérard compatible »', () => {
  const build = (expertiseLevel, extra = {}) => buildAgentSystemPrompt({ ...base, agent: agents[0], expertiseLevel, humorLevel: 2, ...extra })[0].text;

  it('la technique se règle en coulisses jusqu’au niveau 3, pas pour un expert', () => {
    expect(build(1)).toContain('LA TECHNIQUE SE RÈGLE EN COULISSES');
    expect(build(1)).toContain('le coût en euros par mois');
    expect(build(2)).toContain('La technique se règle en coulisses');
    expect(build(3)).toContain("ne t'y attarde que s'ils changent le coût");
    expect(build(5)).not.toMatch(/coulisses|ne t'y attarde/);
  });

  it('incertitude dite une fois ; recherche web plutôt que « pas vérifié »', () => {
    expect(build(3)).toContain('INCERTITUDE : une information non vérifiée se signale une fois');
    expect(build(3, { webSearchEnabled: true })).toContain("plutôt que d'annoncer que tu ne l'as pas vérifiée");
  });

  it('dépôt : les fichiers blabia-* ne font pas de BlabIA le projet', () => {
    const p = buildAgentSystemPrompt({ ...base, project: { ...base.project, name: 'WorldOfMetal', githubRepo: 'moi/worldofmetal' }, agent: agents[0] })[0].text;
    expect(p).toContain("le projet s'appelle « WorldOfMetal », pas BlabIA");
  });

  it('orchestrateur : nom du projet, technique hors débat pour un débutant', () => {
    const { buildOrchestratorPrompt } = require('../prompts/orchestratorPrompt');
    const p = level => buildOrchestratorPrompt({ session: { task: 'Choisir les outils', intention: ['stack'] }, agentsForSelection: agents, turnCount: 3, projectName: 'WorldOfMetal', expertiseLevel: level });
    expect(p(1)).toContain('Projet : « WorldOfMetal »');
    expect(p(1)).toContain("ce n'est jamais le sujet");
    expect(p(1)).toContain('se règlent entre agents, sans débat devant lui');
    expect(p(3)).toContain('deux tours de suite portent sur un réglage technique');
    expect(p(5)).not.toContain('INTERLOCUTEUR NON TECHNICIEN');
  });
});

describe('pas de monologue (agentStreak)', () => {
  const { agentStreak } = require('../agentStreak');
  const a = (name, turnId, extra = {}) => ({ role: 'agent', agentName: name, turnId, type: 'message', ...extra });

  it('compte les tours (pas les bulles) du dernier agent ; animation et réponses aux cartes ne coupent pas la série', () => {
    const msgs = [a('Critique', 't1'), a('DevOps', 't2'), a('DevOps', 't2'), { role: 'agent', agentName: 'Animation', type: 'animator' },
      a('DevOps', 't3'), { type: 'decision_answer', role: 'system' }, a('DevOps', 't4'), a('DevOps', 't4')];
    expect(agentStreak(msgs)).toEqual({ name: 'DevOps', turns: 3 });
  });

  it('un message de l’humain ou d’un autre agent remet à zéro', () => {
    expect(agentStreak([a('DevOps', 't1'), { role: 'human', content: 'ok' }, a('Critique', 't2')])).toEqual({ name: 'Critique', turns: 1 });
    expect(agentStreak([a('DevOps', 't1'), a('Critique', 't2'), a('DevOps', 't3')])).toEqual({ name: 'DevOps', turns: 1 });
    expect(agentStreak([])).toEqual({ name: null, turns: 0 });
  });
});

// F3 (constats sur « WorldOfMetal ») : « proposez-moi 3 typos » sans choix ; comparaisons toujours
// sur la page d'accueil ; réunion de 164 messages
describe('prompt agent : choix demandé, comparaison fidèle, réunion longue', () => {
  it('une demande de choix explicite donne une carte, quel que soit le mode', () => {
    for (const questionMode of ['delegate', 'balanced', 'control']) {
      const [shared] = buildAgentSystemPrompt({ ...base, agent: agents[0], questionMode });
      expect(shared.text).toContain('L\'HUMAIN DEMANDE À CHOISIR');
    }
  });

  it('comparaison : planches de style pour la typographie et les couleurs', () => {
    const [shared] = buildAgentSystemPrompt({ ...base, intention: ['decision'], agent: agents[0], artifactRequest: 'je veux juste voir les polices', artifactCompare: true });
    const text = buildAgentSystemPrompt({ ...base, agent: agents[0], artifactRequest: 'je veux juste voir les polices', artifactCompare: true }).map(b => b.text).join('\n');
    expect(text).toContain('PLANCHES DE STYLE');
    expect(text).toContain('Ne refais pas la page d\'accueil');
    expect(shared).toBeTruthy();
  });

  it('orchestrateur : au-delà de 30 tours, faire conclure', () => {
    const { buildOrchestratorPrompt } = require('../prompts/orchestratorPrompt');
    const p = turnCount => buildOrchestratorPrompt({ session: { task: 'Maquetter', intention: ['decision'] }, agentsForSelection: agents, turnCount });
    expect(p(12)).not.toContain('RÉUNION LONGUE');
    expect(p(31)).toContain('RÉUNION LONGUE (31 tours)');
  });
});
