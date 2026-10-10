const Anthropic = require('@anthropic-ai/sdk');
const { recordUsage } = require('./usage');

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[anthropic] ANTHROPIC_API_KEY manquante — les appels API échoueront');
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'missing' });

// Coût réel (v5.1) : toute réponse est journalisée dans UsageLog (services/usage.js).
// Point de passage unique : aucun appel, présent ou futur, n'échappe au décompte.
const create = client.messages.create.bind(client.messages);
client.messages.create = async (params, options) => {
  const response = await create(params, options);
  if (response?.usage) recordUsage(response.model || params.model, response.usage); // sans attendre
  return response;
};

module.exports = client;
