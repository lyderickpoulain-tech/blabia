// Vérifie que l'outil de recherche web Anthropic est bien disponible et
// fonctionne pour cette clé API / organisation. N'accède à aucune base de
// données — fait uniquement un appel API de test.
//
// Usage : node src/scripts/check-web-search.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const anthropic = require('../services/anthropic');

const { buildWebSearchTool } = require('../services/webSearchTool');

// Même définition que l'application (réglage de référence : services/webSearchTool.js)
const TOOL = buildWebSearchTool({ maxUses: 3 });

async function main() {
  console.log('Test de la recherche web Anthropic (outil web_search_20260318)...\n');

  try {
    const response = await anthropic.messages.create({
      model: require('../services/models').DEFAULT_MODEL,
      max_tokens: 500,
      system: 'Tu es un assistant de test. Réponds en une phrase courte, en citant tes sources si tu cherches sur le web.',
      messages: [{ role: 'user', content: 'Quelle est la version actuelle de Node.js LTS ? Cherche l\'info si besoin.' }],
      tools: [TOOL],
    });

    const queries = response.content
      .filter(b => b.type === 'server_tool_use' && b.name === 'web_search')
      .map(b => b.input?.query)
      .filter(Boolean);

    const sources = [];
    for (const block of response.content) {
      if (block.type === 'text' && Array.isArray(block.citations)) {
        for (const c of block.citations) {
          if (c.type === 'web_search_result_location' && c.url && !sources.some(s => s.url === c.url)) {
            sources.push({ url: c.url, title: c.title || c.url });
          }
        }
      }
    }

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    console.log('Réponse du modèle :\n' + text + '\n');

    if (queries.length === 0) {
      console.log('⚠️  Aucune recherche web n\'a eu lieu — le modèle a répondu sans utiliser l\'outil.');
      console.log('   (L\'outil est disponible mais le modèle n\'a pas jugé utile de l\'utiliser pour cette question.)');
      return;
    }

    console.log(`✅ Recherche web effectuée : ${queries.length} requête(s)`);
    queries.forEach(q => console.log(`   - "${q}"`));

    if (sources.length > 0) {
      console.log(`\n✅ Sources réellement citées (${sources.length}) :`);
      sources.forEach((s, i) => console.log(`   [${i + 1}] ${s.title} — ${s.url}`));
    } else {
      console.log('\n⚠️  Recherche effectuée mais aucune source n\'a été citée dans le texte de réponse.');
    }
  } catch (err) {
    const msg = err?.message || String(err);
    const status = err?.status;
    if (status === 403 || status === 400 || /not.?(enabled|authorized|permitted)|permission/i.test(msg)) {
      console.error('❌ L\'outil de recherche web semble indisponible pour cette organisation.');
      console.error(`   Détail API : ${msg}`);
      console.error('   → Activez la recherche web pour votre organisation dans la Console Anthropic');
      console.error('     (console.anthropic.com → Settings → votre organisation → Capabilities / Tools).');
    } else {
      console.error('❌ Erreur lors de l\'appel API :', msg);
    }
    process.exitCode = 1;
  }
}

main();
