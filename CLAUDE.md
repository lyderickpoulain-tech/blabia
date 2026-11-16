# BlabIA

« Vous décrivez votre projet, une équipe d'assistants en discute avec vous, vous décidez, BlabIA fait le reste. » La cible est quelqu'un qui a une idée, aucune compétence technique, et qui ne veut ni comptes à ouvrir ni réglages à comprendre. Devant l'utilisateur, on dit « assistants » (pas « agents »), on vouvoie, aucun émoji.

## v6 « l'ouvrage d'abord » (en cours depuis le 15/11/2026)

Source de vérité : `prompt-claude-code-blabia-v6.md` (racine du dépôt), qui prime sur ce fichier, sur `docs/passation-fable.md` et sur la feuille de route. Une phase par session, arrêt et compte rendu au porteur à la fin de chaque phase. Le suivi est dans `docs/feuille-de-route-v5.1.md`, section « v6 ».

- **Le résultat d'abord** : chaque projet a un ouvrage (un dossier versionné) produit dès le récit du projet, sans question ; les réunions l'améliorent et finissent par une nouvelle version ; ce que le porteur n'a pas dit devient une supposition modifiable, pas une question ; ses idées sont suivies une à une ; l'ouvrage est toujours complet, l'incertain marqué « à vérifier », jamais retiré.
- **Règle du minimum de technique (passe avant toutes les autres)** : sans le mode avancé, l'utilisateur ne voit jamais un nom d'outil ou de marque technique (GitHub, Claude Code, Railway, API, dépôt), un nom de modèle, des jetons, un coût en dollars, un réglage à faire avant d'obtenir un résultat, un mot anglais, un sigle ou un repère interne (R2, V0), ni un choix dont il ne mesure pas les conséquences. Ce qui quitte l'interface passe derrière le mode avancé (réglé par personne) : rien n'est supprimé.
- **Périmètre** : la v6 porte sur les projets libres (le résultat est un dossier). Construire et mettre en ligne un site formera plus tard l'extension « BlabIA + » ; le parcours technique v5.1 reste en l'état, derrière le mode avancé, et n'évolue pas. Le cœur (ouvrage, versions, suppositions, idées, réunions, livraison) n'importe rien de ce qui est propre au technique (`github`, `githubWorkflows`, `devTasks`, `devTools`, `railway`, `repoOverview`, `codeContext`, `websiteStarter`, `services/tools/`).
- **Avec le porteur** (non développeur) : comptes rendus en français courant ; un choix technique se fait et se dit en une phrase ; ne lui soumettre que ce qui touche à ce que voit l'utilisateur, à l'argent ou à ses données, sous forme de recommandation (oui / non) ; ses gestes donnés pas à pas, regroupés en fin de phase ; ne jamais lui demander de coller un secret dans la conversation.

Historique v5 / v5.1 : `docs/feuille-de-route-v5.1.md` et `docs/passation-fable.md`.

## Architecture

```
client/   React 18 + Vite + Tailwind
server/   Node + Express
          server/src/routes/sessions/   sous-routeur express ("réunions")
          server/src/services/prompts/ construction des prompts (agent, orchestrateur, livrables)
          server/src/services/markers.js  parsing des marqueurs [DECISION]/[SUGGEST_AGENT]/[SUGGEST_MEETING]/[NEED_TOOL]
server/prisma/   schema.prisma + migrations SQL
```

- **Requêtes** : via **knex** (`server/src/utils/db.js`).
- **Migrations** : via **Prisma** (`server/prisma/schema.prisma` + `prisma migrate deploy` au démarrage, cf. `Dockerfile`). Prisma ne sert qu'aux migrations — aucune requête applicative ne passe par le client Prisma.
- **Déploiement** : Railway.
- **Poste de dev** : Windows ARM64 — aucune dépendance native (JS pur uniquement). Le contrôle d'applications de Windows bloque les modules natifs récents non reconnus : `vite` et `rolldown` (outils de test du serveur) sont figés par `overrides` dans `server/package.json` ; ne les monter qu'après avoir vérifié que `npx vitest run` démarre.
- **Secrets enregistrés** (clé API Anthropic, jeton Railway des utilisateurs) : chiffrés par `server/src/utils/secretBox.js` avec `SECRETS_ENCRYPTION_KEY`, indépendante de `JWT_SECRET` (ancien format lu en repli et rechiffré à la première lecture). Ne jamais changer `SECRETS_ENCRYPTION_KEY` : les secrets deviendraient illisibles (à ressaisir par chacun).

## Glossaire

