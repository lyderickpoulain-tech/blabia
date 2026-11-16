# Prompt Claude Code — BlabIA v6 : « l'ouvrage d'abord »

Tu reprends BlabIA (dépôt `C:\BlabIA`). Avant toute chose, lis dans cet ordre : `docs/passation-fable.md`, `CLAUDE.md`, puis `docs/feuille-de-route-v5.1.md` (§ 4 et D27 à D43). Les règles de travail du § 7 de la passation sont impératives (base de prod, migrations additives, `git fetch` et rebase, tests, guide et visite guidée à jour, français, pas d'émoji).

Quand ce document contredit la passation ou la feuille de route, ce document prime : le porteur a demandé de remettre en cause les choix précédents chaque fois qu'ils ajoutent de la technique pour l'utilisateur.

## 1. Pourquoi cette version

BlabIA promet : « Vous décrivez votre projet, une équipe d'assistants en discute avec vous, vous décidez, BlabIA fait le reste. » En pratique, aucun projet n'a abouti. Le porteur le résume ainsi : BlabIA est tatillon sur des détails qu'il juge bloquants avant même qu'une maquette existe, et il ne part pas assez des idées de l'utilisateur.

La production le confirme (lecture du 15/11/2026 : 9 projets, 41 réunions, environ 35 $ d'IA) :

- **Aucun des 9 projets n'a livré ce que son brief demandait.**
- **Le porteur ne parle presque pas.** 987 messages d'assistants pour 22 messages écrits par l'humain ; le reste de sa participation tient en 122 réponses à des cartes à choix.
- **« Noël CSE », après toutes les corrections de la v5.1** : le brief demandait 5 jeux pour chacune de 5 tranches d'âge, soit 25 jeux. Après 7 réunions, 34 décisions et 6,83 $, la liste diffusée en compte 10, dont aucun pour les 0-2 ans. Les assistants se sont imposé des critères que personne n'avait demandés (prix plancher, norme à vérifier sur la boîte, note à confirmer sur un second site) et ont retiré les jeux qui n'y satisfaisaient pas.
- **« Site de numérologie »** : 12 réunions, 58 décisions, 28 actions dont 12 annulées, et toujours pas de site.

La cause est dans la conception. Les réunions parlent du travail et ne le font jamais (le prompt des assistants interdit de rédiger le livrable pendant les échanges) ; le plan place 8 à 10 réunions avant le premier résultat visible ; les assistants ne peuvent que demander, supposer ou ajouter des précautions ; les idées du porteur ne sont suivies nulle part. Et l'interface, enrichie par 43 évolutions, demande à un novice de comprendre des réglages, des outils et des comptes qui ne le regardent pas.

La v6 inverse l'ordre : **le résultat existe dès les premières minutes, les réunions servent à l'améliorer, et l'utilisateur ne voit aucune technique.**

## 2. La règle du minimum de technique

Le porteur n'est pas développeur, et il est lui-même la cible de BlabIA : quelqu'un qui a une idée, aucune compétence technique, et qui ne veut ni comptes à ouvrir ni réglages à comprendre. Cette règle passe avant toutes les autres et s'applique à chaque écran que tu crées ou modifies.

**Ce qu'un utilisateur ne voit jamais, sauf s'il a activé le mode avancé :**

- un nom d'outil ou de marque technique (GitHub, Claude Code, Railway, API, dépôt, hébergeur), un nom de modèle (Sonnet, Opus), des jetons, un coût en dollars ;
- un réglage à faire avant d'obtenir un résultat ;
- un mot anglais, un sigle, un repère interne (R2, A3, V0) ;
- un choix dont il ne peut pas mesurer les conséquences.

**Ce que cela change, y compris par rapport à la v5.1 :**

1. **Création en une seule question.** « Racontez votre projet », puis « Créer ». Le genre de projet, le nom et le niveau de langage sont déduits par BlabIA et présentés comme des suppositions modifiables, au même titre que le reste. Les quatre questions actuelles, le plan type à cocher, le mode express et les réglages (humour, mode de questions, contradicteur) quittent l'écran de création.
2. **Langage simple par défaut.** Plus de question « Vous et ce sujet ». Les assistants parlent avec des mots de tous les jours et s'ajustent aux réactions du porteur (« Trop technique », « Trop long », déjà en place) et au vocabulaire qu'il emploie lui-même. Le réglage de l'humour disparaît lui aussi de toute l'interface pour l'instant, Paramètres compris (décision du porteur) : le nouveau prompt des assistants vise un ton naturel et chaleureux de collègues, sans mécanique d'humour ; le code existant reste, inutilisé hors parcours technique.
3. **Une réunion se lance en un clic.** BlabIA choisit les assistants, le modèle et l'usage de la recherche web. Rien de cela n'est affiché.
4. **Les coûts de l'IA sortent de l'interface courante.** Tant que BlabIA n'est pas commercialisé, l'utilisateur ne paie rien à l'usage : les montants, modèles et jetons ne sont visibles que dans l'administration. Le journal des coûts reste complet.
5. **Un mode avancé, désactivé par défaut**, réglé par personne dans son profil. Il rouvre tout ce que la v6 masque : parcours technique v5.1 (outils, développements, GitHub, Railway, clé API), préparation sans l'humain, missions, réunion tenue par le bras droit, vue salle, ordre du jour, actions bloquantes, formats de compte rendu, modes de questions, choix du modèle, coûts. Active-le sur le compte du porteur pour qu'il ne perde rien.
6. **Un novice qui décrit un site n'entre plus dans le parcours technique.** Il obtient un dossier de son site (ce qu'il contient, pour qui, les pages, les textes, le style) comme n'importe quel projet libre. La construction viendra avec « BlabIA + » (§ 3).
7. **Des mots simples dans l'interface.** « Ouvrage », « pari », « critère d'achèvement » et « V0 » sont les mots de travail de ce document, pas ceux de l'écran. À l'écran : « Votre projet », « Ce que j'ai supposé », « Ce sera fini quand… », « Première version », « Version 2 ». Propose tes libellés au porteur à la fin de la phase 1.
8. **Un menu de projet réduit** : Mon projet, Réunions, Documents, Paramètres. Ce qui attend le porteur s'affiche sur « Mon projet », sans page à part ; les décisions prises se lisent dans le projet lui-même. Le bras droit reste accessible partout.
9. **Deux gestes pour faire avancer le projet**, tous deux sur « Mon projet » : écrire ce qu'on veut changer (le bras droit fait la retouche), ou « Demander l'avis de l'équipe » (une réunion).

**Contrôle.** Écris un test automatique qui parcourt les textes des écrans accessibles sans le mode avancé et échoue s'il y trouve un terme d'une liste interdite (noms d'outils et de modèles, « API », « token », « jeton », « dépôt », « $ », « brief », « stack », repères internes). À la fin de chaque phase, rejoue le parcours dans un navigateur dans le rôle de « Gérard » (boulanger, aucune connaissance technique, D35) et rapporte : nombre de clics et de décisions entre la connexion et la première version, tout mot qu'il ne comprendrait pas, tout endroit où il ne saurait pas quoi faire.

**Et pour le porteur lui-même :**

- Tes comptes rendus sont en français courant : ce qui change, ce que tu as vérifié, ce qu'il doit faire. Le détail technique va dans la feuille de route.
- Ne lui soumets pas un choix technique : fais-le, et dis-le en une phrase. Ne lui soumets que ce qui touche à ce que voit l'utilisateur, à l'argent ou à un risque pour ses données, sous la forme d'une recommandation à laquelle il répond par oui ou non.
- Tout ce que tu peux faire toi-même, fais-le. Quand un geste lui revient, donne-le pas à pas : quelle page ouvrir, où cliquer, quoi copier et où le coller, comment vérifier. Regroupe ces gestes en fin de phase. Ne lui demande jamais de coller un secret dans la conversation.
- Propose-lui toute simplification qui ne dégrade pas le résultat. S'il bute sur quelque chose, un novice butera aussi : note-le comme un défaut de BlabIA.

## 3. Périmètre : les projets libres d'abord

- **La v6 porte sur les projets libres** : tout ce dont le résultat est un dossier. Jeu de société, événement, association, commerce, étude, liste, cahier des charges, description d'un site ou d'un logiciel à faire.
- **Construire et mettre en ligne** un site ou un logiciel formera plus tard une extension, nommée provisoirement **« BlabIA + »**. Elle n'est pas dans ce prompt, sauf l'étude de la phase 5. Le parcours technique v5.1 reste en l'état, derrière le mode avancé.
- **Prévois la dissociation dès maintenant**, sans la réaliser. Le cœur (ouvrage, versions, suppositions, idées, réunions, critères, livraison) ne doit rien importer de ce qui est propre au technique : `github`, `githubWorkflows`, `devTasks`, `devTools`, `railway`, `repoOverview`, `codeContext`, `websiteStarter`, `services/tools/` et leurs routes et pages. Les genres d'ouvrage s'enregistrent dans un registre (aujourd'hui « dossier » ; demain « maquette », « site ») de sorte qu'un genre s'ajoute sans modifier le cœur. Note dans la feuille de route les dépendances qui restent à couper. Pas de découpage en paquets ni de second dépôt.

## 4. Le modèle de la v6

1. **L'ouvrage est au centre du projet.** Chaque projet a un ouvrage, versionné, affiché en premier. C'est un dossier structuré selon le genre de projet. Pour un jeu : principe, matériel, règles, déroulé d'un tour, plateau esquissé. Pour un événement : programme, budget, rétroplanning, messages. Pour une liste ou une étude : la liste ou l'étude elle-même, complète. Les plans types de `server/src/services/planTemplates.js` deviennent des gabarits de dossier. Les illustrations s'affichent dans l'iframe isolée existante (`client/src/components/meeting/ArtifactCard.jsx`, mêmes règles de sécurité).
2. **La première version est produite juste après le récit du projet, sans aucune question.** Un appel « constructeur » (modèle fort, sortie longue, recherche web quand le projet demande des faits) produit une version complète, même imparfaite. Objectif mesuré : moins de trois minutes entre « Créer » et la première version affichée, avec une attente qui dit ce qui se passe.
3. **Livrer complet, signaler l'incertain.** L'ouvrage contient toujours tout ce que le porteur demande, dans les quantités demandées. Ce qui n'est pas vérifié est marqué « à vérifier » à l'endroit concerné ; il n'est jamais retiré. Les seuls critères qui s'appliquent sont ceux du porteur : un assistant peut suggérer une précaution en une phrase, il ne peut pas l'imposer ni s'en servir pour réduire l'ouvrage.
4. **Des suppositions à la place des questions.** Tout ce que le porteur n'a pas dit devient une supposition affichée à côté de l'ouvrage (« J'ai supposé : 2 à 4 joueurs, parties de 30 minutes »), modifiable d'un clic à tout moment. Une supposition ne bloque jamais rien. Les cartes de décision ne servent plus qu'à trois cas : le porteur demande explicitement à choisir ; le choix engage de l'argent, une publication ou un nom ; un fait nouveau contredit une de ses réponses.
5. **Les idées du porteur sont suivies une à une, et il a la parole.** À la création, puis à chaque message du porteur, BlabIA relève ses idées avec ses mots. Chaque version indique, pour chaque idée, où elle se trouve ou qu'elle n'y est pas encore. Aucune idée n'est écartée ou reformulée sans son accord. Le porteur réagit d'abord en texte libre : il peut commenter n'importe quelle partie de l'ouvrage, et chaque réunion commence par lui demander ce qu'il en pense. Ce suivi remplace « Votre vision ».
6. **Une réunion améliore l'ouvrage et se termine par une nouvelle version.** Deux ou trois assistants réagissent à la version en cours, chacun depuis sa spécialité, par une proposition concrète ou une critique ; le porteur réagit ; à la conclusion, le constructeur produit la version suivante, et le compte rendu se réduit à « ce qui a changé ». La règle « personne ne rédige le livrable » est supprimée.
7. **Un cap court.** Avec la première version, BlabIA propose trois à cinq phrases « Ce sera fini quand… », tirées du récit du projet (« il y a 5 jeux par tranche d'âge »), que le porteur corrige s'il le veut. BlabIA n'affiche que la ou les deux prochaines étapes, recalculées après chaque version. Plus de plan de 8 à 10 réunions.
8. **Une fin.** Quand tout est atteint, BlabIA propose la livraison : le dossier final à télécharger (PDF et Word, exports existants).

Principes de la passation (§ 4) conservés : l'humain décide et seul l'humain conclut ; une réponse de l'humain ne se change jamais sans lui ; pas de monologue ; « assistants », vouvoiement, aucun émoji ; tout appel par `server/src/services/anthropic.js` avec journal des coûts ; cache des prompts. Le principe « coûts annoncés tôt » ne vaut plus que pour ce que l'utilisateur paie lui-même.

## 5. Méthode de travail

- **Une phase par session, dans l'ordre.** À la fin de chaque phase : tests verts, `npm run build` du client, guide, visite guidée et feuille de route à jour (nouvelle section « v6 »), parcours « Gérard » rejoué, puis **arrête-toi** et rends compte. N'entame pas la phase suivante sans l'accord du porteur.
- **Ne supprime rien.** Ce qui quitte l'interface passe derrière le mode avancé ; code et tables restent.
- **Trois projets de référence**, à rejouer avec la vraie IA sur la base de dev à la fin des phases 1, 2 et 3 (coût annoncé avant de lancer) :
  1. « Créons un jeu de société sur le thème des volcans, pour jouer en famille. »
  2. Le récit réel de « Noël CSE » (à recopier depuis la prod avec l'accord du porteur). Attendu dès la première version : 25 jeux nommés, 5 par tranche, les incertitudes marquées et non retirées.
  3. Le récit réel de « Trouver un marché de niche » (shortlist de 5 à 10 projets scorés).

  Mesures : délai jusqu'à la première version ; questions posées avant (attendu : zéro) ; part des demandes et idées présentes dans la première version ; nombre de réunions jusqu'à la fin ; part des messages écrits par le porteur ; coût, à comparer aux 6,83 $ et 7 réunions de « Noël CSE » en v5.1.
- **Modèles.** Avant d'écrire un appel, vérifie dans la documentation Anthropic à jour (skill `claude-api`) les identifiants, tarifs et paramètres ; ne te fie pas à ta mémoire. Ajoute dans `server/src/services/models.js` un rôle `BUILDER_MODEL` et son tarif dans `pricing.js`. Compare sur les trois projets Sonnet 5.5, Opus 5.5 et Fable 5.1 (absent de `models.js`, cinq fois le prix de Sonnet par jeton). Recommande un modèle en une phrase, avec le coût d'un projet type en euros ; le porteur dit oui ou non.

## 6. Phases

### Phase 0 — Sécurité et entretien (courte)

1. **Clé de chiffrement séparée.** Les clés API et jetons Railway enregistrés par les utilisateurs sont chiffrés avec une clé dérivée de `JWT_SECRET` (`server/src/utils/secretBox.js`) : changer ce secret les rend illisibles (constaté lors de la rotation du 15/11/2026, après l'incident Railway du 21 octobre). Introduis une variable dédiée, avec lecture de l'ancienne dérivation en repli et rechiffrement automatique à la première lecture réussie, pour que le porteur n'ait aucun script à lancer.
2. **Dépendances.** Applique les mises à jour mineures et correctives. Remplace `xlsx` 0.18.5 (version npm non maintenue, failles connues) par une solution maintenue en JS pur. Monte le SDK Anthropic (0.132 → 1.x) si les tests passent sans réécriture. Pour les autres versions majeures en retard (Express, Prisma, React, Vite, Tailwind, React Router, nodemailer, pdf-parse), ne migre rien : consigne dans la feuille de route ce que tu recommandes et dis-le au porteur en deux phrases.
3. **Sauvegardes sans ligne de commande.** La sauvegarde de la prod avant chaque mise en ligne passe par une commande Docker lancée à la main. Le service Postgres de Railway a un onglet « Backups » : vérifie ce qu'il offre sur l'abonnement du porteur et mets en place la voie la plus simple qui reste aussi sûre.
4. **`CLAUDE.md`** : remets-le à jour (vision, règle du § 2, périmètre du § 3, renvoi vers ce document).

### Phase 1 — Création en une question, ouvrage et première version

- Modèle de données (migrations additives) : ouvrage, versions (contenu, genre, auteur, résumé de ce qui a changé), suppositions (énoncé, valeur, état), idées du porteur (texte d'origine, source, présence par version), commentaires du porteur sur une partie de l'ouvrage, mode avancé par personne.
- Registre des genres d'ouvrage et service constructeur : récit → genre, nom, première version, suppositions, idées, phrases « Ce sera fini quand… ».
- Nouvel écran de création (une question) et écran « Mon projet » : la version en cours en grand, les idées et leur présence, les suppositions modifiables (en changer une propose de refaire la version), les mentions « à vérifier », le commentaire sur une partie, les versions précédentes.
- Mode avancé : réglage dans le profil, activé sur le compte du porteur ; test de la liste interdite.
- Projets existants : « Créer mon projet à partir de l'historique » (récit, décisions, comptes rendus).
- Tests avec l'IA simulée ; rejeu des trois projets ; parcours « Gérard ».

### Phase 2 — La réunion améliore l'ouvrage

- Nouveau prompt des assistants, **réécrit et non rapiécé** : l'ouvrage en cours dans le bloc commun mis en cache, le rôle de chacun exprimé comme un regard sur l'ouvrage, les règles 3 à 6 du § 4, le langage simple. N'y recopie pas les correctifs datés de l'ancien prompt, qui reste en place pour le parcours technique.
- Lancement en un clic depuis « Mon projet » ; la réunion s'ouvre sur l'avis du porteur, en texte libre ; ses commentaires sont à l'ordre du jour.
- Conclusion : le constructeur produit la version suivante ; le porteur voit ce qui change et l'accepte, la corrige ou la refuse.
- Retouche directe par le bras droit, sans réunion.
- Salle de réunion allégée hors mode avancé : pas de réglages, pas de modèle, pas de compteur de questions.
- Rejeu des trois projets : une réunion chacun.

### Phase 3 — Le cap et la fin

- « Ce sera fini quand… » : état de chaque phrase réévalué à chaque version, affiché sur « Mon projet ».
- Prochaines étapes déduites de ce qui manque ; l'ancien plan long n'est plus généré.
- Livraison du dossier final.
- Rejeu complet des trois projets jusqu'à la fin, avec un humain simulé qui répond par ses idées et non par l'option recommandée.

### Phase 4 — Ce qui reste de l'ancienne interface

- Menu réduit du § 2.8 ; tout le reste derrière le mode avancé ; profil sans clé API ni GitHub hors mode avancé ; coûts dans l'administration seulement.
- Guide et visite guidée refaits et raccourcis autour de « Mon projet » ; projet exemple refait.
- Passe finale « Gérard » sur toute l'application, avec la liste de ce qui reste technique et pourquoi.

### Phase 5 — Étude « BlabIA + », sans code

Document en français courant à remettre au porteur, pour décider de l'extension technique. Son orientation : aucun compte ni abonnement à ouvrir pour l'utilisateur, si les coûts le permettent.

- **Trois paliers à chiffrer** : (1) maquette cliquable comme genre d'ouvrage ; (2) publication directe de la maquette validée comme site vitrine, sans agent ni dépôt ; (3) construction d'un vrai site par un agent hébergé par Anthropic (Claude Managed Agents), sur la clé de BlabIA, avec un plafond de dépense par session.
- **Mesure réelle** pour le palier 3, avec l'accord du porteur sur le budget : construire un site de référence dans une session plafonnée et relever le coût, la durée et la qualité. Sans cette mesure, aucun prix n'est avancé.
- **Ce qui reste à la charge de BlabIA** : où vit le code, qui héberge le site, à quel nom est le domaine, la facturation, le support (reprendre l'étude D « Tout compris »).

## 7. Ce que tu ne fais pas

- Aucune commande Prisma sans `DATABASE_URL` explicite vers une base de test ; aucune lecture de la prod sans l'accord du porteur ; aucune fusion ni déploiement de ta propre initiative.
- Aucune suppression de table, de colonne ou de fonctionnalité.
- Aucune évolution du parcours technique v5.1.
- Pas de nouvelle fonctionnalité hors de ce document : une bonne idée en cours de route se note dans le compte rendu de phase.
