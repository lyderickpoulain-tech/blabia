// Visite guidée (v5.1) : chapitres et bulles, sur les vraies pages, avec le
// projet exemple « Les Feuilles Vagabondes » (server/src/services/demoProject.js).
//
// Étape : {
//   path(ctx)    → page à afficher (ctx = { demoId, meetingId, pastMeetingId }) ; absent = page courante
//   target       → valeur de l'attribut data-tour de l'élément mis en évidence ; absent = bulle centrée
//   title, body  → contenu de la bulle
//   placement    → 'bottom' | 'top' | 'right' | 'left' (défaut : au mieux)
//   interactive  → l'élément mis en évidence reste cliquable
//   waitAction   → pas de bouton « Suivant » : la page appelle tour.next() (ex. créer le projet)
//   prefill      → demande à la page de se pré-remplir (formulaire de création)
// }

const demo = sub => ctx => `/projects/${ctx.demoId}${sub}`;

export const CHAPTERS = [
  {
    id: 'create', label: 'Créer un projet', roles: ['admin', 'member'],
    steps: [
      { path: () => '/dashboard', target: 'new-project', placement: 'bottom',
        title: 'Tout commence par un projet',
        body: 'Un projet, c’est un objectif à atteindre : ouvrir un commerce, organiser un événement, lancer une application… Ce bouton propose aussi un « projet de démo » déjà avancé, pour essayer avec de vrais agents. Ici, créons-en un ensemble, pour l’exemple.' },
      { path: () => '/projects/new', target: 'np-identity', prefill: true,
        title: 'Quel genre de projet ?',
        body: 'Un site, un commerce, un événement, une association… Pour la visite, le formulaire est pré-rempli : un salon de thé à Lyon. Rien ne sera envoyé aux agents.' },
      { target: 'np-brief',
        title: 'Racontez votre projet',
        body: 'Avec vos mots : ce que vous voulez faire, pour qui, et ce qui compte (budget, délai). Les assistants le lisent avant chaque réunion.' },
      { target: 'np-level',
        title: 'Vous et ce sujet',
        body: 'Les assistants adaptent leur façon de parler : des mots de tous les jours si vous débutez, des échanges entre spécialistes si c’est votre métier. Les autres réglages (humour, nombre de questions) sont repliés, modifiables plus tard.' },
      { target: 'np-submit', interactive: true, waitAction: true, placement: 'top',
        title: 'Créez le projet',
        body: 'Cliquez sur « Créer le projet ».' },
      { path: demo(''), target: 'pd-next',
        title: 'Le projet est prêt',
        body: 'Normalement, BlabIA vous propose ici un plan de réunions tiré du brief. Pour l’exemple, avançons de quelques jours : une première réunion a eu lieu, et les agents ont préparé la deuxième.' },
    ],
  },
  {
    id: 'shared', label: 'Vos projets partagés', roles: ['user'],
    steps: [
      { path: () => '/dashboard', target: 'project-card-demo', placement: 'bottom',
        title: 'Les projets partagés avec vous',
        body: 'Chaque projet auquel vous êtes invité apparaît ici, avec son avancement. Celui-ci est un exemple créé pour la visite.' },
      { path: demo(''), target: 'pd-next',
        title: 'Le tableau de bord du projet',
        body: 'Le propriétaire gère le brief, l’équipe d’agents et le plan. Vous, vous participez aux réunions et suivez les décisions.' },
    ],
  },
  {
    id: 'dashboard', label: 'Le tableau de bord', roles: ['admin', 'member', 'user'],
    steps: [
      { path: demo(''), target: 'shell-nav', placement: 'right',
        title: 'Tout le projet, à gauche',
        body: '« À trancher » rassemble tout ce qui attend votre réponse, de toutes les réunions. « Réunions » regroupe le plan et l’historique, « Décisions et actions » le registre, les actions et les missions. Votre bras droit est toujours là, en bas à droite : interrogez-le à tout moment, il revient vers vous quand il a du nouveau. Une nouvelle idée (« et si je vendais mes vinyles ? ») : dites-la-lui, il propose comment faire évoluer le projet et ne change rien sans votre accord.' },
      { target: 'pd-next',
        title: 'La prochaine étape',
        body: 'La réunion à tenir maintenant. Deux façons de la lancer : préparée par les agents avant votre arrivée (ils travaillent sans vous ; « Réunion préparée » s’affiche sur le projet quand leurs conclusions sont prêtes), ou directement avec vous.' },
      { target: 'pd-attention',
        title: 'Ce qui attend votre arbitrage',
        body: 'Toujours en ambre. Ici, une décision remise en question et une action en retard : les agents en tiendront compte à la prochaine réunion.' },
      { target: 'pd-actions',
        title: 'Les actions entre les réunions',
        body: 'À la conclusion d’une réunion, BlabIA vous propose les actions à mener d’ici la suivante. Vous les cochez au fil de l’eau ; la réunion suivante commence par un point d’avancement.' },
      { target: 'pd-history',
        title: 'Historique et coût',
        body: 'Les dernières réunions conclues et le coût réel de l’IA pour ce projet. Ici 0 $ : pour l’exemple, les agents n’ont pas été sollicités.' },
      { target: 'pd-ask', placement: 'top',
        title: 'Demander à BlabIA',
        body: 'Un résumé, la prochaine étape, une recherche : BlabIA répond à partir de tout ce qui a été dit et décidé dans le projet.' },
      { path: demo('/documents'), target: 'docs-list',
        title: 'Les documents de référence',
        body: 'Cahier des charges, devis, étude, règlement : déposez-les ici (PDF, Word, Excel…). Les agents les lisent à chaque réunion et les citent. Ici, une étude de marché.' },
    ],
  },
  {
    id: 'plan', label: 'Le plan des réunions', roles: ['admin', 'member'],
    steps: [
      { path: demo('/reunions'), target: 'plan-list', placement: 'right',
        title: 'Le plan',
        body: 'Les réunions à tenir, numérotées dans l’ordre ; la prochaine est mise en avant. Glissez pour réordonner, insérez une réunion entre deux autres. Les réunions terminées sont repliées en dessous, avec leur compte-rendu.' },
      { target: 'plan-current', placement: 'bottom',
        title: 'La prochaine réunion',
        body: 'Le bouton « Préparer » ouvre la préparation de la réunion (« Reprendre » si elle est déjà ouverte). Un clic sur la carte affiche son détail : statut, ordre du jour, suppression.' },
      { target: 'plan-generate', placement: 'bottom',
        title: 'Laisser BlabIA proposer',
        body: 'À partir du brief, BlabIA propose une suite de réunions. Les réunions suggérées pendant les échanges s’y ajoutent aussi, si vous les gardez.' },
      { path: demo('/parametres'), target: 'settings-dev', placement: 'top',
        title: 'Projet informatique : sans copier-coller',
        body: 'Pour un logiciel ou un site, reliez ici un dépôt GitHub : le prompt d’une réunion Claude Code se lance alors depuis BlabIA. Claude Code travaille avec votre abonnement Claude, puis vous mettez en ligne d’un clic (la base est sauvegardée juste avant). Un site à créer de zéro ? Cochez « Site web à créer de zéro » en créant le projet : BlabIA crée le dépôt et prévoit les réunions (définir le site, son style, puis le construire) ; la mise en ligne est automatique (page Outils), d’abord à une adresse de test, puis à votre nom de domaine. Une fois le dépôt relié, les agents lisent le code quand le sujet de la réunion s’y prête ou qu’une question le demande, et les missions aussi.' },
    ],
  },
  {
    id: 'meeting', label: 'En réunion', roles: ['admin', 'member', 'user'],
    steps: [
      { path: ctx => `/projects/${ctx.demoId}/meeting/${ctx.meetingId}`, target: 'mr-phases', placement: 'bottom',
        title: 'Les temps de la réunion',
        body: 'Préparation (les agents entre eux), briefing (votre arrivée), échanges, conclusion. Ici, les agents ont déjà préparé : vous arrivez au briefing.' },
      { target: 'mr-synthesis',
        title: 'La synthèse',
        body: 'Ce que les agents retiennent de leur débat, en quelques lignes. Le débat complet reste consultable.' },
      { target: 'mr-decisions', interactive: true, placement: 'top',
        title: 'À vous de trancher',
        body: 'Choisissez une option pour chaque question : la recommandation des agents est en premier. Essayez !' },
      { target: 'mr-delegate', interactive: true,
        title: 'Pas d’avis ?',
        body: '« Laisser les agents décider » : ils tranchent ce point entre eux. Vous pourrez toujours les contredire ensuite.' },
      { target: 'mr-submit', placement: 'top',
        title: 'Lancer les échanges',
        body: 'Vos réponses partent ensemble et la discussion reprend. Pendant les échanges, écrivez à tout moment pour réorienter le débat ou contredire un agent. L’animation cadre la réunion aux moments clés ; « Où en est-on ? » lui fait faire le point en trois lignes. Sous chaque bulle, donnez votre avis (bien vu, à côté de la plaque, trop technique, trop long) : les agents s’en souviennent dans tous vos projets.' },
      { target: 'mr-conclude', placement: 'bottom',
        title: 'Conclure',
        body: 'Quand le sujet est traité : BlabIA rédige le compte-rendu, vous le relisez, choisissez les décisions à inscrire au registre et les actions à mener d’ici la prochaine réunion. Le panneau « Relevé en direct » vous montre en continu ce qui est acquis. Le compte-rendu se décline ensuite en relevé de décisions, synthèse exécutive ou procès-verbal.' },
      { path: ctx => `/projects/${ctx.demoId}/meeting/${ctx.pastMeetingId}`, target: 'mr-vigilance',
        title: 'Le contradicteur',
        body: 'Sur les choix à fort enjeu que personne n’a remis en cause, il signale un point de vigilance (2 fois par réunion au plus). Vous en tenez compte, ou vous l’écartez : il n’y revient plus. À la conclusion, il relit aussi les décisions fragiles.' },
    ],
  },
  {
    id: 'close', label: 'Décisions, actions et historique', roles: ['admin', 'member', 'user'],
    steps: [
      { path: demo('/historique'), target: 'hist-first',
        title: 'Les réunions tenues',
        body: 'Chaque réunion conclue garde son compte-rendu, et peut être reprise si besoin. Le propriétaire peut aussi supprimer une réunion : elle quitte alors la mémoire du projet, avec ses décisions et ses actions.' },
      { path: demo('/decisions'), target: 'dec-registry', placement: 'top',
        title: 'Le registre des décisions',
        body: 'Tout ce qui a été tranché, avec la raison et les options écartées. Les agents s’y réfèrent et ne reposent plus ces questions.' },
      { target: 'dec-reopened',
        title: 'Changer d’avis',
        body: 'Une décision ne tient plus ? Remettez-la en question avec un motif, puis « Mettre à l’ordre du jour » : une réunion la retraite, et la nouvelle décision remplace l’ancienne.' },
      { target: 'export-registry', placement: 'bottom',
        title: 'Exporter',
        body: 'Le registre des décisions et les actions, en PDF ou en Word. Chaque compte-rendu de réunion s’exporte aussi, depuis l’Historique.' },
      { path: demo('/actions'), target: 'act-list',
        title: 'Les actions, dans l’ordre',
        body: 'Numérotées dans l’ordre où les mener : flèches pour réordonner, case pour cocher. L’échéance est facultative ; une action en retard passe en ambre. Une action peut aussi devoir être faite « avant une réunion » du plan : cette réunion ne pourra pas se tenir tant que l’action n’est pas faite (ou supprimée). Les agents ouvrent la réunion suivante par un point d’avancement. Une réunion peut aussi proposer de préciser une action, de l’annuler si elle devient inutile ou de la cocher si elle est faite : vous validez à la conclusion (les annulées se rétablissent depuis « Annulées »). Une action peut enfin être confiée à un agent (mission) ou traitée en réunion : les agents y reçoivent le rapport de la mission, et l’action est cochée quand la réunion est conclue.' },
      { target: 'mission-list', placement: 'top',
        title: 'Les missions des agents',
        body: 'En réunion, un agent peut proposer de confier un travail approfondi (recherche, analyse, rédaction) à un sous-agent, quand la réunion ne peut pas conclure sans lui. La lancer reporte la réunion : une réunion « Reprendre : … » s’ajoute au plan, juste après, et se tiendra avec le rapport. Vous la lancez au niveau choisi — légère, standard ou approfondie. Rapport prêt : « Intégrer le CR au projet » (documents, mémoire des agents, action cochée) ou « Ne pas intégrer » ; la mission traitée disparaît de la liste. Ici, une mission qui attend votre accord.' },
      { target: 'act-reminders', placement: 'bottom',
        title: 'Un rappel chaque semaine',
        body: 'Activez-le par projet : un e-mail récapitule les actions en retard, de la semaine et les prochaines. Le jour d’envoi se choisit dans votre profil (lundi par défaut).' },
    ],
  },
  {
    id: 'admin', label: 'Administration', roles: ['admin'],
    steps: [
      { path: () => '/admin/users', target: 'admin-users',
        title: 'Les comptes',
        body: 'Admin : tous les projets et l’administration. Membre : crée et mène ses projets. User : collaborateur, voit seulement les projets où il est invité.' },
      { target: 'admin-tabs', placement: 'bottom',
        title: 'Inviter',
        body: 'Dans « Invitations », envoyez une invitation par e-mail, éventuellement liée à un projet : la personne le rejoint dès son inscription.' },
    ],
  },
];

export const roleKind = role => (role === 'admin' || role === 'supervisor') ? 'admin' : role === 'user' ? 'user' : 'member';

export const chaptersFor = role => CHAPTERS.filter(c => c.roles.includes(roleKind(role)));

// Chapitres qui n'ont pas besoin du projet exemple au démarrage
export const NEEDS_DEMO_AT_START = id => !['create', 'admin'].includes(id);
