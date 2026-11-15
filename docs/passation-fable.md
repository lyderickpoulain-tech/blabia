# Passation — BlabIA, état au 18 octobre 2026

Document d'entrée pour reprendre BlabIA (destiné en premier lieu à Claude Fable, à lire avant tout le reste). Il dit **ce que BlabIA doit être**, **ce qu'il est aujourd'hui**, **ce qui est acquis et pourquoi**, et **ce qui reste à faire**. Le détail de chaque évolution est dans `docs/feuille-de-route-v5.1.md` (entrées D1 à D43) ; les conventions techniques dans `CLAUDE.md`.

Ordre de lecture conseillé : ce document → `CLAUDE.md` → `docs/feuille-de-route-v5.1.md` § 4 « Réglages et choix déjà faits », puis D27 à D43 (les plus récents et les plus structurants).

> `CLAUDE.md` est en partie daté : il décrit BlabIA comme un outil à « usage personnel » et parle d'« agents ». La vision ci-dessous et le vocabulaire « assistants » priment.

---

## 1. La promesse

> « Vous décrivez votre projet. Une équipe d'assistants en discute avec vous, en réunions courtes. Vous décidez, BlabIA fait le reste. »

Le porteur de projet n'a besoin d'aucune compétence technique ni d'aucun autre outil. Il raconte son projet avec ses mots, réagit à ce qu'on lui montre, tranche ce qui lui appartient ; les assistants (des IA Claude) discutent, proposent, rédigent, et pour un site le construisent et le mettent en ligne. Le projet peut évoluer en cours de route (« et si je vendais mes vinyles ? », « je vais créer une appli »). Et BlabIA ne sert pas qu'aux projets techniques.

## 2. À qui il s'adresse (personas du porteur, 18/10/2026)

| Profil | Projet technique (site, appli) | Projet hors technique |
|---|---|---|
| Développeur, sait créer et héberger un site | Pas la cible | Cible : conseils et organisation |
| Aime l'informatique, a des bases, peine à faire émerger un vrai projet | Cible : a souvent ses outils et abonnements, a besoin d'orchestration | Cible : conseils et organisation |
| **Ne connaît rien à l'informatique, mais n'est pas contre** | **Cible principale** : aucun outil, peur des abonnements multiples, méfiance envers l'IA, vision claire, peur d'être mal retranscrit par un prestataire | Cible : conseils et organisation |
| N'aime pas l'informatique, contre l'IA | Pas la cible | Pas la cible |

Conséquences retenues :
- Le **hors technique concerne trois profils sur quatre** : il doit être aussi soigné que le site web.
- La peur du novice n'est pas technique : **confiance** (sa vision respectée, rien sans son accord, un seul abonnement, transparence sur l'IA).
- Le porteur de ces lignes (Lydérick) correspond au **2ᵉ profil** et teste lui-même avec le projet « WorldOfMetal ».
- Persona de test du novice : « Gérard », boulanger passionné de musiques du monde (D35).

## 3. Ce qu'est BlabIA aujourd'hui (parcours)

