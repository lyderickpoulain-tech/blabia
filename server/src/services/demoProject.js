// Projet exemple de la visite guidée (v5.1) : « Les Feuilles Vagabondes », un salon
// de thé — volontairement non informatique, pour montrer que BlabIA sert à tout.
// Jeu de données fixe, créé sans aucun appel à l'IA (donc sans coût) :
//  - brief, équipe d'agents (agents par défaut existants), plan de 4 réunions ;
//  - une réunion conclue avec son compte-rendu et ses décisions au registre ;
//  - une réunion préparée qui attend deux arbitrages (phase « briefing ») ;
//  - une décision remise en question et une action en retard (points d'attention) ;
//  - trois actions entre les réunions (faite, en retard, à venir) ;
//  - un point de vigilance du contradicteur, pris en compte (réunion conclue) ;
//  - un document de référence (étude de marché courte) ;
//  - deux missions des agents : une terminée (rapport dans les documents), une proposée.
// Project.isDemo = true : les routes IA sont bloquées (demoGuard) et le projet est
// supprimé à la fin de la visite.
const { randomUUID } = require('crypto');
const db = require('../utils/db');

const PREFERRED_AGENTS = ['Stratège', 'Analyste', 'Critique'];
const FALLBACK_AGENTS = [
  { name: 'Stratège', emoji: '♟️', role: 'Élabore des plans d’action alignés avec les objectifs' },
  { name: 'Analyste', emoji: '🔍', role: 'Examine les données et les faits avec rigueur' },
  { name: 'Critique', emoji: '🎯', role: 'Identifie les failles, risques et points faibles' },
];

const BRIEF = [
  'OBJECTIF : Ouvrir à Lyon un salon de thé cosy doublé d’une boutique de thés en vrac, rentable dès la deuxième année.',
  'CONTEXTE : Projet porté par une seule personne, ancienne responsable de boutique. Apport personnel de 25 000 €, prêt bancaire en cours de négociation. Aucune expérience de la restauration.',
  'NOTES : Envie d’ateliers de dégustation le week-end et d’une vente en ligne plus tard. Sensible aux circuits courts et au zéro déchet.',
].join('\n\n');

const SUMMARY_MEETING_1 = `## Concept et public — compte-rendu

**Objectif de la réunion :** définir le positionnement du salon et le public à viser en premier.

### Décisions
- **Positionnement :** salon de thé cosy (30 places) + boutique de thés en vrac, avec ateliers de dégustation le samedi.
- **Public prioritaire :** actifs de 25 à 45 ans du quartier, pour la pause du midi et le goûter.
- **Ouverture visée :** printemps 2027 (hypothèse des agents, non contredite).

### Points clés du débat
- Le Stratège a recommandé de démarrer avec une carte courte (12 thés, 4 pâtisseries) pour limiter le stock.
- Le Critique a alerté sur la saisonnalité : l'été est creux pour les boissons chaudes → prévoir des thés glacés.
- L'Analyste estime le panier moyen à 9 € en salle et 18 € en boutique.

### Prochaine étape
Choisir l'emplacement : la surface et le loyer conditionnent tout le plan de financement.`;

