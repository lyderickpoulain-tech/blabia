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

### D. Développement depuis BlabIA (après le chantier « Code »)
Objectif : se passer du copier-coller du prompt Claude Code — « Lancer le développement » depuis la conclusion d'une réunion Claude Code.
- **Option A (à faire en premier)** : Claude Code dans **GitHub Actions** sur le dépôt de l'utilisateur. BlabIA crée la demande (issue / commentaire), suit la pull request, montre un résumé simple et un lien de prévisualisation, puis « Mettre en ligne » (fusion → Railway redéploie). Rien ne part en ligne sans le clic de l'humain.
- **Abonnement Claude** : le jeton d'abonnement (`claude setup-token`) est rangé par l'utilisateur **dans les secrets de son propre dépôt** (`CLAUDE_CODE_OAUTH_TOKEN`). **BlabIA ne le stocke ni ne le voit jamais** (règles d'Anthropic : pas de collecte ni d'usage des identifiants Free/Pro/Max par une application tierce). BlabIA vérifie seulement que le secret existe (liste des noms de secrets via l'API GitHub).
- **Par profil** : connexion GitHub + dépôt par projet. Jeton présent → « Lancer le développement » (consomme l'abonnement de l'utilisateur) ; sinon « Copier le prompt » comme aujourd'hui. Variante : clé API personnelle saisie dans le profil (stockée chiffrée, facturée à l'utilisateur, plafond par tâche).
- **Garde-fous** : un développement à la fois, lancé par un clic, Sonnet par défaut, nombre de tours et durée plafonnés, tâches petites et préparées en réunion ; sauvegarde de la base avant toute migration (à automatiser ou garder en validation manuelle).
- **Option B (plus tard)** : Claude Managed Agents (crédits API + 0,08 $/heure d'exécution, plafond par session) pour un suivi en direct dans BlabIA.
- L'utilisateur principal a un abonnement **Pro** (Claude Code inclus, limites partagées avec VS Code, pas de crédits API mensuels).

### C. Code
1. ✅ Modèle centralisé dans `server/src/services/models.js` (`DEFAULT_MODEL`, `MEETING_MODELS`, servis au client par `GET /api/models`). Orchestrateur sur un modèle léger (`ORCHESTRATOR_MODEL` = Haiku 5.5, réflexion désactivée : ~0,0001 $ par tour au lieu de ~0,003 $). Les commandes rapides et l'analyse des besoins restent sur Sonnet (contenu lu par l'humain).
2. ✅ Mise en cache des prompts : le prompt d'agent est rendu en deux blocs (`services/prompts/agentPrompt.js`) — bloc commun à la réunion marqué `cache_control` (projet, brief, plan, registre, mémoire, règles ; ~1 800 tokens), puis bloc du tour (rôle, raison, budget, questions déjà posées…). Mesuré : le 2ᵉ agent relit le bloc commun (appel 0,0020 $ au lieu de 0,0082 $). Ne rien mettre de variable dans le bloc commun (tests `agentPrompt.test.js`).
3. ~~Éviter l'appel d'orchestration quand le choix est évident~~ — abandonné : avec Haiku l'appel coûte ~0,0001 $, et le sauter ferait perdre la suggestion de clôture (`shouldClose`). La mention @ et la réunion à un seul agent court-circuitent déjà l'appel.
4. Découper `ProjectView.jsx` (~1 250 lignes) et `MeetingRoom.jsx` (~1 150 lignes) ; chargement des pages à la demande (bundle principal ~650 Ko).
5. Notifications d'erreur côté client (beaucoup de `catch {}` silencieux : c'est ce qui a masqué le bug `updatedAt`).
6. Tests : boucle de réunion avec IA simulée ; test de contrôle d'accès de toutes les routes.
7. Après stabilisation en prod (accord explicite de l'utilisateur requis : suppression irréversible, contraire à la règle des migrations additives) : supprimer les colonnes `DEPRECATED` (`User.techStack/toolbox`, `Project.techStack/hasTechnicalStack`, `Milestone.checklistData`, `Session.suggestedTools/pendingStepSuggestions/exchanges/agents`) ; trancher le sort de `PlanView` / `TodoItem`.

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
- `CRON_SECRET` : déclenchement externe des rappels hebdomadaires. **cron-job.org** (tâche « RappelsBlabIA ») appelle chaque heure `POST https://blabia-production.up.railway.app/api/reminders/run` avec l'en-tête `x-cron-secret`. Réponses : 200 = OK, 403 = secret différent, 503 = variable absente du service. Utile si le service est mis en veille (pas de changement de plan Railway souhaité).

Restauration en cas de problème :
```powershell
docker run --rm -v "C:/BlabIA-backups:/backups:ro" postgres:18 pg_restore --clean --if-exists --no-owner --no-privileges -d "<adresse de la base>" /backups/<fichier>.dump
```
