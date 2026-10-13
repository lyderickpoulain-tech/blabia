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

### ★ Prochaines évolutions (consignées le 11/10/2026 — à reprendre en début de session)

**À vérifier en conditions réelles (codé, testé avec IA/GitHub simulés, pas encore vu en vrai)**
1. Création d'un dépôt par BlabIA (D3) — exige la permission GitHub « Administration : lecture et écriture » acceptée sur l'installation (Deployments : fait).
2. Site de numérologie sur Railway : Root Directory `/client`, domaine généré, puis adresse du site dans Développements et « Mis en place » sur Railway (page Outils) ; aperçus de PR (« PR Environments ») et états de publication (D4).
3. Mémoire à deux étages (D10) : « Construire depuis l'historique » sur un vrai projet, relire la synthèse (rien d'oublié ?).
4. Mission « Légère » depuis une action (D9) ; « Mettre à l'ordre du jour » sur la décision « public cible » du site de numérologie (D8).
5. Après la migration Claude 5 (D11) : coût par réunion (attendu ≈ −40 % sur Sonnet 5.5), longueur des messages des agents (effort réglable dans `services/models.js`), qualité des comptes rendus.
6. Historique complet des agents (D12) : ne reposent plus les questions réglées en début de réunion ; coût du 1ᵉʳ tour après une pause > 5 min.
7. Discussion sous le guide de mise en place (D5) et agents qui voient le code en réunion Claude Code (D6) : premiers usages réels.