function messages1(agents, t0) {
  const [s, a, c] = agents;
  const at = min => new Date(t0.getTime() + min * 60000).toISOString();
  const msg = (agent, content, min, extra = {}) => ({
    id: randomUUID(), role: 'agent', agentName: agent.name, turnId: randomUUID(),
    content, timestamp: at(min), type: 'message', pinned: false, ...extra,
  });
  const decisionId = randomUUID();
  return [
    { id: randomUUID(), role: 'human', agentName: null, content: 'Je veux un lieu chaleureux, pas un énième café branché. Aidez-moi à poser le concept.', timestamp: at(0), type: 'message', pinned: false },
    msg(s, 'Je propose un double modèle : salon de 30 places et boutique de thés en vrac. La boutique lisse le chiffre d’affaires les jours calmes.', 1),
    msg(a, 'Dans le quartier, trois cafés mais aucune offre centrée sur le thé. Les actifs de 25 à 45 ans y sont nombreux à midi.', 2),
    msg(c, 'Attention à l’été : les boissons chaudes chutent de 40 %. Il faudra une carte de thés glacés dès l’ouverture.', 3),
    { id: decisionId, role: 'system', type: 'decision', question: 'Quel public viser en priorité ?', choices: ['Actifs du quartier (midi, goûter)', 'Étudiants', 'Touristes', 'Autre (précise)'], context: 'Le public visé fixe les horaires, la carte et les prix.', status: 'answered', answer: 'Actifs du quartier (midi, goûter)', answeredAt: at(4), agentName: s.name, timestamp: at(4) },
    { id: randomUUID(), role: 'system', type: 'decision_answer', content: '📌 Décision : Quel public viser en priorité ? → Actifs du quartier (midi, goûter)', timestamp: at(5) },
    msg(s, 'Noté. Je retiens une ouverture au printemps 2027, sauf avis contraire : cela laisse le temps de trouver le local et les fournisseurs.', 6),
    { id: randomUUID(), role: 'agent', agentName: 'Contradicteur', turnId: randomUUID(), type: 'message', pinned: false, timestamp: at(7),
      content: '**Point de vigilance** : ouvrir au printemps suppose de signer le bail avant fin janvier. Si le local exige des travaux d’accessibilité (ERP), comptez 3 à 4 mois de plus : l’ouverture glisserait à l’été, saison creuse pour le thé chaud. À vérifier : faire venir un architecte dès la première visite.',
      vigilance: { status: 'accepted', target: 'Ouverture au printemps 2027', answeredAt: at(8) } },
    { id: randomUUID(), role: 'system', type: 'decision_answer', timestamp: at(8),
      content: '📌 Point de vigilance pris en compte par l\'humain : « Ouverture au printemps 2027 ». Les agents intègrent cette remarque dans la suite.' },
    msg(c, 'Bien vu. J’ajoute une visite avec un architecte aux actions, et un plan B : ouverture en septembre avec la carte des thés glacés prête.', 9),
  ];
}

function messages2(agents, t0) {
  const [s, a, c] = agents;
  const at = min => new Date(t0.getTime() + min * 60000).toISOString();
  const prep = (agent, content, min) => ({
    id: randomUUID(), role: 'agent', agentName: agent.name, turnId: randomUUID(),
    content, timestamp: at(min), type: 'message', pinned: false, prep: true,
  });
  const decision = (question, choices, context, min) => ({
    id: randomUUID(), role: 'system', type: 'decision', question, choices, context,
    status: 'pending', answer: null, answeredAt: null, agentName: 'Préparation', timestamp: at(min),
  });
  return [
    prep(a, 'Deux quartiers ressortent : la Croix-Rousse (loyers 28 €/m²/mois, clientèle fidèle) et la Presqu’île (45 €/m², passage touristique).', 0),
    prep(s, 'Avec 25 000 € d’apport, la Croix-Rousse garde une marge de sécurité. La Presqu’île demanderait un prêt bien plus élevé.', 1),
    prep(c, 'La Croix-Rousse a moins de passage le week-end : les ateliers du samedi devront attirer une clientèle venue exprès.', 2),
    prep(a, 'Surface utile conseillée : 70 m² (salon 50 m², boutique et réserve 20 m²).', 3),
    {
      id: randomUUID(), role: 'system', type: 'prep_summary', agentName: null, pinned: false, timestamp: at(5),
      content: 'Les agents recommandent **la Croix-Rousse** : un loyer compatible avec votre apport et une clientèle d’habitués qui correspond au public choisi. La Presqu’île apporterait plus de passage, mais doublerait le loyer.\n\nSurface conseillée : **70 m²**. Deux choix vous reviennent avant de chercher le local.',
    },
    decision('Quel quartier privilégier ?', ['Croix-Rousse (loyer modéré, habitués)', 'Presqu’île (passage, loyer élevé)', 'Autre (précise)'], 'Le loyer représente le premier poste de charges fixes.', 6),
    decision('Quel budget mensuel maximum pour le loyer ?', ['2 000 €', '2 500 €', '3 200 €', 'Autre (précise)'], 'Au-delà de 2 500 €, le seuil de rentabilité passe à 160 clients par jour.', 6),
  ];
}

