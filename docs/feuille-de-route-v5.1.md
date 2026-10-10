# BlabIA — feuille de route v5.1

Document de reprise : à lire en début de session (avec `CLAUDE.md`, qui décrit l'architecture, le glossaire technique et les conventions). Mis à jour le 10/10/2026.

## 1. Où on en est

### En production (poussé sur `origin/main`, déployé sur Railway)
- **v5.0 complète** (phases 0 à 5 de `prompt-claude-code-blabia-v5.md`) : réunions uniquement, bulles + Markdown, curseurs maîtrise/humour, recherche web citée, types `decision | claude_code | stack`, livrable à la clôture, suggestions de réunions positionnées, refonte des outils (Mes outils, outils du projet par besoin, réunion Outils), illustrations à la demande.
- **Moins de questions à l'humain** : budget de cartes de décision par réunion, réglable (`questionMode` : Je délègue 4 / Équilibré 8 / Je veux tout trancher 15), questions regroupées (≤ 3 par message), hypothèses explicites que l'humain peut contredire, un autre agent reprend après une réponse, mémoire projet lue par la fin, tours comptés sur toute la réunion.
- **Correctif healthcheck** (`8a39f23`) : `/api/health` et `/api/ping` déclarés avant les routeurs.
- **Registre des décisions du projet** : table `Decision`, extraction à la clôture (validée par l'humain), transmis aux agents, page Projet › Décisions.
- **Préparation de réunion sans l'humain** (détail ci-dessous) et écran **Briefing**.
- **Refonte UX v5.1 terminée** (section 2) : tous les écrans dans la nouvelle charte.
- **Coût réel de l'IA** : table `UsageLog`, une ligne par appel Anthropic (point de passage unique `services/anthropic.js`, rattachement projet/réunion par `AsyncLocalStorage` dans `services/usage.js`, tarifs dans `services/pricing.js`). Affiché sur chaque carte projet, dans le tableau de bord et l'Historique (par usage, par réunion). La dépense du mois via l'Admin API a été abandonnée : indisponible pour un compte Anthropic individuel.
- **Guide de prise en main et visite guidée** : fenêtre Guide (`components/Tutorial.jsx`, ouverte à la première connexion via `User.tutorialSeenAt`, puis bouton « Guide ») ; visite sur les vraies pages (`client/src/tour/`, ancres `data-tour`) avec un projet exemple non informatique créé sans IA (`services/demoProject.js`, `Project.isDemo`, supprimé en fin de visite ; `demoGuard` refuse les routes IA) ; chapitres selon le rôle, progression dans `User.tourProgress`.
- 11 migrations appliquées en prod (`20261008000001` → `20261010000003`).

### Détail de la préparation
- **Préparation de réunion sans l'humain** (`/chat` avec `prepare: true`, `services/prompts/preparationPrompt.js`) : débat entre agents (2 tours/agent, 4 à 8), sans carte, puis synthèse `prep_summary` + décisions regroupées dans le budget.
- **Corrections UX de la préparation** (retour utilisateur : « la réunion s'est faite sans moi ») : bulles du débat marquées `prep: true` et repliées derrière un bloc « Débat de préparation des agents (N messages) » ; bandeau « 👉 Préparation terminée — N décisions vous attendent » ; « Clore la réunion » demande confirmation s'il reste des décisions sans réponse ; bouton renommé « 🧠 Préparer la réunion avant mon arrivée ».
- Ces corrections sont transitoires : la refonte UX (section 2) remplace l'affichage de la préparation par l'écran **Briefing**.

**Avant tout déploiement** : `pg_dump` de la prod (procédure section 5).

## 2. Refonte UX validée

Maquettes (canevas, privé) : https://claude.ai/artifact/U6WttxzAwX9v24XtQ6WKCs — 4 planches : glossaire, tableau de bord du projet, briefing (cliquable), réunion phase Échanges (cliquable, version compacte validée).

### Diagnostic qui a motivé la refonte
- « Réunions » désigne deux listes différentes sur la page projet (centre = réunions tenues, panneau de droite = réunions planifiées).
- Préparation et réunion se confondent (même salle, même fil, même bouton « Clore »).
- Les décisions vivent à quatre endroits (📌 en réunion, 📒 registre, « Mémoire du projet », compte-rendu).
- Trois types de suggestions (réunion, outil, agent) avec trois styles de cartes ; trois « plans » (fenêtre de réordonnancement, page `/plan` legacy, lien « Voir le plan »).
- Page projet = une dizaine de blocs empilés sans hiérarchie ; en-tête de réunion surchargé ; emojis comme seule iconographie ; ~19 teintes pastel sans sens stable ; fenêtres empilées sans URL.

### Modèle mental
1. **Projet** → tableau de bord : où j'en suis, prochaine étape.
2. **Parcours** → **Plan** (réunions à venir) et **Historique** (réunions passées) : deux noms, deux pages.
3. **Réunion** → toujours quatre temps affichés en haut :
   1. **Préparation** (facultative, sans l'humain, « coulisses »)
   2. **Briefing** (écran d'arrivée : synthèse + décisions qui reviennent à l'humain ; ses réponses lancent les échanges)
   3. **Échanges**
   4. **Conclusion** (compte-rendu, décisions à inscrire au registre, livrable, réunions suggérées)

### Glossaire de l'interface (un mot = une seule chose)

| Mot | Ce que c'est | Remplace aujourd'hui | Où |
|---|---|---|---|
| Tableau de bord | Accueil d'un projet : état, prochaine étape, points d'attention | Page projet (blocs empilés) | Projet |
| Plan | Réunions à venir, dans l'ordre, réordonnables | « Réunions » (panneau de droite), Timeline, Plan des réunions | Projet › Plan |
| Historique | Réunions tenues, avec compte-rendu et livrable | « Réunions » (liste centrale) | Projet › Historique |
| Réunion | Séance de travail avec les agents, en quatre temps | Session | Plan, Historique |
| Préparation | Temps facultatif : les agents débattent sans l'humain | « Les agents préparent sans moi » | Réunion › temps 1 |
| Briefing | Écran d'arrivée : synthèse et décisions | Carte de synthèse dans le fil | Réunion › temps 2 |
| Question | Ce qu'un agent demande de trancher (nombre limité) | Carte de décision, 📌 | Briefing, Échanges |
| Hypothèse | Choix d'un agent pour avancer, contestable | — | Échanges |
| Décisions | Registre de ce qui est tranché pour le projet | « 📒 Décisions », Mémoire du projet | Projet › Décisions |
| Compte-rendu | Résumé d'une réunion | inchangé | Historique |
| Livrable | Résultat typé (prompt Claude Code, liste d'outils) | inchangé | Historique |
| Suggestion | Proposition d'un agent (réunion, outil, agent) | 💡, cartes de styles différents | Réunion › panneau |
| Outils | Outils du projet, par besoin | 🧰 Outils, Stack | Projet › Outils |
| Mes outils | Outils de l'utilisateur, tous projets | Ma boîte à outils, Environnement | Compte › Mes outils |
| Équipe | Agents du projet | Agents du projet | Projet › Équipe |
| Paramètres | Brief, membres, niveaux par défaut, zone de danger | Blocs en bas de la page projet | Projet › Paramètres |

Mots qui disparaissent de l'interface : Timeline, Session, Stack, Étape (pour une réunion), Boîte à outils, Environnement, Mémoire du projet (affichée brute).

### Design system
- **Couleurs à sens unique** (tokens Tailwind `action`, `await`, `ok`, `ai`, `muted`, `ink`, `canvas`, `line` dans `client/tailwind.config.js`) : bleu `#3352E0` = action ; ambre `#9A4A06` / fond `#FFF1D6` = attend l'arbitrage de l'humain ; vert `#15803D` / `#DCFCE7` = validé ; violet `#6D35D9` / `#F0E9FF` = produit par l'IA (synthèse, préparation, illustration) ; gris `#565D78` / `#ECEFF6` = passé, secondaire. Fond de page bleuté `#F3F5FB`, texte ardoise `#1E2238` (retour utilisateur : le gris + noir était « triste »).
- **Choix sélectionné** : fond clair + texte coloré + coche, jamais de texte blanc sur fond coloré (retour : texte devenu illisible). **Toute question se valide explicitement** (bouton « Valider ») et propose « Laisser les agents décider » question par question.
- **Agents** : chacun sa couleur (avatar soutenu, nom coloré, bulle pastel).
- **Typographie** : Manrope seule (Google Fonts).
- **Icônes** au trait, une seule famille (proposition : `lucide-react`) ; emojis réservés aux avatars d'agents (sinon initiales).
- **Composants partagés** : carte, badge, bouton, fenêtre, panneau latéral. Zones cliquables ≥ 44 px pour les actions principales.
- **Navigation par pages** (URL, retour arrière) plutôt que par fenêtres : barre latérale de projet Tableau de bord · Plan · Historique · Décisions · Outils · Équipe · Paramètres.

### Écrans validés
- **Tableau de bord du projet** : prochaine étape mise en avant (« Préparer avant mon arrivée » / « Démarrer la réunion »), bloc ambre des points d'attention, cartes Plan / Décisions / Outils / Historique.
- **Briefing** : temps en haut, synthèse (violet) avec lien « Voir le débat des agents (N messages) », questions avec la recommandation des agents en premier, bouton « Lancer la réunion avec mes réponses » actif seulement quand tout est tranché, « Déléguer aux agents ».
- **Réunion, phase Échanges (version compacte validée)** :
  - en-tête sur une ligne (retour, titre + réunion/type/agents, quatre temps compacts, « Questions n/budget », réglages regroupés, bouton panneau, « Conclure ») ;
  - seul le fil défile, saisie fixée en bas sur une ligne ;
  - messages façon messagerie (avatar + nom au premier message d'une série, 14 px, marges réduites) ;
  - **hypothèse** : étiquette « Hypothèse » + « D'accord · Je contredis » ;
  - **question** compacte : intitulé, une ligne de contexte, choix en pastilles sur une rangée, recommandation en premier ;
  - panneau de droite repliable (280 px) : Suggestions (style unique), Tranché ici, Équipe.
- **Illustrations (validé sur description, pas de maquette)** : dans le fil, une ligne compacte (miniature, titre, type, « Ouvrir ») ; l'ouverture bascule la zone de droite en mode « Illustration » élargi (plein écran, code, téléchargement), le fil restant visible ; onglet « Illustrations » listant celles de la réunion.

## 3. Reste à faire (ordre recommandé)

### A. Refonte UX (terminée)
1. ✅ Socle : tokens de couleur Tailwind, Manrope, `lucide-react` 0.469.0, composants partagés (`client/src/components/ui/index.jsx` : Button, IconButton, Badge, Card, SectionLabel).
2. ✅ **Salle de réunion** (plein écran, hors `ProjectLayout`) : en-tête sur une ligne (`MeetingHeader`, réglages regroupés), quatre temps (`PhaseStepper`), écran Briefing (`BriefingView`), fil compact avec bulles pastel par agent, séparateur entre interlocuteurs et heure (`ConversationFeed`), hypothèses « D'accord · Je contredis », questions à valider explicitement avec « Laisser les agents décider » (`DecisionCard`), panneau latéral repliable en cartes (`MeetingSidePanel`), zone Illustration (`IllustrationPanel`), saisie compacte (`MeetingInputBar`). Reste à restyler : fenêtres de conclusion et de réinitialisation.
3. ✅ Tableau de bord du projet + navigation par pages : `components/project/ProjectShell.jsx` (barre latérale, contexte `useProject`, pastilles d'attention) et `pages/project/` (Dashboard, Plan → route `reunions`, Historique, Décisions, Outils, Équipe, Paramètres). `ProjectView.jsx` supprimé ; l'ancienne vue des tâches (`/plan`, `PlanView`) reste accessible depuis Paramètres. « Préparer avant mon arrivée » : case sur `StartMeeting` + lancement automatique dans `MeetingRoom` (`location.state.autoPrepare`).
4. ✅ Fin des écrans : `StartMeeting` (dans le cadre projet, route `meeting/new` imbriquée), `MeetingCloseModal`, en-tête commun (`Layout`), liste des projets en cartes, `NewProject`, `AgentsPage`, `MyTools`, registre des décisions, fenêtre de réinitialisation. Restent dans l'ancien style (peu utilisés) : connexion, profil, administration, `PlanView` legacy, `MeetingSuggestionCard`.
5. Renommages du glossaire partout (y compris commandes rapides qui parlent encore de « timeline »).

### B. Évolutions fonctionnelles (audit, « compagnon de projet en solo »)
1. ✅ **Actions entre les réunions** : stockées dans `TodoItem` (sans jalon, `source: session`), proposées à la conclusion par le même appel que l'extraction des décisions (`services/decisions.js` + `services/actions.js`), gardées par l'humain dans la fenêtre de conclusion, cochées dans Projet › Actions (pastille des retards, carte du tableau de bord, point d'attention), transmises aux agents dans le bloc commun : la réunion suivante s'ouvre sur un point d'avancement.
2. **Tableau de bord enrichi** : actions en retard, risques signalés par les agents, budget.
3. **Modèles de projets non informatiques** (événement, édition, rénovation, création d'activité) : agents, plan de réunions type, catégories d'outils adaptées.
4. ✅ **Contradicteur** (avocat du diable sélectif, `services/challenger.js`) : pas un agent mais une fonction décidée par l'orchestrateur (aucun appel en plus), seulement sur un choix à fort enjeu que personne n'a challengé ; 2 interventions max par réunion, jamais en préparation ni deux fois de suite ; bulle « Point de vigilance » avec « J'en tiens compte » / « Écarter » (`POST /:sessionId/vigilance`, un point écarté n'est plus soulevé) ; relecture des décisions fragiles à la conclusion (même appel que l'extraction). Activé par défaut (`Project.challengerEnabled`), désactivable par réunion (`Session.challengerEnabled`). Vérifié en réel : intervient sur un bail à 104 k€, se tait sur un nom de page Instagram.
5. ✅ **Documents de référence du projet** (table `ProjectDocument`, `services/documents.js`) : PDF (`pdf-parse` 1.1.1, sans IA), Word, Excel, CSV, texte ; texte extrait une fois au dépôt (200 000 caractères max, 10 documents max) ; documents actifs lus par les agents dans le bloc commun mis en cache (~40 000 caractères au total, partagés, début des longs documents) et par « Demander à BlabIA » ; page Projet › Documents (dépôt, aperçu du texte, « Lu en réunion », suppression). Vérifié en réel : les agents citent le devis et le règlement et les croisent. Les PDF scannés (images) ne sont pas lus.
6. ✅ **Export et rappels** : compte-rendu et registre (décisions + actions) en **PDF** (pages d'impression du client, `pages/print/`) et **Word** (`docx` 9.7.2, `services/exporters.js`, routes `/projects/:id/export/...`). **Rappel hebdomadaire par e-mail** des actions (`services/reminders.js`) : activé par projet (`Project.remindersEnabled`, désactivé par défaut), jour choisi dans le profil (`User.reminderDay`, lundi par défaut), à partir de 8 h (Paris), un par semaine (`User.remindersLastSentAt`) ; vérification horaire dans le serveur, et `POST /api/reminders/run` (en-tête `x-cron-secret` = `CRON_SECRET`) pour un cron externe si le service Railway est mis en veille. Envoyé au propriétaire et aux membres ; projet exemple exclu ; bouton « M'envoyer le rappel maintenant » dans le profil.

### E. Missions des agents ✅
Un agent propose en réunion ([MISSION:{…}], `services/markers.js`) un travail approfondi qui dépasse la réunion (recherche, analyse, rédaction) ; carte « Lancer (plafond) / Écarter » dans le fil ; l'humain la valide ; un sous-agent la mène en arrière-plan (`services/missionRunner.js`) avec la recherche web, la lecture de pages (`web_fetch_20250910`) et la lecture des documents du projet, sous un plafond de coût (rédaction forcée à 75 %) ; le rapport rejoint les documents du projet. Table `AgentMission`, budget mensuel par projet (`Project.missionsMonthlyBudgetUSD`, 5 $ par défaut, 0 = désactivé), 2 missions par réunion au plus, traitement toutes les 5 min + au démarrage + via le cron `/api/reminders/run`. Page Actions (section Missions), point d'attention au tableau de bord, projet exemple et visite guidée. Vérifié en réel : 0,15 $ / 51 s, 19 sources, document du projet lu.

### D. Développement depuis BlabIA — option A livrée (10/10/2026, à configurer)
✅ **Réalisé** : application GitHub BlabIA (« Connecter GitHub » dans le profil ou Projet › Développements ; `services/github.js`, jeton d'installation de 1 h, jeton OAuth de l'utilisateur jamais conservé, retour `GET /api/github/callback` reconnu par un état signé). Dépôt choisi par le **propriétaire** du projet (`Project.githubRepo`), deux automatisations installées par BlabIA (`services/githubWorkflows.js`, déclenchement `workflow_dispatch` UNIQUEMENT — dépôt public) : `blabia-dev.yml` (Claude Code, `claude_code_oauth_token`, Sonnet, 60 tours, 45 min, branche `blabia/dev-<n°>`, n'autorise que le bot de l'application) et `blabia-deploy.yml` (sauvegarde `pg_dump` chiffrée GPG AES-256 si `BLABIA_DB_URL` existe, `BLABIA_BACKUP_PASSWORD` obligatoire alors, conservée 90 jours en artefact, puis fusion **seulement si la sauvegarde a réussi**). Table `DevTask` (`services/devTasks.js`, état relu auprès de GitHub à la consultation, sans webhook), page Projet › Développements (configuration pas à pas, lancement, résumé de la pull request, fichiers, alerte « base de données modifiée », Mettre en ligne / Abandonner), case « Lancer le développement dès la conclusion » dans la fenêtre de conclusion d'une réunion Claude Code. Un développement à la fois ; projet exemple et comptes « user » exclus. Tests : `services/__tests__/github.test.js`, `__integration__/devTasks.test.js` (GitHub simulé).
✅ Configuré le 10/10/2026 (application `blabia-lyderick`, projet BlabIA relié à `lyderickpoulain-tech/blabia`, 3 secrets du dépôt). Premier essai réel : Claude Code a réalisé la demande en 1 min 30 mais n'a pas pu ouvrir la pull request (réglage du dépôt « Allow GitHub Actions to create and approve pull requests » désactivé par défaut) → BlabIA l'ouvre désormais lui-même (`openPrFromBranch`).
✅ **Retours du premier essai traités** (PR #2 fusionnée par « Mettre en ligne », sauvegarde chiffrée de 687 Ko conservée 90 jours) : tableau de bord (carte Développements + points d'attention prêt à relire / échec / mise en ligne échouée) ; page Développements sans doublon (« Relancer » seulement après échec ou abandon) ; bandeau « Générer le prompt et lancer le développement » ; agents informés du dépôt (bloc commun). **Prompt adapté au mode GitHub** (`buildClaudeCodePrompt({ githubRepo })`) : plus de « cd » vers le répertoire local ni de « validation étape par étape » (Claude Code travaille seul dans GitHub Actions et s'arrêterait en attendant une réponse).
✅ Aussi livré le 10/10/2026 : automatisations v2 (résumé de PR imposé, langage simple, « À faire de votre côté » pas à pas — validé par l'utilisateur : « parfait »), pastille Développements dans le menu, mode sombre réalisé par Claude Code depuis BlabIA (PR #4).

### D2. Mode équipe — CODÉ, EN ATTENTE (branche locale `mode-equipe`, non poussée : à valider avec un 2ᵉ compte GitHub)
Objectif : plusieurs membres d'un projet alimentent le même dépôt, chacun avec SON Claude Code.
- **Droits par projet et par membre, DÉCORRÉLÉS du rôle** Admin / Membre / User (un « user » invité peut les recevoir ; un admin ne les a pas d'office). Deux droits distincts, réglés par le propriétaire dans Projet › Équipe : **« Lancer des développements »** et **« Mettre en ligne »** (un membre peut proposer sans publier). Le propriétaire a toujours les deux ; aucun par défaut pour les membres. Stockage suggéré : colonnes booléennes additives sur `ProjectMember` (`canLaunchDev`, `canDeployDev`).
- **Abonnement : le sien, obligatoirement.** Chaque développeur a sa copie (fork) du dépôt sur GitHub, y range SON secret `CLAUDE_CODE_OAUTH_TOKEN` ; BlabIA ne voit jamais les jetons. Personne ne consomme l'abonnement d'un autre.
- **Conception prévue** :
  - le membre connecte GitHub (installation de l'application BlabIA sur SON compte, incluant son fork) ; BlabIA retrouve son fork (`GET /repos/{dépôt}/forks` ou dépôt `<login>/<nom>`), le synchronise avant chaque développement (`POST /repos/{fork}/merge-upstream`) ;
  - le workflow `blabia-dev.yml` (copié dans le fork) tourne dans le fork ; la demande (issue) reste sur le dépôt commun : ajouter une entrée `issue_repo` (les issues sont désactivées sur les forks), `gh issue view N --repo <commun>` ;
  - **simplification pour tous les modes** : Claude Code n'ouvre plus la PR ; il met le résumé (modèle v2) comme message d'un dernier commit (`git commit --allow-empty -F /tmp/pr-body.md`) ; BlabIA ouvre toujours la PR sur le dépôt commun (`head: <login>:blabia/dev-N`, installation du propriétaire) avec ce message comme corps → plus besoin du réglage « Allow GitHub Actions to create pull requests ». Automatisations v3 ;
  - mise en ligne inchangée (workflow du dépôt commun, installation du propriétaire : sauvegarde chiffrée puis fusion) ; autorisée selon le droit « Mettre en ligne » ;
  - page Développements : configuration pas à pas PAR membre (compte GitHub, abonnement Claude, créer le fork en un clic, activer les Actions du fork — désactivées par défaut sur un fork —, ranger son jeton, connecter GitHub), indication de qui a lancé chaque développement ; un développement en cours à la fois par projet (à confirmer si besoin).
  - Mettre à jour guide, visite guidée et tests (GitHub simulé : forks, merge-upstream, PR inter-dépôts).

Conception d'origine :
Objectif : se passer du copier-coller du prompt Claude Code — « Lancer le développement » depuis la conclusion d'une réunion Claude Code.
- **Option A (à faire en premier)** : Claude Code dans **GitHub Actions** sur le dépôt de l'utilisateur. BlabIA crée la demande (issue / commentaire), suit la pull request, montre un résumé simple et un lien de prévisualisation, puis « Mettre en ligne » (fusion → Railway redéploie). Rien ne part en ligne sans le clic de l'humain.
- **Abonnement Claude** : le jeton d'abonnement (`claude setup-token`) est rangé par l'utilisateur **dans les secrets de son propre dépôt** (`CLAUDE_CODE_OAUTH_TOKEN`). **BlabIA ne le stocke ni ne le voit jamais** (règles d'Anthropic : pas de collecte ni d'usage des identifiants Free/Pro/Max par une application tierce). BlabIA vérifie seulement que le secret existe (liste des noms de secrets via l'API GitHub).
- **Par profil** : connexion GitHub + dépôt par projet. Jeton présent → « Lancer le développement » (consomme l'abonnement de l'utilisateur) ; sinon « Copier le prompt » comme aujourd'hui. Variante : clé API personnelle saisie dans le profil (stockée chiffrée, facturée à l'utilisateur, plafond par tâche).
- **Garde-fous** : un développement à la fois, lancé par un clic, Sonnet par défaut, nombre de tours et durée plafonnés, tâches petites et préparées en réunion ; sauvegarde de la base avant toute migration (à automatiser ou garder en validation manuelle).
- **Option B (plus tard)** : Claude Managed Agents (crédits API + 0,08 $/heure d'exécution, plafond par session) pour un suivi en direct dans BlabIA.
- L'utilisateur principal a un abonnement **Pro** (Claude Code inclus, limites partagées avec VS Code, pas de crédits API mensuels).

### D3. Site web à créer de zéro — codé le 10/10/2026 (décisions de l'utilisateur)
Objectif : pour une demande « créer un site web » à partir de rien, BlabIA crée le dépôt en autonomie et fait choisir tous les outils nécessaires.
- **Dépôt créé en autonomie** (choix de l'utilisateur) : bouton « Créer le dépôt » (Développements › Configuration, ou case « Site web à créer de zéro » à la création du projet). Passage éclair par GitHub (OAuth : il faut le jeton de l'UTILISATEUR, jamais conservé ; connecte aussi le compte au besoin) → `POST /user/repos` (privé par défaut, `auto_init`, nom tiré du projet, suffixe `-2`… si pris) → ajout à l'installation si elle porte sur des dépôts choisis (`PUT /user/installations/{id}/repositories/{repo}`) → relié au projet → automatisations installées. Code : `routes/github.js` (`createProjectRepo`), `services/github.js` (`createRepo`, `repoSlug`), route `POST /api/projects/:id/github/create-repo`.
- **⚠️ À faire une fois sur GitHub** : application `blabia-lyderick` → Permissions → Repository permissions → **Administration : Read and write**, puis accepter la nouvelle permission sur l'installation (github.com/settings/installations). Sans elle : message « depot-permission ». Ce droit permettrait aussi de modifier ou supprimer les dépôts confiés à BlabIA (jamais utilisé) — accepté par l'utilisateur.
- **Jeton Claude** : à ranger dans chaque nouveau dépôt (pas de secret commun aux dépôts d'un compte personnel ; BlabIA ne doit jamais voir le jeton).
- **Plan type** (`services/websiteStarter.js`, `POST /api/projects/:id/plan/website`) : décision « Définir le site : objectif, public et pages » → décision « Choisir le style » → outils « Choisir les outils : hébergement, nom de domaine… » → Claude Code « Construire la première version du site ». Ordre voulu par l'utilisateur : des réunions de DÉCISION alimentent Claude Code.
- **Décisions du registre dans le prompt Claude Code** (tous les projets) : `buildClaudeCodePrompt` reçoit `registryText` (décisions actives du projet), en plus des décisions de la réunion.
- **Réunion « outils » avant tout développement** : encadré `ToolsMeetingHint` au démarrage d'une réunion Claude Code et sur Développements tant qu'aucune réunion « outils » n'a été conclue (`toolsMeeting` dans `GET /api/projects/:id/tools`) ; démarre celle du plan s'il y en a une. Pendant la réunion : analyse des besoins lancée au 1ᵉʳ tour si jamais faite (`analyzeAndSaveNeeds`), les agents demandent à l'humain, catégorie par catégorie, l'outil qu'il utilise ou préfère (carte [DECISION]) avant de proposer.
- **Guide de mise en place sur demande** (page Outils) : `POST /api/projects/:id/tools/guide`, Sonnet + recherche web, pas à pas pour relier les outils RETENUS (dépôt, hébergeur, domaine, e-mails…), conservé dans `Project.toolsGuide` (migration `20261010000011`).
- Hébergement : rien d'automatique côté hébergeur (choix de l'utilisateur : réunion « outils » + guide).
- Tests : `services/__tests__/website.test.js`, `__integration__/devTasks.test.js` (création au retour de GitHub, nom pris, permission absente, plan type, réunion outils). À vérifier en réel : la création avec la permission Administration acceptée, et l'ajout automatique à une installation « Only select repositories ».

### C. Code
1. ✅ Modèle centralisé dans `server/src/services/models.js` (`DEFAULT_MODEL`, `MEETING_MODELS`, servis au client par `GET /api/models`). Orchestrateur sur un modèle léger (`ORCHESTRATOR_MODEL` = Haiku 5.5, réflexion désactivée : ~0,0001 $ par tour au lieu de ~0,003 $). Les commandes rapides et l'analyse des besoins restent sur Sonnet (contenu lu par l'humain).
2. ✅ Mise en cache des prompts : le prompt d'agent est rendu en deux blocs (`services/prompts/agentPrompt.js`) — bloc commun à la réunion marqué `cache_control` (projet, brief, plan, registre, mémoire, règles ; ~1 800 tokens), puis bloc du tour (rôle, raison, budget, questions déjà posées…). Mesuré : le 2ᵉ agent relit le bloc commun (appel 0,0020 $ au lieu de 0,0082 $). Ne rien mettre de variable dans le bloc commun (tests `agentPrompt.test.js`).
3. ~~Éviter l'appel d'orchestration quand le choix est évident~~ — abandonné : avec Haiku l'appel coûte ~0,0001 $, et le sauter ferait perdre la suggestion de clôture (`shouldClose`). La mention @ et la réunion à un seul agent court-circuitent déjà l'appel.
4. ✅ Chargement des pages à la demande (`React.lazy`, fichier principal 767 → 241 Ko). `MeetingRoom.jsx` découpé (1 302 → 1 008 lignes) : `components/meeting/meetingConstants.js`, `hooks/useAttachments.js`, `hooks/useMeetingAgents.js`, `hooks/useClickOutside.js`, `components/meeting/ResetMeetingModal.jsx`. L'envoi et le flux SSE (~200 lignes) restent dans la page : trop liés à son état pour être déplacés sans tests d'interface. (`ProjectView.jsx` a été supprimé par la refonte.)
5. ✅ Notifications d'erreur (`utils/notify.js` + `components/Toaster.jsx`, `notifyError(err, message)`) : plus aucun `catch {}` silencieux sans commentaire expliquant pourquoi ; côté serveur, les échecs secondaires sont journalisés.
6. ✅ Tests d'intégration (`server/src/__integration__/`, `npm run test:integration` avec `TEST_DATABASE_URL` → base locale `blabia_test`, refus de toute autre base) : contrôle d'accès de TOUTES les routes (liste lue dans `index.js`, vérifié par une faille injectée), réunion complète avec IA simulée, profil. Ont révélé le bug d'inscription des décisions (corrigé et déployé).
7. Colonnes `DEPRECATED` — **préparé, rien supprimé** (accord explicite de l'utilisateur requis : suppression irréversible, contraire à la règle des migrations additives).
   - ✅ `PlanView` retirée (`/projects/:id/plan` → page Actions) ; `TodoItem` conservé : il porte les actions entre les réunions.
   - ✅ `Session.agents` / `Session.exchanges` : plus écrits ni renvoyés (valeur par défaut `'[]'`, migration `20261010000007`).
   - ⏳ État de la prod au 10/10/2026 (contrôle en lecture seule) : outils non convertis pour 2 comptes sur 3 et 9 projets sur 10 (`tools` NULL : la conversion depuis `techStack`/`toolbox` se fait à la première lecture), 27 réunions sur 42 avec d'anciennes suggestions (`pendingStepSuggestions`), 3 jalons avec `checklistData`. **Une suppression ferait perdre ces données.**
   - Marche à suivre le jour venu : script de conversion en une fois de toutes les lignes restantes (outils, suggestions), sauvegarde, vérification à zéro, puis migration de suppression.

## 4. Réglages et choix déjà faits (ne pas les rediscuter sans raison)
- Budget de questions : 4 / 8 / 15 selon `questionMode` (`server/src/services/questionModes.js`) ; jusqu'à 3 cartes par message (`MAX_DECISIONS_PER_MESSAGE`, `markers.js`) ; jusqu'à 5 décisions après une préparation.
- Mémoire transmise aux agents : 3 000 caractères, réunions les plus récentes (`utils/projectMemory.js`).
- Seuils de suggestion de clôture (tours d'agents sur toute la réunion) : décision 6, Claude Code 8, outils 10.
- Préparation : 2 tours par agent, entre 4 et 8, au moins 2 agents, seulement au début d'une réunion.
- Catalogue d'outils servi par l'API (`GET /api/tools/catalog`), pas de fichier partagé client/serveur (évite de toucher au Dockerfile).
- Conversion des anciennes données d'outils en JS à la première lecture (`NULL` = pas encore migré).
- Réinitialisation de la mémoire : supprime réunions tenues et registre ; réunions planifiées supprimées seulement si la case est cochée.
- Illustrations : iframe sandboxée (`allow-scripts` sans `allow-same-origin` pour le HTML, aucun script pour SVG/Mermaid), `mermaid` chargé à la demande.
- Hors périmètre v5 : `PlanView.jsx` (`TodoItem` sert désormais aux actions entre les réunions).
- **Toute nouvelle fonctionnalité met à jour le guide et la visite guidée** (demande de l'utilisateur) : `client/src/components/Tutorial.jsx`, `client/src/tour/chapters.js` (+ ancres `data-tour`), projet exemple `server/src/services/demoProject.js` si des données sont nécessaires.

## 5. Environnement de test et déploiement

### ⚠️ Prisma et la base de prod
`server/.env` contient l'adresse de la **base de prod**. Toute commande Prisma lancée sans `DATABASE_URL` explicite s'y applique (incident du 10/10/2026 : migration des missions appliquée en prod sans sauvegarde préalable — additive, sans perte, nouvelle sauvegarde `blabia-prod-2026-10-10-09-40.dump` aussitôt faite).
- Base de test : `npm run db:migrate:test` avec `TEST_DATABASE_URL` (refuse toute autre base) ; tests : `npm run test:integration`.
- Base de dev : `$env:DATABASE_URL = 'postgresql://postgres:devpassword@localhost:5432/blabia_dev'; npx prisma migrate deploy` dans la même commande.
- Prod : uniquement par le déploiement Railway, après pg_dump.

### Lancer l'environnement de test (PowerShell)
```powershell
# Base de données (Docker Desktop doit tourner)
docker start blabia-pg-dev

# Serveur — la variable fait pointer sur la base locale, JAMAIS modifier server/.env (prod)
cd C:\BlabIA\server
$env:DATABASE_URL="postgresql://postgres:devpassword@localhost:5432/blabia_dev"
npx prisma migrate deploy
npm run dev

# Client
cd C:\BlabIA\client
npm run dev
```
http://localhost:5173 — compte `test@blabia.local` / `test1234` (admin).

Si la connexion bloque : vérifier que le moteur Docker répond (`docker ps`). En cas de blocage, arrêter complètement Docker Desktop (`Get-Process "Docker Desktop","com.docker.backend" | Stop-Process -Force`), `wsl --shutdown`, relancer Docker Desktop.

### Vérifications avant commit
```powershell
cd C:\BlabIA\server; npx vitest run; npx prisma validate
cd C:\BlabIA\client; npm run build
```

### Déploiement
1. Sauvegarde de la prod (lecture seule, PostgreSQL 18 en prod → conteneur jetable `postgres:18`), fichier hors du dépôt dans `C:\BlabIA-backups\`. Dernière sauvegarde : `blabia-prod-2026-10-10-08-15.dump`.
2. `git push origin main` → Railway redéploie ; les migrations s'appliquent au démarrage (`prisma migrate deploy`).
3. Vérifier dans les logs Railway : migrations appliquées, serveur démarré, healthcheck `/api/health` en 200.

Variables Railway du service applicatif (en plus de `DATABASE_URL`, `ANTHROPIC_API_KEY`, `JWT_SECRET`, `RESEND_API_KEY`, `FRONTEND_URL`) :
- `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY` : application GitHub BlabIA (développements). Réglages de l'application : URL de rappel `https://blabia-production.up.railway.app/api/github/callback`, « Request user authorization (OAuth) during installation » coché, webhook désactivé ; permissions du dépôt : Actions (lecture/écriture), Contents (lecture/écriture), Issues (lecture/écriture), Pull requests (lecture/écriture), Secrets (lecture), Workflows (lecture/écriture), Metadata (lecture).
- Secrets du dépôt `blabia` (GitHub, jamais dans BlabIA) : `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token`), `BLABIA_DB_URL` (adresse publique de la base de prod), `BLABIA_BACKUP_PASSWORD` (mot de passe de chiffrement des sauvegardes, conservé aussi hors de GitHub).
- `CRON_SECRET` : déclenchement externe des rappels hebdomadaires. **cron-job.org** (tâche « RappelsBlabIA ») appelle chaque heure `POST https://blabia-production.up.railway.app/api/reminders/run` avec l'en-tête `x-cron-secret`. Réponses : 200 = OK, 403 = secret différent, 503 = variable absente du service. Utile si le service est mis en veille (pas de changement de plan Railway souhaité).

Restauration en cas de problème (sauvegarde faite par GitHub à la mise en ligne : télécharger l'artefact « sauvegarde-base-pr-… » de l'exécution, le dézipper, puis `gpg --decrypt base.dump.gpg > base.dump` avec `BLABIA_BACKUP_PASSWORD`) :
```powershell
docker run --rm -v "C:/BlabIA-backups:/backups:ro" postgres:18 pg_restore --clean --if-exists --no-owner --no-privileges -d "<adresse de la base>" /backups/<fichier>.dump
```
