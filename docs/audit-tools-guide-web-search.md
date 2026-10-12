# Audit — recherche web du guide de mise en place (`POST /tools/guide`)

Constats faits sur le code avant la modification (issue #9).

## L'outil web était-il branché ?

**Oui, pour le guide comme pour la discussion**, mais de façon indirecte et sans contrôle.

- `routes/tools.js` → `generateSetupGuide` / `answerGuideQuestion` (`services/tools/setupGuide.js`) appelaient `callAgent(..., webSearch = true)` (`routes/sessions/helpers.js`). `callAgent` passe bien `tools: [web_search_20260318]` à `anthropic.messages.create`, avec `allowed_callers: ['direct']` et la localisation FR.
- Plafond : `max_uses: 3` pour le guide **comme** pour la discussion (constante `WEB_SEARCH_MAX_USES` de `callAgent`), trop bas pour un guide qui couvre plusieurs services.
- `max_tokens` : 6000 (guide), 2500 (discussion). `anthropic.js` y ajoute 2000 de marge de réflexion.
- Texte : `callAgent` joint les blocs `text` de la **dernière** réponse. Les sources n'étaient gardées que depuis les citations des blocs texte, puis collées en bas du texte Markdown (8 au plus) : elles n'étaient ni structurées ni affichées à part.
- **Aucune trace** de la vérification : si le modèle ne cherchait pas (ou si la recherche échouait, ou si l'organisation n'avait pas l'outil), le guide était enregistré comme les autres, sans avertissement. Le prompt demande de « vérifier par une recherche web » mais rien n'assurait que ce soit fait.
- `pause_turn` : `callAgent` relançait déjà jusqu'à 3 fois, mais sans budget cumulé (chaque relance repartait avec `max_uses: 3`) et sans statut final : une réponse restée en `pause_turn` ou coupée par `max_tokens` était enregistrée comme complète (`max_tokens` : coupure à la dernière phrase, silencieuse).

## Modèle de secours (`fallbacks`)

`anthropic.js#adaptForModel` ajoute `fallbacks: 'default'` (bêta `server-side-fallback-2026-07-01`) pour les modèles Claude 5, sans rien retirer des paramètres. D'après les types du SDK installé, le secours n'est tenté que si le modèle demandé **décline pour une raison de sécurité** ; chaque entrée de secours est « validée comme si la requête visait ce modèle ». Le code et le SDK ne disent pas si le modèle de secours accepte l'outil web : **non vérifiable hors ligne**. Mesure prise : `runWithWebSearch` journalise un avertissement `bascule de modèle : X → Y` quand `response.model` diffère du modèle demandé, et le journal final indique le modèle réel. À confirmer avec un vrai cas de bascule.

Le wrapper `anthropic.js` ne contient ni boucle de relance ni gestion de `pause_turn` (c'est volontaire : la relance est dans `runWithWebSearch`, pas dans le wrapper commun).

## Coûts (`usage.js`, `pricing.js`)

`recordUsage` est appelé par le wrapper à **chaque** réponse de `messages.create` (donc à chaque relance), avec `webSearches` = `usage.server_tool_use.web_search_requests` et 0,01 $ par recherche (`WEB_SEARCH_USD`). Le `kind` vient de l'URL : `tools/guide` (guide), `tools/guide/chat` (discussion). Rien à changer : une relance = une ligne `UsageLog`.

## Autres constats

- `check-web-search.js` contenait le réglage de référence en copie locale ; `missionRunner.js`, `routes/projects.js` (`/rechercher`) et `callAgent` en avaient chacun une copie. Elles sont remplacées par `services/webSearchTool.js`.
- Interface (`pages/project/ProjectTools.jsx`, composant `SetupGuide`) : aucune étiquette, aucune liste de sources, `Régénérer` écrasait toujours le guide.
- Tests existants (`services/__tests__/tools.test.js`) : ne couvraient que le catalogue et les outils, pas le guide.

## Décisions de mise en œuvre

- **Budget épuisé** : l'API n'a pas pu être interrogée ici, donc on suppose prudemment qu'elle refuse un historique contenant des blocs `server_tool_use` si l'outil n'est plus déclaré, et que `max_uses: 0` est refusé. Comportement retenu : l'outil reste déclaré avec `max_uses: 1` et la consigne « conclure sans chercher » est ajoutée au message système. Au pire, une recherche de plus par relance est possible (comptée dans `searches`).
- **Plafonds** : guide 8 (`GUIDE_MAX_SEARCHES`), discussion 3 (`CHAT_MAX_SEARCHES`). 8 contre 5 reste à confirmer.
- **Sources** : limitées à 20 par guide ou réponse (résultats de recherche puis citations, sans doublons).
- **Texte conservé après relances** : le texte de la dernière réponse seulement (comme avant).
