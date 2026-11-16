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
- Trois à cinq phrases « Ce sera fini quand… », tirées du récit, vérifiables (« il y a 5 jeux par tranche d'âge »).
</fini_quand>`;

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
    `Écris maintenant la PREMIÈRE VERSION complète de l'ouvrage.
IDÉES : relève chaque idée, envie ou demande distincte du porteur, avec ses mots (courte citation), une par ligne, sous la forme :
- + « ses mots » :: Titre de la partie où elle se trouve
(ou « :: pas encore — raison en quelques mots » si elle n'y est vraiment pas).`,
  ].filter(Boolean).join('\n\n');
  return { system: SYSTEM, user };
}

// Version suivante : version en cours + ce que le porteur a changé ou commenté
function nextVersionPrompt({ story, current, assumptions, comments, ideas, criteria }) {
  const assumptionLines = assumptions.map(a => a.state === 'changed'
    ? `- ${a.statement} :: ${a.value}   ← CHANGÉ PAR LE PORTEUR : à appliquer partout`
    : `- ${a.statement} :: ${a.value}`).join('\n') || '(aucune)';
  const commentLines = comments.map(c => `- Sur « ${c.section || 'l’ensemble'} » : ${c.content}`).join('\n') || '(aucun)';
  const ideaLines = ideas.map(i => `- ${i.ref} « ${i.text} »`).join('\n') || '(aucune)';
  const user = [
    `RÉCIT DU PORTEUR (ses mots) :\n${story}`,
    `VERSION EN COURS (n° ${current.number}) :\n${current.content}`,
    `SUPPOSITIONS ACTUELLES :\n${assumptionLines}`,
    `COMMENTAIRES DU PORTEUR À PRENDRE EN COMPTE :\n${commentLines}`,
    `IDÉES DU PORTEUR DÉJÀ RELEVÉES :\n${ideaLines}`,
    criteria.length ? `CE SERA FINI QUAND :\n${criteria.map(c => `- ${c.text}`).join('\n')}` : null,
    `Écris la VERSION SUIVANTE, complète (pas seulement les changements) : applique chaque supposition changée et chaque commentaire, garde le reste tel quel sauf ce qui en dépend.
<resume> : ce qui a changé, en deux à quatre phrases.
<suppositions> : la liste complète à jour ; une valeur choisie par le porteur se recopie mot pour mot.
<idees> : une ligne par idée déjà relevée, sous la forme « - I3 :: Titre de la partie » (ou « :: pas encore — raison ») ; puis une ligne « - + « ses mots » :: Titre » pour chaque idée nouvelle tirée de ses commentaires.
<fini_quand> : recopie la liste telle quelle.
<nom> et <gabarit> : recopie ceux du projet.`,
  ].filter(Boolean).join('\n\n');
  return { system: SYSTEM, user };
}

module.exports = { SYSTEM, firstVersionPrompt, nextVersionPrompt };