| Terme UI | Modèle DB | Sens |
|---|---|---|
| **Réunion planifiée** | `Milestone` | Un objectif à traiter, placé dans le plan des réunions du projet (nom de table conservé pour éviter une migration lourde) |
| **Réunion tenue** | `Session` (mode `meeting`) | La conversation réelle entre l'humain et les agents, liée ou non à une réunion planifiée |
| **Compte-rendu** | `Session.summary` | Toujours produit à la clôture, injecté en mémoire projet (`Project.context`). Structuré en relevé de décisions pour le type `decision` |
| **Livrable** | `Session.deliverable` | Résultat typé produit en plus du CR à la clôture : prompt (`claude_code`) ou liste d'outils proposés (`stack`) |
| **Type d'objectif** | `Milestone.type` / `Session.intention` | `decision` (prise de décision), `claude_code` (prompt Claude Code), `stack` (revue des outils) |
| **Registre des décisions** | table `Decision` | Ce qui est tranché pour le projet (`origin` human/agents, `status` active/reopened/superseded). Proposé à la clôture (`services/decisions.js#extractMeetingDecisions`), inscrit seulement après validation (`POST /projects/:id/decisions/from-session`), transmis aux agents ; vidé par la réinitialisation de la mémoire |
| **Préparation sans l'humain** | `/chat` avec `prepare: true` | En début de réunion (≥ 2 agents) : débat entre agents (2 tours/agent, 4 à 8), sans carte de décision, puis synthèse (`type: 'prep_summary'`) et décisions regroupées pour l'humain, dans le budget de questions — `services/prompts/preparationPrompt.js` |
| **Questions des agents** | `Project.questionMode` / `Session.questionMode` | Budget de cartes de décision par réunion : `delegate` (4), `balanced` (8), `control` (15) — `services/questionModes.js`. Au-delà, les agents tranchent par hypothèse explicite que l'humain peut contredire |
| **Mes outils** | `User.tools` | Outils de l'utilisateur, tous projets (statut j'utilise / j'ai un compte / à essayer, coût, note) |
| **Outils du projet** | `Project.tools` | Sélection parmi « Mes outils » + outils complémentaires (suggéré / validé / refusé, coût) |
| **Catalogue d'outils** | `server/src/services/tools/catalog.js` | 16 catégories en termes simples, outils connus, coûts indicatifs, positions de la carte — servi au client par `GET /api/tools/catalog` |

## Historique récent (v5.0)