**Petites évolutions (prêtes à faire)**
8. Missions : case « Sans recherche web » au lancement (travail sur les seuls documents du projet).
9. Glossaire : les commandes rapides parlent encore de « timeline » (A.5).
10. Refus de sécurité : si toute la chaîne de bascule refuse (`stop_reason: "refusal"`), afficher un message clair dans la bulle de l'agent au lieu d'un texte vide (aujourd'hui : seulement un avertissement dans les journaux).
11. Projet exemple : illustrer les nouveautés (décision à l'ordre du jour d'une réunion, action confiée à un agent, synthèse de mémoire) pour la visite guidée.

**Chantiers**
12. Tableau de bord enrichi (B.2) : actions en retard, risques signalés par les agents, budget.
13. Modèles de projets non informatiques (B.3) : événement, édition, rénovation, création d'activité.
14. Mode équipe (D2) : branche locale `mode-equipe` (non poussée), à réaligner sur `main` (devTasks.js a beaucoup changé depuis : publication, cache) puis à valider avec un 2ᵉ compte GitHub.
15. Réunions très longues (> 60 messages) : résumer le début de la réunion au lieu de l'écarter de l'historique des agents (D12).
16. Cache des réunions : mesurer les réécritures après les pauses ; envisager le TTL d'une heure si elles pèsent (D12).
17. Colonnes `DEPRECATED` (C.7) : suppression préparée, à faire seulement avec l'accord explicite de l'utilisateur.

**Rappels de méthode**
- Avant chaque poussée avec migration : sauvegarde de la prod (§ Déploiement) — dernière : `blabia-prod-2026-10-11-14-22.dump`.
- Étude de modèles : le banc d'essai (rejeu de vraies tâches, jugement à l'aveugle) était un script hors dépôt ; le recréer si besoin, en vérifiant les reproches du juge (un des siens s'est révélé faux).

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

### D4. Publication réelle et aperçu — codé le 10/10/2026
Constat (projet « Site de numérologie ») : « Mettre en ligne » affichait « En ligne » alors qu'aucun hébergeur n'était relié au dépôt — le code était seulement fusionné.
- BlabIA lit les **déploiements GitHub** que l'hébergeur relié (Railway, Vercel, Netlify…) déclare : `publicationOf` / `refreshPublication` dans `services/devTasks.js`. Après fusion : `publishState` = `pending` → `live` (+ `siteUrl`, l'adresse du site plutôt que celle d'un service « server/api ») ou `failed` ; `no_host` si aucun déploiement n'a jamais existé sur le dépôt (encadré « Code fusionné, mais rien n'est publié » + lien vers le guide) ; `no_access` si la permission manque (revérifié) ; suivi 7 jours.
- **Aperçu** : déploiement sur le commit de tête de la PR → `previewUrl`, bouton « Voir l'aperçu » à côté de « Mettre en ligne » (suivi automatique 30 min après « prêt »). « Voir le site en ligne » dans l'en-tête de Développements.
- Le guide de mise en place explique de relier l'hébergeur par son intégration GitHub et d'activer les aperçus (PR Environments Railway, Preview Deployments Vercel, Deploy Previews Netlify).
- **⚠️ Permission à ajouter à l'application GitHub** : Repository permissions → **Deployments : Read-only**, puis accepter sur l'installation.
- Migration `20261010000012_v5_dev_publication` ; tests d'intégration (aperçu, non publié, site + serveur, échec, permission absente).

### D5. Fiabiliser la mise en place — codé le 10/10/2026
Constat (« Site de numérologie » sur Railway) : le guide ignorait la structure du dépôt (README à la racine, appli dans `client/` et `server/`) → « nothing for the builder to detect ». Correction donnée : Root Directory `/client`, sans Start Command (Railpack détecte Vite et sert `dist` avec Caddy), variables `VITE_*` seulement ; le serveur (qui ne fait que /api/health) peut attendre.
- **Structure réelle du dépôt** (`services/repoOverview.js`) lue sur GitHub : parties (racine + dossiers), scripts, framework, fichiers de configuration, NOMS des variables des `.env.example` (jamais les valeurs) ; « un service par partie, Root Directory /client ou /server » quand rien n'est déployable à la racine. Injectée dans le guide et la discussion.
- **Discussion sous le guide** (page Outils, `POST/DELETE /api/projects/:id/tools/guide/chat`, `Project.toolsGuideChat`, migration `20261010000013`) : question ou message d'erreur collé → réponse pas à pas (Sonnet + recherche web) ; si le code doit changer, texte d'une demande à faire en réunion Claude Code ; « Correction du guide : … ». « Régénérer » reprend ces échanges.
- **Recherche web du guide fiabilisée** (issue #9) : outil web défini une seule fois (`services/webSearchTool.js`, réunions, missions, `/rechercher`, guide, discussion, `check-web-search.js`) ; `runWithWebSearch` (`setupGuide.js`) = budget cumulé (guide 8, discussion 3 — `GUIDE_MAX_SEARCHES` / `CHAT_MAX_SEARCHES`), 3 relances sur `pause_turn`, statut `verified | truncated | unauthorized | error | not_searched`, sources affichées ; `Project.toolsGuideCheck` + `toolsGuideDraft` (migration `20261012000003`, `NULL` = « à vérifier ») ; un guide non vérifié ne remplace pas un guide vérifié sans confirmation (409, brouillon 24 h, `force: true` sans nouvel appel, `DELETE …/tools/guide/draft`). Audit : `docs/audit-tools-guide-web-search.md`.
- Guide : section « En cas d'erreur », un service par partie avec ses variables, ordre (serveur puis site), clés secrètes jamais dans le site, variables `VITE_` avant la construction.
- **À la source** : le prompt Claude Code exige un code déployable tel quel chez l'hébergeur retenu et une section « Déploiement » du README (dossier racine de chaque partie, variables, ordre).

### D6. Les agents voient le code (réunions Claude Code) — codé le 11/10/2026
Constat : réunion « Le menu Plan d'un projet ne respecte pas la charte graphique » sur le projet BlabIA → 1ʳᵉ question « Qu'est-ce exactement que le menu Plan ? » : les agents n'avaient que le brief (une phrase), la mémoire et le NOM du dépôt, jamais le code.
- `services/codeContext.js` : au 1ᵉʳ tour d'une réunion Claude Code (préparation comprise) d'un projet relié à un dépôt → arborescence des fichiers source (git tree, sans node_modules/lock/images), CLAUDE.md et README (extraits), puis jusqu'à 6 fichiers pertinents pour l'objectif choisis par Haiku (repli : mots de l'objectif dans les chemins), ~32 000 caractères au plus. Conservé dans `Session.codeContext` (migration `20261011000001`), placé dans le bloc commun mis en cache du prompt des agents, avec la consigne : ne jamais demander à l'humain ce que le code montre.
- Une réunion déjà préparée sans ce contexte garde ses questions : en relancer une.
- Corrigé aussi le 11/10 : l'encadré « choisissez les outils » ignorait les outils renseignés sur la page Outils (BlabIA : 10 outils validés, aucune réunion « outils ») → outils choisis = réunion conclue OU catégories pour construire et publier couvertes ; sinon il nomme les catégories manquantes.

### D7. Actions triées, outils « mis en place », développement conditionné — codé le 11/10/2026
Constat (« Site de numérologie ») : 19 actions dont 4 doublons, 3 décisions à prendre (« Définir… », « Trancher… »), 3 mises en place d'outils (comptes Railway, Umami, Stripe : rôle de la page Outils) et 2 tâches de code (palette CSS, police Inter) ; 5 vraies actions seulement.
- **Tri à la conclusion** (`buildExtractionPrompt`, `parseTriage`) : `actions` (vraies actions de l'humain, 5 au plus, `MAX_ACTION_PROPOSALS`), `toDecide` → une réunion de DÉCISION proposée au plan (choix de l'utilisateur), `codeTasks` → une réunion Claude Code proposée (sauf en réunion Claude Code), `toolSetups` → « Outils à mettre en place » (lien Outils), jamais en actions. Doublons écartés côté serveur (`dropExistingActions`, mots communs ≥ 75 % avec une action ouverte). Fenêtre de conclusion : sections « Réunions à ajouter au plan » et « Outils à mettre en place ».
- **Outil « mis en place »** : `setupDone` sur les outils du projet, case sur la page Outils pour les catégories `SETUP_CATEGORIES` (base, auth, e-mails, IA, paiement, stockage, hébergement, domaine, surveillance, no-code, audience).
- **Développement conditionné** (`services/devTools.js`) : types d'outils utilisés par le prompt repérés par Haiku, une fois (`Session.requiredTools`, migration `20261011000002`, remis à zéro si le prompt est modifié). Manquant = aucun outil choisi, ou choisi mais pas mis en place → `POST dev-tasks` 409 `missingTools`, sauf `force: true` (« Lancer quand même » après confirmation — choix de l'utilisateur). Pas de lancement automatique à la conclusion dans ce cas ; liste « à lancer » annotée.
- ✅ Fait le 11/10/2026 (accord de l'utilisateur) : 12 actions du « Site de numérologie » annulées (doublons, décisions, outils, code), 2 réunions ajoutées au plan ; sauvegarde de la liste hors du dépôt.

### D8. Décisions remises en question : ordre du jour — codé le 11/10/2026 (choix de l'utilisateur)
Constat : une décision remise en question ne revenait que si une réunion « concernée » se tenait, et restait « remise en question » après avoir été retraitée.
- Pas de nouveau type de réunion : une réunion de DÉCISION porte un ordre du jour (`Milestone.agenda`, ids ; `services/agenda.js`, migration `20261011000004`). Registre : « Mettre à l'ordre du jour » → nouvelle réunion dédiée (par défaut, « Retraiter : … ») ou réunion de décision encore à tenir (sujets liés), 4 points au plus.
- Démarrage : `suggest-agents` reçoit l'ordre du jour (motifs compris) et doit couvrir chaque point par au moins un agent compétent (2 à 5). Réunion : section « ORDRE DU JOUR » dans le bloc commun des agents, un point à la fois, chacun tranché par l'humain.
- Conclusion : l'extraction marque `replaces` (id d'un point de l'ordre du jour) ; fenêtre de conclusion « Remplace la décision remise en question : … » cochée par défaut ; l'ancienne passe « remplacée » (`Decision.supersededBy`).

### D9. Actions confiées à un agent, ou traitées en réunion — codé le 11/10/2026
- Page Actions, sur chaque action ouverte : « Confier à un agent » (agent du projet, nature devinée du verbe — vérifier → recherche, rédiger → rédaction, analyser → analyse —, plafond, objectif et attendu modifiables) → mission lancée aussitôt (`POST /api/projects/:id/actions/:tid/mission`, `AgentMission.todoId`, migration `20261011000005`), action « en cours », budget mensuel des missions respecté ; l'état de la mission et « Lire » (rapport) s'affichent sur l'action ; l'humain la coche une fois satisfait.
- « Traiter en réunion » : nouvelle réunion de décision préremplie avec l'action.
- Mission réussie (depuis une action ou une réunion) → entrée dans la MÉMOIRE du projet (`[MISSION:<id> | date — …]`, `appendMemory` + `missionDigest` dans `utils/projectMemory.js`) : synthèse et recommandation du rapport (1 500 car. max), renvoi au document ; même rotation que les comptes rendus.

### D10. Mémoire à deux étages, niveaux de mission — codé le 11/10/2026
Constat : la mémoire (`Project.context`) supprimait les entrées au-delà de 10 000 caractères, et les agents n'en voyaient que les ~3 000 derniers.
- **Synthèse consolidée** (`services/memory.js`, `Project.memorySummary` / `memorySummaryAt` / `memoryEditedAt`, migration `20261011000006`) : titres fixes (Contexte et objectifs, Ce qui est établi, Pistes écartées, Points ouverts, Travaux réalisés), chaque point avec sa source. `appendMemory` n'efface plus rien : au-delà de 6 000 caractères d'entrées récentes, les plus anciennes sont FONDUES dans la synthèse en arrière-plan (consigne : aucune perte ; « remplacé : ancien → nouveau ») ; échec de l'IA → rien n'est retiré. Les 4 points d'écriture passent par `appendMemory`.
- Agents, missions, analyse des outils, commandes rapides : `memoryForPrompt` = synthèse entière + entrées récentes.
- Paramètres › Mémoire du projet : synthèse lisible, « Corriger » (les corrections font foi aux consolidations suivantes), « Construire / Reprendre tout l'historique » (réunions conclues + missions, récupère ce que l'ancienne rotation avait perdu). Première synthèse aussi lancée en arrière-plan au premier tour de réunion d'un projet existant. Réunion supprimée déjà fondue → retirée de la synthèse (`forgetInSummary`).
- **Missions : niveaux au lieu d'un montant** (`LEVELS` dans `services/missions.js`, `AgentMission.level`) : Légère (0,25 $ max, 5 étapes, 3 recherches, Sonnet), Standard (0,60 $, 10, 5, Sonnet), Approfondie (2 $, 16, 10, Opus). Le plafond découle du niveau, le budget mensuel reste contrôlé.

### D11. Migration vers Claude 5 — faite le 11/10/2026 (validée par l'utilisateur après étude)
Étude (banc d'essai sur 7 vraies tâches, jugement à l'aveugle + vérifications) : Sonnet 5.5 au moins aussi pertinent que Sonnet 4.6 / Opus 4.8, 25 à 50 % moins cher, 2 à 4 fois plus rapide ; le tokeniseur Claude 5 compte ~30 % de jetons de plus que Sonnet 4.6 (Opus 4.8 l'avait déjà).
- `services/models.js` : défaut `claude-sonnet-5-5` ; réunions Sonnet 5.5 (recommandé) ou Opus 5.5 ; mission Approfondie sur Opus 5.5 ; orchestrateur Haiku 5.5 inchangé. Anciens identifiants stockés (réunions antérieures) → successeurs (`currentModel`).
- `services/anthropic.js` (point de passage unique) : pour Sonnet/Opus 5.5, effort `low` par défaut, +2 000 jetons de marge (la réflexion, toujours active sur Opus 5.5, tronquait les tours d'agent à 600 — réponse vide observée), réflexion « disabled » retirée (400), bascule serveur `fallbacks: "default"` (en-tête `server-side-fallback-2026-07-01`) en cas de refus ; `textOf` remplace les 7 lectures de `content[0].text`.
- Prompt Claude Code : 12 000 jetons (avant : tronqué à 4 000, ~7 000 nécessaires), effort `medium`. Missions : `web_fetch_20260209`. /rechercher : `web_search_20260318`. Tarifs Claude 5 dans `pricing.js`.
- Vérifié en réel : tour d'agent (ancienne réunion Opus 4.8 → Opus 5.5, et Sonnet 5.5), extraction avec cache, prompt Claude Code complet.

### D12. Les agents voient toute la réunion — fait le 11/10/2026
Avant : les agents ne recevaient que les 10 derniers messages (fenêtre glissante, aussi incompatible avec le cache). Désormais `services/prompts/meetingHistory.js` : toute la réunion (au-delà de 60 messages, les derniers, début avancé par paliers de 20), un bloc par message dans les consignes système, entre le bloc commun et le bloc propre à l'agent, point de cache sur le dernier message. Vérifié en réel (« Business model », 21 messages) : le tour suivant d'un autre agent relit 13 449 jetons depuis le cache et n'écrit que le nouveau message (0,008 $ au lieu de 0,046 $). Le premier tour après une pause de plus de 5 minutes réécrit le cache (coût d'écriture ×1,25).

### D13. Réunion ouverte depuis une action — fait le 12/10/2026
« Traiter en réunion » lie la réunion à l'action (`Session.todoId`, migration `20261012000001`). Les agents reçoivent dans le bloc commun l'action et le rapport COMPLET de la dernière mission terminée qui l'a préparée (`services/actions.js` → `actionForPrompt`, plafond 15 000 caractères), avec la consigne de partir de ce travail. À la conclusion (statut `accepted`) l'action est cochée « faite » ; une réunion abandonnée la laisse ouverte. Bandeau dans la préparation de la réunion et rappel dans la fenêtre de clôture.

### D14. Le code lu quand il le faut, dans toutes les réunions et les missions — fait le 12/10/2026
Projet relié à un dépôt (installation GitHub du propriétaire) : `services/codeContext.js`.
- Réunion Claude Code : code lu dès le début, comme avant.
- Autres réunions : au premier tour, le modèle léger juge si le sujet touche au code ; si oui il choisit les fichiers, sinon rien n'est lu (`Session.codeContext = ''`).
- En cours de réunion : l'orchestrateur (consulté aussi pour un agent seul quand le code est lisible) remplit `codeQuestion` quand le dernier message — de l'humain ou d'un agent — demande du code pas encore lu ; `lookupCode` ajoute alors une « LECTURE COMPLÉMENTAIRE » (4 au plus par réunion, fichiers déjà lus exclus) avant le tour. Bulle « BlabIA lit le code du site… ». Les agents ont la consigne d'écrire « Je dois vérifier dans le code … » plutôt que de demander à l'humain.
- Missions : outils `list_code_files` et `read_code_file` (20 000 caractères par fichier), à utiliser quand la mission porte sur le site.
Tests : `__integration__/codeOnDemand.test.js`.

### D15. Iconographie unique — fait le 12/10/2026
Plus aucun émoji comme icône dans l'interface : icônes contour lucide (trait 1,75), centralisées dans `client/src/components/ui/icons.jsx`.
- Avatars d'agents (`AgentAvatar`) : l'émoji enregistré (`Agent.emoji`, inchangé en base) est traduit en icône ; agent à l'émoji par défaut 🤖 : icône déduite du nom et du rôle (Juriste → balance, Designer → palette…). Formulaires d'agent : sélecteur d'icône (`AgentIconPicker`) au lieu du champ émoji.
- Catégories d'outils (`ToolCategoryIcon`, par id du catalogue serveur), types de réunion, modes de questions, curseur d'humour, bannières, fenêtres (fermer, copier, télécharger…).
- Messages système d'anciennes réunions : émoji de tête retiré à l'affichage (`stripLeadingEmoji`).
- Code mort retiré : `ProjectLayout` et l'ancienne colonne « Réunions » de `ProjectTimelinePanel`.
Règle : toute nouvelle icône vient de lucide-react ; ne pas réintroduire d'émoji dans l'interface.

### D16. Développement « en échec » alors que le travail est fait — corrigé le 12/10/2026
Cas réel (Site de numérologie, dev n° 3 « Revoir la V0 avec plus de contenu ») : Claude Code a fini et poussé la branche (1 commit, 22 fichiers), mais en 71 tours pour une limite de 60 ; l'action GitHub classe alors l'exécution en échec, et BlabIA affichait « Le développement a échoué ». 9 commandes refusées (mkdir, cp…) avaient coûté des tours.
- Automatisations v3 (`services/githubWorkflows.js`) : 150 tours, commandes de fichiers courantes autorisées. Mise à jour d'office des automatisations d'une version précédente (consultation de Projet › Développements et lancement d'un développement), sans étape pour l'humain.
- `services/devTasks.js` : exécution terminée en échec (`failure`, `timed_out`) mais branche en avance → pull request ouverte par BlabIA avec un avertissement « à relire » ; un ancien échec de ce type est récupéré dès que la branche est visible.
- Page Développements : icône « Relancer ce développement » sur la carte d'un développement échoué (le dernier de sa réunion, propriétaire, dépôt prêt) — même lancement que « Relancer » : confirmation, contrôle des outils.

### D17. Actions revues par les réunions — fait le 12/10/2026
- Agents : actions à faire repérées A1, A2… avec leur précision (description, 240 caractères), plus les 8 dernières faites ; consigne de dire explicitement quand une action devient inutile, est redéfinie ou déjà faite.
- Conclusion : l'extraction renvoie `actionChanges` (update / cancel / done, avec la raison), rapprochés des actions par `parseActionChanges` (`services/actions.js`). Fenêtre de conclusion : « Actions déjà suivies, revues par la réunion », chaque changement coché par défaut, modifiable, appliqué seulement à la validation (routes /todos existantes).
- Annulée = statut `cancelled` (jamais effacée) : absente pour les agents et les compteurs ; page Actions, section « Annulées » avec « Rétablir » (`GET /actions?withCancelled=1`).
Tests : `services/__tests__/actions.test.js`, `__integration__/actionChanges.test.js`.

### D18. Réinitialiser un projet relié à un dépôt — fait le 12/10/2026
La réinitialisation n'efface que la mémoire de BlabIA : code, site en ligne, base du site et outils restent. Fenêtre de réinitialisation (Paramètres) : encadré « Le site lui-même n'est pas réinitialisé » (nouveau projet « Site web à créer de zéro » conseillé pour repartir d'une page blanche), alerte si un développement est en cours, case « Abandonner les développements en attente » (`DELETE /memory?abandonDevs=true` : pull requests et demandes fermées sur GitHub). Après réinitialisation, note `[RÉINITIALISATION | …]` en mémoire : un site existe déjà (dépôt, développements mis en ligne), partir du code actuel et signaler ce qui contredit les nouveaux choix.

### D19. Conclusion conservée tant qu'elle n'est pas validée — fait le 12/10/2026
Fermer la fenêtre de conclusion (pour vérifier un outil, une action…) ne perd plus la conclusion. `Session.closureDraft` (migration `20261012000002`) : { generatedAt, messageCount, data (réponse de generate-deliverable), edits (état de la fenêtre : cases, textes) }. `GET/PUT /:sessionId/closure-draft` ; la fenêtre reprend le brouillon (modifications comprises, enregistrées 800 ms après chaque changement) et affiche « Conclusion préparée aujourd'hui à … » avec « Régénérer » ; bandeau ambre « La réunion a continué » quand des messages ont été ajoutés depuis. Effacé à la clôture (acceptée ou abandonnée) et à la réinitialisation de la réunion. Test : `__integration__/closureDraft.test.js`.

### D20. Page Outils : parcours au lieu de la carte, guide par outil — fait le 13/10/2026
- Carte en toile (`ToolsMap`) supprimée (page Outils du projet et Mes outils), remplacée par `components/tools/ToolsFlow.jsx` : « Quand un visiteur ouvre le site » (domaine → hébergeur → interface → serveur, puis ce sur quoi le serveur s'appuie) et « Quand vous mettez en ligne une modification » (Claude Code → GitHub → hébergeur), plus « Autour du site ». Étape nécessaire sans outil : « à choisir » (ambre) ; étape sans outil ni besoin : masquée.
- Guide de mise en place : titres imposés « ## Étape N — <outil> : <action> » ; outils cochés « Mis en place » signalés au guide « (déjà en place) » → section courte « Déjà en place. ». Page : une section pliable par étape (`GuideSections`, rattachée aux outils par leur nom), « À faire » / « Déjà en place », première étape à faire dépliée, « Tout déplier / Tout replier » ; cocher « Mis en place » replie la section sans régénérer.
- Validation depuis le guide : « C’est fait » / « Remettre à faire » sur chaque section liée à un outil (rattachée d'abord à l'outil nommé avant « : »), y compris les outils sans case « Mis en place » sur la page (React, Node.js, GitHub…) — `setupDone` enregistré par `PUT /tools`.
- Markdown (`components/Markdown.jsx`) : react-markdown 10 ne fournit plus `inline` ; `code` rendu en ligne, blocs via `pre`. Avant, chaque `NOM` cité dans une phrase devenait un gros bloc noir (guides, réunions, comptes-rendus).

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
1. Sauvegarde de la prod (lecture seule, PostgreSQL 18 en prod → conteneur jetable `postgres:18`), fichier hors du dépôt dans `C:\BlabIA-backups\`. Dernière sauvegarde : `blabia-prod-2026-10-12-21-31.dump`.
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
