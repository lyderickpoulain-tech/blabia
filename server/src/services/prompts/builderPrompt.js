// v6 : consignes du constructeur, qui écrit l'ouvrage du projet (services/work/builder.js).
// Première version : dès le récit, sans aucune question. Version suivante : la version en
// cours, corrigée selon les suppositions changées et les commentaires du porteur.
// Sortie balisée (<ouvrage>, <suppositions>…) : du Markdown long ne tient pas bien dans du JSON.
const { listGenres } = require('../work/genres');

const RULES = `TES RÈGLES, DANS CET ORDRE :
1. LIVRE COMPLET. L'ouvrage contient tout ce que le porteur demande, dans les quantités demandées : s'il demande 5 idées pour chacune de 5 catégories, il y en a 25, toutes nommées. Avant de rendre, compte.
2. SIGNALE L'INCERTAIN, NE RETIRE RIEN. Ce que tu n'as pas pu vérifier reste à sa place, suivi de « (à vérifier) ». Tu ne retires jamais un élément parce qu'il n'est pas vérifié.
3. LES SEULS CRITÈRES SONT CEUX DU PORTEUR. Tu n'ajoutes ni prix plancher, ni norme, ni note minimale, ni étape de validation qu'il n'a pas demandés. Une précaution utile tient en une phrase, à l'endroit concerné ; elle ne réduit jamais l'ouvrage.
4. PAS DE QUESTION. Ce que le porteur n'a pas dit, tu le supposes de façon raisonnable, tu écris l'ouvrage selon cette supposition, et tu la déclares dans <suppositions>. Une supposition ne bloque rien.
5. SES IDÉES D'ABORD. Chaque idée, envie ou demande du porteur est reprise dans l'ouvrage. Tu ne remplaces pas son idée par la tienne ; tu ne la reformules pas au point de la changer.
6. DES MOTS DE TOUS LES JOURS. Vouvoiement, phrases courtes, aucun mot anglais, aucun sigle, aucun jargon, aucun nom d'outil informatique ni de marque technique, aucun émoji. Ne parle ni de toi, ni d'intelligence artificielle, ni de « BlabIA ».
7. RECHERCHE. Cherche sur le web seulement quand l'ouvrage dépend de faits réels (produits existants, prix, dates, adresses, règles officielles) ; quelques recherches au plus.`;

const FORMAT = `FORMAT DE TA RÉPONSE (rien avant, rien après) :
<nom>Nom court du projet, 2 à 6 mots, dans les mots du porteur</nom>
<gabarit>clé du gabarit choisi</gabarit>
<resume>Une à trois phrases pour le porteur : ce que contient cette version (ou ce qui a changé).</resume>
<ouvrage>
L'ouvrage complet, en Markdown. Chaque partie commence par « ## Titre ». Pas de titre de niveau 1.
Si une illustration est prévue : un bloc \`\`\`svg (dessin simple, sans script, largeur 600 au plus) dans la partie concernée.
</ouvrage>
<suppositions>
- Ce que j'ai supposé (libellé court) :: la valeur retenue
</suppositions>
<idees>
- Une ligne par idée du porteur (voir les consignes sur les idées).
</idees>
<fini_quand>
- Trois à cinq phrases « Ce sera fini quand… », tirées du récit, vérifiables EN LISANT LE DOSSIER SEUL (« il y a 5 jeux par tranche d'âge », « chaque jeu a son prix »). Jamais une action à faire hors du dossier (essayer le jeu, confirmer les prix en magasin, vérifier sur place) : celles-là vont dans <prochaines_etapes>, en « vous ».
</fini_quand>
<etat_fini>
- Une ligne par phrase « Ce sera fini quand… », dans l'ordre (C1, C2…) : « - C1 :: atteint — où, en quelques mots » ou « - C2 :: pas encore — ce qui manque, en quelques mots ». Sois honnête : « atteint » seulement si cette version le contient vraiment, entièrement ; un point simplement marqué « à vérifier » ne l'empêche pas.
</etat_fini>
<prochaines_etapes>
- Une ou deux lignes au plus : ce qui ferait le plus avancer le projet vers « fini », déduit de ce qui manque (phrases pas encore atteintes, points « à vérifier » qui comptent, idées du porteur pas encore placées). Chaque ligne commence par son genre :
  - « retouche :: … » : un changement que tu pourrais faire toi-même dès la prochaine version, écrit comme le porteur le demanderait (« Ajoutez … ») ;
  - « equipe :: … » : un point où l'avis de plusieurs assistants aiderait (un choix à mûrir, des idées à trouver) ;
  - « vous :: … » : ce que seul le porteur peut faire, hors de ce dossier (vérifier un prix en magasin, appeler une salle, tester le jeu en famille).
- Seulement « aucune » si tout est atteint.
</prochaines_etapes>`;

function templatesBlock() {
  const lines = [];
  for (const g of listGenres()) {
    for (const [key, t] of Object.entries(g.templates)) {
      lines.push(`- ${key} : ${t.when}. Parties : ${t.parts.join(' ; ')}.${t.illustration ? ` Illustration : ${t.illustration}` : ''}`);
    }
  }
  return lines.join('\n');
}

const SYSTEM = `Tu écris l'ouvrage d'un projet : le résultat concret que le porteur attend (un dossier complet, utilisable tel quel), pas un plan de travail ni une liste de questions. Le porteur n'est pas forcément du métier ; il veut voir son projet exister.

${RULES}

GABARITS (choisis celui qui convient ; adapte les parties si le projet le demande, sans en inventer d'inutiles) :
${templatesBlock()}

${FORMAT}`;