- **Phase 1** : suppression du pipeline legacy (`NewSessionLegacy`, `SessionRunner`, route `/run`, champs `Session.exchanges`/`agents`), remplacé par `StartMeeting` → `MeetingRoom` (`/chat`, champs `Session.messages`/`activeAgents`). Toute session passe par `mode = 'meeting'`. Prompts centralisés, parsing des marqueurs centralisé.
- **Phase 2** : fin du streaming texte (`callAgent` non streamé, bulles multiples séparées par `[NEXT]`), vrai Markdown dans les bulles, curseurs pédagogie/humour (`Project.expertiseLevel`/`humorLevel`, surcharge par `Session`), recherche web câblée (outil `web_search_20260318`, `allowed_callers: ['direct']` requis pour obtenir des citations fiables).
- **Phase 3** : types d'objectif consolidés en `decision | claude_code | stack` (migration `20261008000003_v5_meeting_types_deliverable` — anciennes valeurs `summary`/`synthesis`/`memory`/`timeline_steps`/`meeting`/`technical`/`milestone` → `decision`, `stack_check` → `stack`). Livrable séparé du compte-rendu (`Session.deliverable`). Le livrable n'est produit qu'à la clôture (« Conclure la réunion », génération automatique, plus de bouton « Générer » séparé). Suggestions de nouvelles réunions via `[SUGGEST_MEETING:{...}]` (remplace `[SUGGEST_STEP]`), stockées dans `Session.pendingMeetingSuggestions`, positionnables via une référence courte (`R1`, `R2`…) résolue au moment du « Plan des réunions » (`server/src/routes/sessions/meetingPlan.js`).
- **Phase 4** : refonte des outils. `User.techStack` + `User.toolbox` → `User.tools` ; `Project.techStack`/`hasTechnicalStack` + `Session.pendingToolSuggestions` v4 → `Project.tools` (migration `20261008000004_v5_tools` : colonnes additives, conversion en JS à la première lecture dans `services/tools/toolsStore.js`, `NULL` = pas encore migré). Page unique « Mes outils » (`/outils`), carte des outils (`components/tools/ToolsMap.jsx`), panneau « Outils » du projet. Réunion `stack` : grille des catégories + `[NEED_TOOL:{…, costMin, costMax, freeTier, priceSource}]`, validation outil par outil à la clôture (`POST /sessions/:id/tools/apply`). Supprimés : `EnvironmentPage`, `MyToolbox`, `StackPanel`, `StackCheckModal`, `utils/techStack.js`, routes `tech-stack`/`toolbox`/`pending-tools`/`suggest-stack`/checklist. Les outils du projet sont organisés par besoin : `POST /projects/:id/tools/analyze` (`services/tools/toolNeeds.js`) identifie les catégories nécessaires, pré-remplit avec « Mes outils » et pose des avertissements (`Project.toolNeeds`, `warning` sur l'outil).
- **Phase 5** : illustrations à la demande. Bouton « 🎨 Illustrer » (`artifactRequest: true` sur `/chat`) ou demande explicite détectée (`markers.js#detectArtifactRequest`, y compris `/illustrer`) → l'orchestrateur choisit l'agent, `max_tokens` relevé pour ce tour. Bloc ```mermaid / ```html / ```svg + `[ARTIFACT_TITLE:…]`, extrait par `parseAgentOutput` et stocké sur le message (`artifact: { kind, title, code }`) ; sans demande, le bloc est retiré. Rendu client `components/meeting/ArtifactCard.jsx` : iframe sandboxée (`allow-scripts` sans `allow-same-origin` pour le HTML, aucun script pour SVG/Mermaid), `mermaid` chargé à la demande en `securityLevel: 'strict'`. Titres listés en fin de compte-rendu.
- `TodoItem`/`PlanView.jsx` (page `/projects/:id/plan`) restent **hors périmètre v5** — non touchés, peuvent afficher des icônes de repli pour les nouveaux types.

## Règles du projet (aussi pour Claude Code lancé depuis BlabIA)

- **Chaque fonctionnalité visible met à jour, dans le même développement** : le guide (`client/src/components/Tutorial.jsx`, écran « Le principe »), la visite guidée (`client/src/tour/chapters.js`) et, si la fonctionnalité s'y prête, le projet exemple (`server/src/services/demoProject.js`) ; ainsi que la feuille de route (`docs/feuille-de-route-v5.1.md`).
- **Icônes : uniquement lucide-react, en contour** (trait 1,75 pour les icônes décoratives), jamais d'émoji dans l'interface. Avatars d'agents, catégories d'outils et types de réunion : `client/src/components/ui/icons.jsx` et `MeetingTypeIcon` (`components/meeting/MilestoneDrawers.jsx`).
- **`server/.env` désigne la base de PRODUCTION.** Jamais de commande Prisma (`migrate`, `db push`, `reset`…) sans `DATABASE_URL` explicite vers une base de test : utiliser `npm run db:migrate:test` (refuse toute base dont le nom ne contient pas « test »). Les migrations de prod s'appliquent seules au démarrage sur Railway.
- **Sauvegarde avant migration** : chaque envoi sur `main` lance `.github/workflows/sauvegarde-base.yml` (sauvegarde chiffrée de la prod, 90 jours) ; Railway attend sa réussite avant de déployer (« Wait for CI »). Vérifier qu'elle a réussi (onglet Actions) avant de considérer une migration comme protégée. « Mettre en ligne » dans BlabIA sauvegarde aussi avant la fusion. Claude Code ne fusionne et ne déploie jamais lui-même.
- **Tests** : unitaires `cd server && npx vitest run` ; intégration `TEST_DATABASE_URL=… npm run test:integration` (base de test locale uniquement). Les modules qui ouvrent la base ne se chargent pas au début d'un fichier de test d'intégration (après `harness.start()` seulement).
- **Modèles Claude** : définis dans `server/src/services/models.js` ; tout appel passe par `server/src/services/anthropic.js` (réglages Claude 5, journal des coûts) ; lire le texte d'une réponse avec `anthropic.textOf(response)`, jamais `content[0].text`.

## Conventions

- **Migrations non destructives.** Base de prod = données réelles. On ajoute des colonnes, on copie les données en SQL dans la migration, on marque l'ancien champ `// DEPRECATED` dans le schéma. **Aucun `DROP` de colonne ou de table.** Toujours faire un `pg_dump` avant un déploiement qui inclut une migration.
- Chaque nouvelle migration Prisma met à jour `schema.prisma` en même temps (schéma et base restent synchronisés).
- Les requêtes applicatives passent par **knex**, jamais par le client Prisma généré.
- **Droits d'accès** : chaque route vérifie l'accès via `findProject(projectId, userId, isAdmin)` (`server/src/utils/projectHelpers.js`) — même pattern partout.
- **Prompts centralisés** dans `server/src/services/prompts/` (`agentPrompt.js`, `orchestratorPrompt.js`, `deliverablePrompts.js`). Aucune consigne d'agent ne doit être construite côté client.
- **Marqueurs d'agent** (`[DECISION:…]`, `[SUGGEST_AGENT:…]`, `[SUGGEST_MEETING:…]`, `[NEED_TOOL:…]`) parsés exclusivement via `server/src/services/markers.js#parseAgentOutput`.
- **Champs JSONB** lus côté serveur via `server/src/utils/parseJsonField.js` (gère valeur déjà parsée, chaîne JSON, null, JSON invalide) plutôt que des variantes locales `Array.isArray(x) ? x : JSON.parse(...)`.
- Interface 100 % en français, style visuel Tailwind existant (couleurs `blabia-*`).

## Commandes utiles

```bash
# Client
cd client && npm run dev        # dev server Vite
cd client && npm run build      # build de prod
# ⚠️ Après toute modification de client/tailwind.config.js : relancer `npm run dev`
#    (Vite ne relit pas la config Tailwind à chaud → nouvelles couleurs absentes)

# Serveur
cd server && npm run dev        # nodemon
cd server && npm run start      # prod
cd server && npm test           # vitest (server/src/**/__tests__)

# Prisma
cd server && npx prisma validate
cd server && npm run db:migrate:test     # migrations sur la base de TEST (TEST_DATABASE_URL) — jamais migrate deploy depuis server/ (server/.env = prod)
cd server && npx prisma generate
```