1. **Création** (`client/src/pages/NewProject.jsx`) : genre de projet, « Racontez votre projet », nom, niveau en clair (« Je n'y connais rien / J'en connais un peu / C'est mon métier »). Projet technique au niveau ≥ « un peu » : « Avez-vous déjà vos outils ? ». Site : plan type + pack d'outils BlabIA (ou ses propres outils). Hors technique : plan type (événement, commerce, association) ou mode express pour l'expert. Réglages par défaut selon le profil.
2. **Plan des réunions** (`Milestone`) : proposé par l'IA à partir du brief, la partie la plus difficile d'abord, sans volet inventé.
3. **Réunion** (`client/src/pages/MeetingRoom.jsx`, serveur `server/src/routes/sessions/chat.js`) : un orchestrateur (Haiku) choisit qui parle et anime ; les assistants (Sonnet/Opus) échangent en bulles courtes ; ce qui appartient à l'humain lui est soumis en **cartes de décision**, le reste se tranche par **hypothèse** contestable ; un **contradicteur** pointe un risque sur les choix à fort enjeu ; maquettes à comparer (« Celle-ci / Pas celle-là / Mélanger ») ; une **barre d'état** dit toujours ce qui suit (question, réponses prêtes, prête à conclure, en pause).
4. **Conclusion** (`client/src/components/MeetingCloseModal.jsx`) : compte rendu, décisions au registre, actions, réunions suivantes (placées au bon endroit du plan), livrables (relevé, synthèse, PV, liste de tâches, rétroplanning, budget, messages), prompt Claude Code pour une réunion de construction.
5. **« Votre vision »** : après la 1ʳᵉ réunion, BlabIA écrit ce qu'il a compris, avec les mots du porteur ; validée, c'est la référence de toutes les réunions.
6. **Bras droit** (`server/src/routes/assistant.js`, `client/src/components/assistant/`) : interlocuteur permanent (bouton en bas à droite) ; connaît tout le projet, y compris les réunions en cours ; tient une réunion à la place de l'humain dans un cadre (« peut trancher / réservé à vous »), lui garde les questions réservées et la termine après ses réponses ; propose de faire évoluer le projet, de réordonner le plan ; illustre les choix faits.
7. **« À trancher »** (`server/src/services/inbox.js`) : tout ce qui attend l'humain, de toutes les réunions.
8. **Site** : Claude Code réalise les prompts dans le dépôt GitHub du porteur (avec son abonnement Claude), aperçu commentable (« Donner votre avis »), mise en ligne d'un clic via Railway.

Autres briques : préparation d'une réunion par les assistants sans l'humain, missions confiées à un assistant dédié, actions entre les réunions et rappels, documents de référence, équipe (collaborateurs), « Apportez votre clé API » (l'IA facturée sur la clé Anthropic du porteur, relais par la clé BlabIA).

## 4. Principes acquis — ne pas les défaire sans raison

Chacun répond à un problème constaté en test réel (référence entre parenthèses).

- **L'humain décide, et seul l'humain conclut.** L'animation ne dit jamais « on clôt » ; la conclusion se fait au bouton (D38).
- **Une réponse de l'humain ne se change jamais sans lui** : un fait nouveau qui la contredit devient une carte (D42).
- **Une demande de choix explicite donne une carte**, quel que soit le mode de questions (D40). Les **règles du produit** (ce que voit le visiteur, ce qui est publié ou caché, les limites) restent à l'humain même en réunion technique (D43).
- **La technique se règle en coulisses** pour un non-technicien, sans l'annoncer ; on lui dit seulement ce que ça change pour lui, le coût en € par mois, ce qu'il aura à faire. Le **nom** de son adresse reste à lui (D37).
- **Pas de monologue** : un assistant ne parle pas plus de deux tours d'affilée, compté sur l'historique (`server/src/services/agentStreak.js`, D37).
- **Une incertitude se dit une fois** (« à confirmer ») ; recherche web plutôt que « je n'ai pas vérifié » (D37).
- **Humour dosé** : même au maximum, une touche sur deux tours environ, dans la phrase, jamais en chute systématique (D37).
- **Une réunion du plan ouverte ne se recrée pas** : on la rejoint, ou le bras droit la reprend (passation) (D43).
- **L'état d'une réunion se lit dans ses messages** (`server/src/services/meetingState.js` et son jumeau client `client/src/utils/meetingState.js`) ; la barre d'état en découle (D38).
- **Réagir plutôt que décrire** : maquettes ou planches de style à comparer, aperçu du site commentable (D35, D40).
- **La difficulté d'abord** dans le plan ; pas de volet inventé ; une question restée ouverte rejoint la prochaine réunion de décision au lieu d'en créer une (D40, D42).
- **Un vocabulaire pour l'utilisateur** : « assistants » (pas « agents »), vouvoiement, jamais « l'humain » devant lui, réunions désignées par leur titre (jamais R2), aucun émoji ; sur un bouton, l'acteur est toujours nommé (« le bras droit », « vous ») (D35, D40).
- **Transparence sur l'IA et les coûts** : coûts annoncés tôt, en €/mois ; « Ce que fait l'IA, et ce qu'elle ne fait pas » dans le guide ; « Tout compris » affiché « en construction » tant qu'il n'existe pas (D40, D41).
- **Pas d'abonnement Claude pour les assistants** : Anthropic réserve les jetons d'abonnement à Claude.ai et Claude Code ; BlabIA passe par une clé API (la sienne ou celle du porteur) (D36).
- **Coûts maîtrisés** : prompt en cache (bloc commun → historique → bloc du tour), orchestrateur sur Haiku sans réflexion, tout appel par `server/src/services/anthropic.js` qui journalise le coût (`UsageLog`).

## 5. Ce qui a été vérifié en réel

- **Test d'accessibilité « Gérard »** (17/10) : parcours complet joué dans un navigateur, audit WCAG 2.1 AA (axe) écran par écran ; défauts corrigés (D35).
- **Réunion « WorldOfMetal »** de prod analysée puis rejouée avec la vraie IA (D37) : jargon 0 (avant : des dizaines), série maximale 2 tours (avant 5), une seule carte pertinente.
- **Répétition du parcours du 2ᵉ profil** sur un miroir de WorldOfMetal (D42, 1,21 $) : réinitialisation → plan (carte en 1ʳᵉ) → réunion conclue en 60 s pour 0,10 $ → vision fidèle → délégation au bras droit avec reprise après réponse → « proposez-moi 3 polices » donne une carte immédiate.
- Ordres de grandeur mesurés en prod : une réunion coûte en moyenne 0,69 $ (médiane 0,57 $) ; une réunion rejouée après les réglages de coût : 0,10 à 0,25 $.
- Tests : 177 unitaires, 147 d'intégration (IA simulée, base de test locale).

## 6. Ce qui reste ouvert

Par ordre d'importance, selon le porteur et les tests :

1. **Cohérence d'ensemble.** BlabIA a grandi par 43 évolutions successives, chacune justifiée par un constat. Le résultat fonctionne, mais l'ensemble est riche : préparation, délégation, missions, actions, « À trancher », vision, outils, développements. Une simplification globale est probablement le meilleur levier, en gardant les principes du § 4. C'est l'objet de la reprise.
2. **Longueur des messages** : 40 à 55 mots par bulle en moyenne, pour une cible d'environ 20 au niveau « Je n'y connais rien ».
3. **L'interface n'a pas de tests automatisés** ; le parcours n'a jamais été joué d'un bout à l'autre par un vrai testeur extérieur (prévu par le porteur). `MeetingRoom.jsx` dépasse 1 200 lignes.
4. **Non répété en dev** faute d'application GitHub configurée : lecture du code du dépôt pendant les réunions, développements Claude Code, mise en ligne.
5. **« Tout compris »** (étude D) : un seul abonnement BlabIA couvrant construction, hébergement, adresse, voire paiements. Étude chiffrée faite (recommandation : pilote sur les sites vitrines, environ 24 €/mois), **décision du porteur en attente** ; aucun code.
6. Reliquats visuels : quelques composants anciens en gris (`SummaryDisplayModal.jsx`) hors des jetons de couleur ; `CLAUDE.md` à mettre à jour.
7. Projet de prod « WorldOfMetal » : deux réunions « Modèle de données » conclues en double (créées avant le correctif D43), à départager.

## 7. Règles de travail (impératives)

- **`server/.env` désigne la base de PRODUCTION.** Jamais de commande Prisma sans `DATABASE_URL` explicite vers une base de test ; tests : `npm run db:migrate:test` (refuse toute base dont le nom ne contient pas « test »). Ne jamais afficher `DATABASE_URL`. Lecture de la prod : en lecture seule (`SET default_transaction_read_only = on`), et seulement avec l'accord du porteur.
- **Migrations additives uniquement** (aucun `DROP`) ; `schema.prisma` mis à jour en même temps ; **sauvegarde de la prod (`pg_dump`) avant tout push contenant une migration** (procédure : feuille de route § 5) ; Railway applique les migrations au déploiement.
- **Git** : un bot GitHub pousse aussi sur `main` → `git fetch` et rebase avant de travailler et avant de pousser. Messages de commit en français.
- **Tests** : unitaires `cd server/src && npx vitest run` ; intégration `TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/blabia_test npx vitest run __integration__ --no-file-parallelism --testTimeout=60000 --hookTimeout=60000` (conteneur Docker `blabia-test-db`). Base de dev locale : conteneur `blabia-pg-dev` (port 5432). Le harnais d'intégration simule l'IA (`server/src/__integration__/harness.js`, `ai.responder`, `ai.keys`).
- **Chaque fonctionnalité visible met à jour** le guide (`client/src/components/Tutorial.jsx`), la visite guidée (`client/src/tour/chapters.js`), le projet exemple si utile (`server/src/services/demoProject.js`) et la feuille de route.
- Interface en français, icônes lucide-react uniquement, jamais d'émoji, couleurs par jetons Tailwind (`action`, `await`, `ok`, `ai`, `muted`, `ink`, `line`, `canvas`), accessibilité WCAG 2.1 AA.
- Le porteur s'exprime en français et attend des réponses en français.

## 8. Où trouver quoi

| Sujet | Fichiers |
|---|---|
| Prompts des assistants, de l'orchestrateur, des livrables | `server/src/services/prompts/agentPrompt.js`, `orchestratorPrompt.js`, `deliverablePrompts.js`, `posture.js` |
| Moteur de réunion (tours, cartes, maquettes, délégation, fin) | `server/src/routes/sessions/chat.js` |
| Marqueurs des assistants (`[DECISION]`, `[SUGGEST_MEETING]`, maquettes…) | `server/src/services/markers.js` |
| Conclusion, livrables, réunions proposées | `server/src/routes/sessions/deliverables.js`, `assist.js` (formats et livrables) |
| État d'une réunion | `server/src/services/meetingState.js`, `client/src/utils/meetingState.js`, `client/src/components/meeting/MeetingStatusBar.jsx` |
| Bras droit | `server/src/routes/assistant.js`, `server/src/services/projectKnowledge.js`, `server/src/services/delegation.js`, `client/src/components/assistant/` |
| « À trancher » | `server/src/services/inbox.js`, `client/src/components/assistant/InboxList.jsx` |
| Vision, brief, plan, réinitialisation | `server/src/routes/projects.js`, `server/src/routes/plan.js`, `server/src/services/planTemplates.js`, `server/src/services/websiteStarter.js` |
| Outils et pack recommandé | `server/src/routes/tools.js`, `server/src/services/tools/` |
| Développements Claude Code, avis sur l'aperçu | `server/src/routes/devTasks.js`, `server/src/services/devTasks.js`, `client/src/pages/project/ProjectDev.jsx` |
| Appels à l'IA, coûts, clé du porteur | `server/src/services/anthropic.js`, `usage.js`, `userKeys.js`, `models.js` |
| Création de projet, tableau de bord | `client/src/pages/NewProject.jsx`, `client/src/pages/project/ProjectDashboard.jsx` |

## 9. Hors du dépôt

- **Étude « Tout compris »** (étape D) : page privée https://claude.ai/artifact/QsocoVnNfXVti15CVTYBr8 (le porteur doit la partager ou la transmettre).
- **Rapports de test** (« Gérard ») et la conversation de travail détaillée : chez le porteur ; la feuille de route en reprend l'essentiel.
- `AUDIT.md` et `prompt-claude-code-blabia-v5.md` : présents à la racine du poste du porteur, jamais versionnés.
