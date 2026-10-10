import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { costUSD, normalizeUsage, pricesFor } = require('../pricing');
const { parseUsageTarget } = require('../usage');

const P = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const S = 'f0e1d2c3-b4a5-4968-8776-655443322110';

describe('coût réel : tarifs', () => {
  it('Sonnet 4.6 : 3 $ / 15 $ par million de tokens', () => {
    expect(costUSD('claude-sonnet-4-6', { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(18, 6);
  });

  it('Opus 4.8 : 5 $ / 25 $ par million de tokens', () => {
    expect(costUSD('claude-opus-4-8', { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(30, 6);
  });

  it('Haiku 5.5 (orchestrateur) : 0,10 $ / 0,50 $ par million de tokens', () => {
    expect(costUSD('claude-haiku-5-5', { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(0.6, 6);
  });

  it('compte le cache (écriture 5 min / 1 h, lecture) et la recherche web', () => {
    const usage = {
      input_tokens: 0, output_tokens: 0,
      cache_creation_input_tokens: 3_000_000,
      cache_creation: { ephemeral_5m_input_tokens: 2_000_000, ephemeral_1h_input_tokens: 1_000_000 },
      cache_read_input_tokens: 1_000_000,
      server_tool_use: { web_search_requests: 3 },
    };
    // 2 × 3,75 + 1 × 6 + 1 × 0,30 + 3 × 0,01
    expect(costUSD('claude-sonnet-4-6', usage)).toBeCloseTo(7.5 + 6 + 0.3 + 0.03, 6);
  });

  it('écriture de cache sans détail : tarif 5 minutes', () => {
    expect(normalizeUsage({ cache_creation_input_tokens: 500 })).toMatchObject({ cacheWrite5m: 500, cacheWrite1h: 0 });
  });

  it('identifiant daté ou modèle inconnu : tarif de la famille', () => {
    expect(pricesFor('claude-sonnet-4-6-20260101')).toBe(pricesFor('claude-sonnet-4-6'));
    expect(pricesFor('claude-opus-9-9').input).toBe(5);
  });
});

describe('coût réel : rattachement des appels', () => {
  it('projet + réunion + type depuis l’URL', () => {
    expect(parseUsageTarget(`/api/projects/${P}/sessions/${S}/chat`)).toEqual({ projectId: P, sessionId: S, kind: 'chat' });
    expect(parseUsageTarget(`/api/projects/${P}/sessions/${S}/generate-deliverable?x=1`))
      .toEqual({ projectId: P, sessionId: S, kind: 'generate-deliverable' });
  });

  it('route de projet sans réunion', () => {
    expect(parseUsageTarget(`/api/projects/${P}/quick-command`)).toEqual({ projectId: P, sessionId: null, kind: 'quick-command' });
    expect(parseUsageTarget(`/api/projects/${P}/tools/analyze`)).toEqual({ projectId: P, sessionId: null, kind: 'tools/analyze' });
  });

  it('« suggest-agents » n’est pas pris pour un identifiant de réunion', () => {
    expect(parseUsageTarget(`/api/projects/${P}/sessions/suggest-agents`))
      .toEqual({ projectId: P, sessionId: null, kind: 'sessions/suggest-agents' });
  });

  it('export : projet lu dans le corps de la requête', () => {
    expect(parseUsageTarget('/api/export/claude-code', { projectId: P })).toEqual({ projectId: P, sessionId: null, kind: 'export/claude-code' });
    expect(parseUsageTarget('/api/export/claude-code', { projectId: 'pas-un-uuid' }).projectId).toBeNull();
  });
});