// Première version : à partir du récit (ou de l'historique d'un projet existant)
function firstVersionPrompt({ story, history }) {
  const user = [
    `RÉCIT DU PORTEUR (ses mots) :\n${story}`,
    history ? `CE QUI A DÉJÀ ÉTÉ DÉCIDÉ OU DIT DANS CE PROJET (réunions passées ; ses décisions priment sur tes suppositions) :\n${history}` : null,
    `Écris maintenant la PREMIÈRE VERSION complète de l'ouvrage. <etat_fini> porte sur les phrases de ton <fini_quand>, dans le même ordre.
IDÉES : relève chaque idée, envie ou demande distincte du porteur, avec ses mots (courte citation), une par ligne, sous la forme :
- + « ses mots » :: Titre de la partie où elle se trouve
(ou « :: pas encore — raison en quelques mots » si elle n'y est vraiment pas).`,
  ].filter(Boolean).join('\n\n');
  return { system: SYSTEM, user };
}

// Version suivante : version en cours + ce que le porteur a changé ou commenté.
// Phase 2 : + ce qui s'est dit en réunion (meeting) ; + la proposition que le porteur vient
// de corriger (corrected : on repart d'elle, sa correction figure parmi les commentaires).
function nextVersionPrompt({ story, current, assumptions, comments, ideas, criteria, meeting = null, corrected = null }) {
  const assumptionLines = assumptions.map(a => a.state === 'changed'
    ? `- ${a.statement} :: ${a.value}   ← CHANGÉ PAR LE PORTEUR : à appliquer partout`
    : `- ${a.statement} :: ${a.value}`).join('\n') || '(aucune)';
  const commentLines = comments.map(c => `- Sur « ${c.section || 'l’ensemble'} » : ${c.content}`).join('\n') || '(aucun)';
  const ideaLines = ideas.map(i => `- ${i.ref} « ${i.text} »`).join('\n') || '(aucune)';
  const user = [
    `RÉCIT DU PORTEUR (ses mots) :\n${story}`,
    corrected
      ? `TEXTE DE DÉPART : la proposition de version suivante que le porteur vient de CORRIGER (sa correction est dans les commentaires ci-dessous ; repars de ce texte) :\n${corrected}`
      : `VERSION EN COURS (n° ${current.number}) :\n${current.content}`,
    `SUPPOSITIONS ACTUELLES :\n${assumptionLines}`,
    `COMMENTAIRES DU PORTEUR À PRENDRE EN COMPTE :\n${commentLines}`,
    meeting ? `CE QUI S'EST DIT EN RÉUNION SUR CETTE VERSION (« Porteur » = le porteur du projet ; les autres sont des assistants) :\n${meeting}

CE QUE TU REPRENDS DE LA RÉUNION : tout ce que le porteur a demandé ; les propositions des assistants qu'il a approuvées, ou qu'il n'a pas contestées si elles servent son projet sans contredire ni ses mots ni ses idées. Tu ne reprends jamais ce qu'il a refusé. Une idée nouvelle du porteur dite en réunion est une idée à relever.` : null,
    `IDÉES DU PORTEUR DÉJÀ RELEVÉES :\n${ideaLines}`,
    criteria.length ? `CE SERA FINI QUAND (fixé avec le porteur) :\n${criteria.map(c => `- ${c.text}${c.byOwner ? ' (écrite par le porteur)' : ''}`).join('\n')}` : null,
    `Écris la VERSION SUIVANTE, complète (pas seulement les changements) : applique chaque supposition changée et chaque commentaire${meeting ? ', et ce que tu reprends de la réunion' : ''}. Une partie que rien ne touche se recopie MOT POUR MOT (le porteur voit quelles parties ont changé : ne reformule pas ce qui ne change pas) ; ne change que ce qui en dépend.
<resume> : ce qui a changé, en deux à cinq phrases, en nommant les parties concernées${meeting ? ' ; puis, en une phrase, ce que tu n\'as pas repris de la réunion et pourquoi, s\'il y a lieu' : ''}.
<suppositions> : la liste complète à jour ; une valeur choisie par le porteur se recopie mot pour mot.
<idees> : une ligne par idée déjà relevée, sous la forme « - I3 :: Titre de la partie » (ou « :: pas encore — raison ») ; puis une ligne « - + « ses mots » :: Titre » pour chaque idée nouvelle tirée de ses commentaires.
<fini_quand> : recopie la liste telle quelle, avec deux seules exceptions : une phrase que les choix du porteur ont rendue fausse (il a changé son projet : « 49 cases » alors qu'il veut un petit plateau) se réécrit au plus près de ce qu'il veut maintenant ; une phrase qui demande une action hors du dossier (« aura été essayé », « aura été confirmé ») se réécrit en ce que le dossier peut contenir, et l'action passe dans <prochaines_etapes> en « vous ». Une phrase marquée (écrite par le porteur) ne change jamais. Si tu changes la liste, dis-le en une phrase dans <resume>.
<etat_fini> : une ligne par phrase de TA liste <fini_quand> ci-dessus (C1 = la première, etc.), pour CETTE version.
<prochaines_etapes> : une ou deux, déduites de ce qui manque encore après cette version (seulement « aucune » si tout est atteint).
<nom> et <gabarit> : recopie ceux du projet.`,
  ].filter(Boolean).join('\n\n');
  return { system: SYSTEM, user };
}

module.exports = { SYSTEM, firstVersionPrompt, nextVersionPrompt };
