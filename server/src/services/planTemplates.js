// Plans types des projets hors technique (v5.1, F4 — personas : le hors technique concerne trois
// profils sur quatre et doit être aussi soigné que le site web). Chaque réunion annonce le
// livrable qu'on en tirera à la conclusion (onglets « Livrables » du compte rendu :
// routes/sessions/assist.js, FORMATS). Le mode express (expert sur un projet hors technique) :
// une seule réunion de cadrage, puis directement le plan d'action et la liste de tâches.
const { randomUUID } = require('crypto');
const db = require('../utils/db');

const TEMPLATES = {
  event: [
    { title: 'Cadrer l’événement : public, date, lieu et budget', description: 'Pour qui, combien de personnes, quand et où ; le budget disponible et ses grands postes. Livrable : le budget.' },
    { title: 'Organiser : programme, prestataires et rôles', description: 'Le déroulé, qui fournit quoi, qui fait quoi, et les échéances jusqu’au jour J. Livrable : le rétroplanning.' },
    { title: 'Inviter et communiquer', description: 'Les invitations, les annonces et les relances, prêtes à envoyer. Livrable : les messages.' },
    { title: 'Dernière ligne droite : le jour J', description: 'Tout ce qu’il faut vérifier, apporter et faire, dans l’ordre. Livrable : la liste de tâches.' },
  ],
  business: [
    { title: 'Définir l’offre et la clientèle', description: 'Ce que vous vendez, à qui, ce qui vous distingue, et à quel prix à peu près.' },
    { title: 'Chiffrer le lancement', description: 'Ce que coûte le démarrage, ce que ça doit rapporter, et quand c’est rentable. Livrable : le budget.' },
    { title: 'Le plan de lancement', description: 'Les étapes jusqu’à l’ouverture (démarches, local ou fournisseurs, communication) et leurs échéances. Livrable : le rétroplanning.' },
    { title: 'Les démarches et la check-list d’ouverture', description: 'Ce qu’il reste à faire avant d’ouvrir, dans l’ordre. Livrable : la liste de tâches.' },
  ],
  association: [
    { title: 'Définir l’objet, les membres et le fonctionnement', description: 'À quoi sert l’association, qui la rejoint, qui décide et comment.' },
    { title: 'Créer l’association : statuts et démarches', description: 'Les statuts, l’assemblée constitutive, la déclaration et le compte bancaire. Livrable : la liste de tâches.' },
    { title: 'Budget et financement', description: 'Les dépenses de la première année, les cotisations, les subventions possibles. Livrable : le budget.' },
    { title: 'Lancer : premières actions et communication', description: 'Le premier événement ou la première action, et les messages pour faire connaître l’association. Livrable : les messages.' },
  ],
};
const EXPRESS = [
  { title: 'Cadrage express : objectif, plan d’action et tâches', description: 'Une seule réunion : l’objectif précis, les étapes et leurs échéances, ce qu’il faut faire et dans quel ordre. Livrables : le rétroplanning et la liste de tâches.' },
];

// Ajoute le plan type à la fin du plan (sans doublon de titre) ; renvoie les réunions créées
async function addPlanTemplate(projectId, userId, { kind, express = false }) {
  const template = express ? EXPRESS : TEMPLATES[kind];
  if (!template) return [];
  const existing = new Set((await db('Milestone').where({ projectId }).select('title')).map(m => m.title.trim().toLowerCase()));
  const [{ maxOrder }] = await db('Milestone').max('displayOrder as maxOrder').where({ projectId });
  let order = (maxOrder ?? -1) + 1;
  const rows = template.filter(m => !existing.has(m.title.toLowerCase())).map(m => ({
    id: randomUUID(), projectId, title: m.title, description: m.description, type: 'decision',
    status: 'pending', displayOrder: order++, createdAt: new Date(), createdBy: userId,
  }));
  if (!rows.length) return [];
  return db('Milestone').insert(rows).returning(['id', 'title', 'type', 'status', 'displayOrder']);
}

module.exports = { TEMPLATES, EXPRESS, addPlanTemplate };
