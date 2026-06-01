const Anthropic = require('@anthropic-ai/sdk');

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[anthropic] ANTHROPIC_API_KEY manquante — les appels API échoueront');
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'missing' });

module.exports = client;