async function pickAgents(trx) {
  const defaults = await trx('Agent').where({ isDefault: true }).orderBy('createdAt', 'asc').select('id', 'name', 'emoji', 'role', 'systemPrompt');
  const preferred = PREFERRED_AGENTS.map(n => defaults.find(a => a.name === n)).filter(Boolean);
  const chosen = (preferred.length >= 3 ? preferred : [...preferred, ...defaults.filter(a => !preferred.includes(a))]).slice(0, 3);
  if (chosen.length === 3) return chosen;
  // Aucune bibliothèque par défaut : agents fictifs (la réunion n'en garde qu'un instantané)
  return FALLBACK_AGENTS.map(a => ({ ...a, id: null, systemPrompt: `Tu es ${a.name}. ${a.role}.` }));
}

async function findDemoProjects(userId) {
  return db('Project').where({ userId, isDemo: true }).select('id');
}

// Crée le projet exemple de l'utilisateur, ou renvoie celui qui existe déjà
async function ensureDemoProject(user) {
  const [existing] = await findDemoProjects(user.id);
  if (existing) return { id: existing.id, created: false };

  return db.transaction(async trx => {
    const now = Date.now();
    const day = 86400000;
    const projectId = randomUUID();
    const agents = await pickAgents(trx);
    const snapshot = joinedAt => agents.map(a => ({
      id: a.id || randomUUID(), name: a.name, role: a.role, emoji: a.emoji || '🤖',
      systemPrompt: a.systemPrompt || `Tu es ${a.name}. ${a.role}.`, joinedAt,
    }));

    await trx('Project').insert({
      id: projectId,
      name: 'Exemple — Salon de thé « Les Feuilles Vagabondes »',
      description: 'Ouvrir un salon de thé et une boutique de thés en vrac à Lyon. Projet exemple de la visite guidée.',
      brief: BRIEF,
      context: `[${new Date(now - 5 * day).toLocaleDateString('fr-FR')} — Concept et public]\nSalon cosy de 30 places + boutique de thés en vrac, public : actifs 25-45 ans du quartier, ouverture visée au printemps 2027.`,
      status: 'active', isDemo: true,
      expertiseLevel: 2, humorLevel: 3, questionMode: 'balanced',
      userId: user.id, createdAt: new Date(now - 6 * day), updatedAt: new Date(now),
    });

    // Un compte « user » ne voit que les projets où il est membre : on l'y ajoute
    if (user.role === 'user') {
      await trx('ProjectMember').insert({ id: randomUUID(), projectId, userId: user.id, role: 'collaborator', invitedAt: new Date(now) });
    }

    const agentIds = agents.map(a => a.id).filter(Boolean);
    if (agentIds.length) {
      await trx('ProjectAgent').insert(agentIds.map((agentId, i) => ({ id: randomUUID(), projectId, agentId, enabled: true, displayOrder: i, source: 'manual' })));
    }

    const plan = [
      { title: 'Définir le concept et le public', description: 'Positionnement, public prioritaire, ambiance.', status: 'done', type: 'decision' },
      { title: 'Choisir l’emplacement du salon', description: 'Quartier, surface, budget de loyer.', status: 'in_progress', type: 'decision' },
      { title: 'Construire la carte et trouver les fournisseurs', description: 'Thés, pâtisseries, circuits courts.', status: 'pending', type: 'decision' },
      { title: 'Choisir les outils de gestion', description: 'Caisse, réservations des ateliers, comptabilité.', status: 'pending', type: 'stack' },
    ];
    const milestones = await trx('Milestone').insert(plan.map((m, i) => ({
      id: randomUUID(), projectId, ...m, displayOrder: i, createdBy: user.id, createdAt: new Date(now - 6 * day),
    }))).returning(['id', 'displayOrder']);
    const msId = i => milestones.find(m => m.displayOrder === i).id;

    // Réunion 1 : conclue
    const t1 = new Date(now - 5 * day);
    const s1 = randomUUID();
    const agents1 = snapshot(t1.toISOString());
    const msgs1 = messages1(agents1, t1);
    await trx('Session').insert({
      id: s1, task: 'Définir le concept et le public', projectId, milestoneId: msId(0),
      activeAgents: JSON.stringify(agents1),
      messages: JSON.stringify(msgs1), summary: SUMMARY_MEETING_1, status: 'accepted', mode: 'meeting',
      intention: JSON.stringify(['decision']), createdAt: t1,
      tokensUsed: JSON.stringify({ input: 0, output: 0, total: 0 }),
    });

    // Réunion 2 : préparée, en attente des arbitrages (briefing)
    const t2 = new Date(now - 2 * 3600000);
    const agents2 = snapshot(t2.toISOString());
    await trx('Session').insert({
      id: randomUUID(), task: 'Choisir l’emplacement du salon', projectId, milestoneId: msId(1),
      activeAgents: JSON.stringify(agents2),
      messages: JSON.stringify(messages2(agents2, t2)), status: 'open', mode: 'meeting',
      intention: JSON.stringify(['decision']), createdAt: t2,
      tokensUsed: JSON.stringify({ input: 0, output: 0, total: 0 }),
    });

    // Registre des décisions (issues de la réunion 1) + une remise en question
    const dec = (statement, rationale, origin, extra = {}) => ({
      id: randomUUID(), projectId, sessionId: s1, statement, rationale, origin,
      rejectedOptions: JSON.stringify(extra.rejected || []), status: extra.status || 'active',
      reopenNote: extra.reopenNote || null, createdAt: t1, updatedAt: extra.status ? new Date(now - day) : t1,
    });
    await trx('Decision').insert([
      dec('Salon de thé cosy de 30 places + boutique de thés en vrac', 'La boutique lisse le chiffre d’affaires les jours calmes.', 'human', { rejected: ['Salon seul'] }),
      dec('Public prioritaire : actifs de 25 à 45 ans du quartier', 'Aucune offre centrée sur le thé dans le quartier, forte présence à midi.', 'human', { rejected: ['Étudiants', 'Touristes'] }),
      dec('Ouverture visée au printemps 2027', 'Laisse le temps de trouver le local et les fournisseurs.', 'agents'),
      dec('Budget d’aménagement plafonné à 40 000 €', 'Cohérent avec l’apport et un prêt prudent.', 'agents', { status: 'reopened', reopenNote: 'La banque accorde finalement un prêt plus élevé : à rediscuter.' }),
    ]);

    // Actions entre les réunions (issues de la réunion 1) : une faite, une en retard, une à venir
    const dueIn = days => new Date(now + days * day).toISOString().slice(0, 10);
    await trx('TodoItem').insert([
      { title: 'Lister les fournisseurs de thé en vrac de la région', status: 'done', dueDate: dueIn(-2) },
      { title: 'Rencontrer la conseillère bancaire pour le prêt', status: 'todo', dueDate: dueIn(-1), description: 'Apporter le prévisionnel et l’estimation du loyer.' },
      { title: 'Visiter trois locaux à la Croix-Rousse', status: 'todo', dueDate: dueIn(5) },
    ].map((a, i) => ({
      id: randomUUID(), projectId, milestoneId: null, description: null, ...a,
      priority: 'medium', displayOrder: i, source: 'session', sessionId: s1, createdAt: t1, createdBy: user.id,
    })));

    // Document de référence
    const study = [
      'Étude de marché — salon de thé à Lyon (synthèse, septembre 2026)',
      '',
      'Marché : la consommation de thé en France progresse de 4 % par an ; les thés en vrac et les infusions bio portent la croissance.',
      'Concurrence : trois cafés de spécialité dans un rayon de 500 m autour de la Croix-Rousse, aucun salon centré sur le thé.',
      'Clientèle : 62 % des habitants du quartier ont entre 25 et 45 ans ; pic de fréquentation entre 12 h et 14 h et entre 16 h et 18 h.',
      'Prix constatés : boisson chaude 4 à 6 €, pâtisserie 4 à 5 €, thé en vrac 8 à 15 € les 100 g.',
      'Saisonnalité : baisse de 35 à 40 % des boissons chaudes de juin à août, compensée en partie par les thés glacés.',
      'Loyers commerciaux : Croix-Rousse 24 à 30 €/m²/mois ; Presqu’île 40 à 50 €/m²/mois.',
    ].join('\n');
    await trx('ProjectDocument').insert({
      id: randomUUID(), projectId, name: 'Étude de marché — thé à Lyon.pdf', mimeType: 'application/pdf',
      sizeBytes: 182_400, charCount: study.length, content: study, enabled: true, createdAt: t1, createdBy: user.id,
    });

    // Missions des agents : une terminée (rapport dans les documents), une proposée
    const missionReport = [
      '# Comparer les loyers commerciaux de la Croix-Rousse',
      '## Synthèse',
      'Pour 60 à 80 m², comptez 1 700 à 2 300 € par mois hors charges à la Croix-Rousse, contre 2 900 à 3 800 € sur la Presqu’île. Les locaux avec vitrine sur rue partent vite.',
      '## Résultats',
      '| Secteur | Loyer constaté | Surface type |',
      '|---|---|---|',
      '| Croix-Rousse (plateau) | 24 à 30 €/m²/mois | 60–80 m² |',
      '| Croix-Rousse (pentes) | 20 à 26 €/m²/mois | 50–70 m² |',
      '| Presqu’île | 40 à 50 €/m²/mois | 60–80 m² |',
      '## Recommandation',
      'Viser le plateau de la Croix-Rousse, avec une clause de sortie triennale négociée.',
      '## Limites et points à vérifier',
      'Données d’exemple pour la visite guidée : à confirmer auprès d’agences locales.',
      '## Sources',
      '- Exemple (visite guidée)',
    ].join('\n');
    const [reportDoc] = await trx('ProjectDocument').insert({
      id: randomUUID(), projectId, name: 'Mission — Comparer les loyers commerciaux de la Croix-Rousse', mimeType: 'text/markdown',
      sizeBytes: Buffer.byteLength(missionReport), charCount: missionReport.length, content: missionReport, enabled: true, createdAt: new Date(now - 3 * day), createdBy: user.id,
    }).returning('id');
    await trx('AgentMission').insert([
      { projectId, sessionId: s1, agentName: agents1[1]?.name || 'Analyste', kind: 'research',
        title: 'Comparer les loyers commerciaux de la Croix-Rousse', objective: 'Relever les loyers pratiqués pour 60 à 80 m² et les comparer à la Presqu’île.',
        deliverable: 'Tableau comparatif', status: 'done', budgetUSD: 0.6, costUSD: 0.42, report: missionReport,
        documentId: reportDoc.id ?? reportDoc, approvedBy: user.id, createdAt: new Date(now - 5 * day), approvedAt: new Date(now - 5 * day),
        startedAt: new Date(now - 5 * day), finishedAt: new Date(now - 3 * day) },
      { projectId, sessionId: s1, agentName: agents1[0]?.name || 'Stratège', kind: 'research',
        title: 'Lister les aides à la création d’entreprise à Lyon', objective: 'Recenser les aides et prêts d’honneur accessibles pour ouvrir un commerce à Lyon, avec conditions et montants.',
        deliverable: 'Liste avec montants et démarches', status: 'proposed', budgetUSD: 0.6, createdAt: new Date(now - 5 * day) },
    ]);

    return { id: projectId, created: true };
  });
}

// Supprime le(s) projet(s) exemple de l'utilisateur (fin de visite)
async function deleteDemoProjects(userId) {
  const projects = await findDemoProjects(userId);
  for (const { id } of projects) {
    await db.transaction(async trx => {
      await trx('Session').where({ projectId: id }).update({ parentSessionId: null });
      await trx('Session').where({ projectId: id }).delete();
      await trx('Project').where({ id, isDemo: true }).delete();
    });
  }
  return projects.length;
}

module.exports = { ensureDemoProject, deleteDemoProjects };
