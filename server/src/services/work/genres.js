// v6 : registre des genres d'ouvrage. Le cœur (services/work/) ne connaît que ce registre :
// un genre s'ajoute en l'enregistrant ici (demain « maquette », « site » pour BlabIA +),
// sans modifier le constructeur ni les routes.
//
// Un genre = un rendu (aujourd'hui « markdown » : un dossier découpé en parties « ## ») et
// des gabarits, chacun avec les parties attendues. Les gabarits du dossier reprennent les
// plans types de la v5.1 (services/planTemplates.js : événement, commerce, association),
// devenus des parties du dossier au lieu de réunions.
// reviewers (phase 2) : les assistants qui relisent ce genre de dossier en réunion, par nom
// (assistants par défaut) ; à défaut, les premiers assistants du projet.

const genres = new Map();

function registerGenre(genre) {
  if (!genre?.id || !genre.templates || !genre.defaultTemplate) throw new Error('Genre d’ouvrage incomplet');
  genres.set(genre.id, genre);
}

const getGenre = id => genres.get(id) || genres.get('dossier');
const listGenres = () => [...genres.values()];

function templateOf(genreId, key) {
  const g = getGenre(genreId);
  return g.templates[key] || g.templates[g.defaultTemplate];
}

// Le dossier : tout projet dont le résultat est un document structuré.
registerGenre({
  id: 'dossier',
  label: 'Dossier',
  render: 'markdown',
  defaultTemplate: 'autre',
  templates: {
    jeu: {
      label: 'Jeu',
      when: 'un jeu (de société, de cartes, de rôle, d’extérieur…)',
      parts: ['Le principe', 'Le matériel', 'La mise en place', 'Les règles', 'Le déroulé d’un tour', 'La fin de la partie', 'Le plateau esquissé'],
      illustration: 'Le plateau ou la disposition du jeu, en un dessin simple (bloc svg).',
      reviewers: ['Créatif', 'Critique', 'Expert'],
    },
    evenement: {
      label: 'Événement',
      when: 'un événement (fête, mariage, séminaire, sortie, salon…)',
      parts: ['L’événement en bref', 'Le programme', 'Le budget', 'Le rétroplanning', 'Qui fait quoi', 'Les messages prêts à envoyer'],
      reviewers: ['Stratège', 'Critique', 'Rédacteur'],
    },
    liste: {
      label: 'Liste ou sélection',
      when: 'une liste, une sélection, un comparatif, une shortlist (cadeaux, lieux, produits, idées…)',
      parts: ['Ce qui était demandé', 'La liste complète', 'Comment la liste a été faite', 'Ce qu’il reste à vérifier'],
      reviewers: ['Chercheur', 'Analyste', 'Critique'],
    },
    etude: {
      label: 'Étude',
      when: 'une étude, une recherche, une analyse ou une réponse argumentée à une question',
      parts: ['La question', 'La réponse en bref', 'L’analyse', 'Les options comparées', 'La recommandation'],
      reviewers: ['Analyste', 'Chercheur', 'Critique'],
    },
    commerce: {
      label: 'Commerce ou entreprise',
      when: 'un commerce, une entreprise, une activité à lancer ou à développer',
      parts: ['L’offre et la clientèle', 'Ce qui vous distingue', 'Les chiffres du lancement', 'Le plan de lancement', 'Les démarches'],
      reviewers: ['Stratège', 'Analyste', 'Créatif'],
    },
    association: {
      label: 'Association',
      when: 'une association à créer ou à faire vivre',
      parts: ['L’objet et les membres', 'Le fonctionnement', 'Les statuts (projet)', 'Les démarches', 'Le budget de la première année', 'Les premières actions'],
      reviewers: ['Stratège', 'Rédacteur', 'Critique'],
    },
    site: {
      label: 'Site ou application (dossier)',
      when: 'un site ou une application à faire réaliser : le dossier qui le décrit, sans le construire',
      parts: ['Le site en bref', 'Pour qui', 'Les pages', 'Les textes', 'Le style', 'Ce qu’il faudra pour le construire'],
      illustration: 'L’allure de la page d’accueil, en un croquis simple (bloc svg).',
      reviewers: ['Rédacteur', 'Créatif', 'Critique'],
    },
    autre: {
      label: 'Projet',
      when: 'tout autre projet',
      parts: ['Le projet en bref', 'puis les parties qui conviennent à ce projet'],
      reviewers: ['Créatif', 'Critique', 'Analyste'],
    },
  },
});

module.exports = { registerGenre, getGenre, listGenres, templateOf };
