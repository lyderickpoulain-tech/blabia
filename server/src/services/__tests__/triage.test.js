import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// Fin de réunion : seules les vraies actions de l'humain restent des actions. Cas réel du
// « Site de numérologie » : 19 actions, dont des doublons, des décisions à prendre, des
// comptes d'outils à créer et du travail de code.
const require = createRequire(import.meta.url);
const { parseTriage, dropExistingActions, sameAction } = require('../actions');
const { missingTools, describeMissing, buildRequiredToolsPrompt } = require('../devTools');
const { buildExtractionPrompt } = require('../decisions');
const { sanitizeProjectTools } = require('../tools/toolsStore');

describe('tri de fin de réunion', () => {
  it('le prompt d’extraction sépare décisions à prendre, outils, code et vraies actions (5 au plus)', () => {
    const p = buildExtractionPrompt({ task: 'Définir le site', historyText: '…', cardsText: '', registryText: '', actionsText: '- Rédiger la page Méthode' }).user;
    expect(p).toContain('"toDecide"');
    expect(p).toContain('"toolSetups"');
    expect(p).toContain('"codeTasks"');
    expect(p).toContain('5 au maximum');
    expect(p).toContain('ne les répète pas, même reformulées');
  });

  it('lit le tri et ignore les entrées vides', () => {
    expect(parseTriage({
      toDecide: ['Définir la ligne de partage gratuit / payant ?', '', { question: 'Trancher la fonctionnalité signature ?' }],
      toolSetups: [{ tool: 'Railway', category: 'hébergement' }, { tool: '' }],
      codeTasks: [{ title: 'Installer la police Inter', detail: 'front-end' }, 'Exporter la palette en variables CSS'],
    })).toEqual({
      toDecide: ['Définir la ligne de partage gratuit / payant ?', 'Trancher la fonctionnalité signature ?'],
      toolSetups: [{ tool: 'Railway', category: 'hébergement' }],
      codeTasks: [{ title: 'Installer la police Inter', detail: 'front-end' }, { title: 'Exporter la palette en variables CSS', detail: null }],
    });
    expect(parseTriage(null)).toEqual({ toDecide: [], toolSetups: [], codeTasks: [] });
  });

  it('écarte une action déjà ouverte, même reformulée (doublons réels du projet)', () => {
    const existing = [
      { title: 'Rédiger un premier exemple de page Méthode', status: 'todo' },
      { title: 'Créer un compte Stripe et vérifier l’éligibilité au statut de vendeur pour le pays de résidence', status: 'todo' },
      { title: 'Tester le « test aveugle » manuellement sur 5 profils réels', status: 'done' },
    ];
    const out = dropExistingActions([
      { title: 'Rédiger un premier brouillon de la page Méthode' },
      { title: 'Créer un compte Stripe et vérifier l\'éligibilité au statut de vendeur pour le pays de résidence' },
      { title: 'Tester le « test aveugle » manuellement sur 5 profils réels' }, // déjà FAITE : peut revenir
      { title: 'Réserver les comptes @numvibe sur les réseaux sociaux' },
    ], existing);
    expect(out.map(a => a.title)).toEqual(['Tester le « test aveugle » manuellement sur 5 profils réels', 'Réserver les comptes @numvibe sur les réseaux sociaux']);
    expect(sameAction('Créer le logo', 'Rédiger la page Méthode')).toBe(false);
  });
});

describe('outils dont dépend un développement', () => {
  const tools = sanitizeProjectTools([
    { name: 'Stripe', category: 'payment', status: 'validated' },
    { name: 'Supabase', category: 'database', status: 'validated', setupDone: true },
    { name: 'Resend', category: 'messaging', status: 'refused' },
  ]);

  it('« mis en place » est conservé sur l’outil', () => {
    expect(tools.map(t => t.setupDone)).toEqual([false, true, false]);
  });

  it('manquant = aucun outil choisi, ou outil choisi pas encore mis en place', () => {
    const missing = missingTools(['payment', 'database', 'messaging'], tools);
    expect(missing).toEqual([
      { category: 'payment', label: 'Encaisser de l\'argent', tool: 'Stripe', reason: 'not_setup' },
      { category: 'messaging', label: 'Envoyer des messages', tool: null, reason: 'not_chosen' },
    ]);
    expect(describeMissing(missing)).toBe('Stripe (Encaisser de l\'argent) : pas encore mis en place ; Envoyer des messages : aucun outil choisi');
    expect(missingTools([], tools)).toEqual([]);
  });

  it('repérage : seulement les services externes, outils retenus fournis', () => {
    const p = buildRequiredToolsPrompt('Ajoute le paiement Stripe pour le mode d’emploi', tools).user;
    expect(p).toContain('- payment : Encaisser de l\'argent');
    expect(p).not.toContain('- frontend');
    expect(p).toContain('- Stripe (payment)');
    expect(p).not.toContain('Resend'); // refusé
  });
});
