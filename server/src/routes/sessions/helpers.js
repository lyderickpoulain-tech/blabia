// Fonctions et constantes partagées entre les sous-routers sessions/
const db         = require('../../utils/db');
const anthropic  = require('../../services/anthropic');
const { parseJsonField } = require('../../utils/parseJsonField');

const MODEL = 'claude-sonnet-4-6';

// ── Similarité lexicale (Jaccard) ─────────────────────────────────────────────

function areSimilar(q1, q2, threshold = 0.6) {
  const words1 = new Set(q1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(q2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const intersection = [...words1].filter(w => words2.has(w));
  const union = new Set([...words1, ...words2]);
  return union.size > 0 && intersection.length / union.size > threshold;
}

// ── Mémoire projet ────────────────────────────────────────────────────────────
// Ajoute le compte-rendu d'une session à la mémoire cumulée du projet
// (rotation des entrées les plus anciennes au-delà de MAX_CHARS).

async function updateProjectContext(projectId, sessionId, task, content) {
  try {
    const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const entry = `[SESSION:${sessionId} | ${date} — ${task}]\n${content}`;

    const [project] = await db('Project').select('context').where({ id: projectId }).limit(1);
    const current = project?.context || '';
    let newContext = (current ? current + '\n---\n' : '') + entry;

    const MAX_CHARS = 10000;
    if (newContext.length > MAX_CHARS) {
      const parts = newContext.split('\n---\n');
      while (parts.length > 1 && parts.join('\n---\n').length > MAX_CHARS) {
        parts.shift();
      }
      newContext = parts.join('\n---\n');
    }

    await db('Project').where({ id: projectId }).update({ context: newContext, updatedAt: new Date() });
  } catch (err) {
    console.error('[updateProjectContext]', err.message);
  }
}

// ── Timeline ──────────────────────────────────────────────────────────────────

async function appendTimelineEntry(sessionId, entry) {
  await db.raw(
    `UPDATE "Session" SET timeline = COALESCE(timeline, '[]'::jsonb) || ?::jsonb WHERE id = ?`,
    [JSON.stringify([entry]), sessionId]
  );
}

async function patchTimelineEntry(sessionId, entryId, patch) {
  const [session] = await db('Session').select('timeline').where({ id: sessionId }).limit(1);
  const tl = parseJsonField(session?.timeline, []);
  const idx = tl.findIndex(e => e.id === entryId);
  if (idx < 0) return;
  tl[idx] = { ...tl[idx], ...patch };
  await db('Session').where({ id: sessionId }).update({ timeline: JSON.stringify(tl) });
}

// ── Messages ──────────────────────────────────────────────────────────────────

async function appendMessageEntry(sessionId, message) {
  await db.raw(
    `UPDATE "Session" SET messages = COALESCE(messages, '[]'::jsonb) || ?::jsonb WHERE id = ?`,
    [JSON.stringify([message]), sessionId]
  );
}

async function appendPendingStepSuggestion(sessionId, suggestion) {
  const [row] = await db('Session').select('pendingStepSuggestions').where({ id: sessionId });
  const existing = parseJsonField(row?.pendingStepSuggestions, []);
  if (existing.length >= 5) return;
  const isDuplicate = existing.some(s => areSimilar(s.title || '', suggestion.title || '', 0.5));
  if (isDuplicate) return;
  await db.raw(
    `UPDATE "Session" SET "pendingStepSuggestions" = COALESCE("pendingStepSuggestions", '[]'::jsonb) || ?::jsonb WHERE id = ?`,
    [JSON.stringify([suggestion]), sessionId]
  );
}

// ── Streaming Anthropic avec auto-continuation ────────────────────────────────

async function streamAgent(systemPrompt, userMessage, onChunk, maxTokens = 1500, model = MODEL, signal = null, webSearch = false) {
  const MAX_CONTINUATIONS = 5;
  let fullText = '';
  let messages = [{ role: 'user', content: userMessage }];
  let totalInputTokens  = 0;
  let totalOutputTokens = 0;
  const sources = [];

  for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
    const apiParams = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      stream: true
    };
    if (webSearch) {
      apiParams.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
    }

    const stream = await anthropic.messages.create(apiParams, signal ? { signal } : undefined);

    let chunkText = '';
    let stopReason = null;

    for await (const event of stream) {
      if (signal?.aborted) break;
      if (event.type === 'message_start' && event.message?.usage) {
        totalInputTokens += event.message.usage.input_tokens || 0;
      }
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        chunkText += event.delta.text;
        fullText += event.delta.text;
        onChunk(event.delta.text);
      }
      if (event.type === 'message_delta') {
        if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
        if (event.usage) totalOutputTokens += event.usage.output_tokens || 0;
      }
      if (webSearch && event.type === 'content_block_start') {
        const cb = event.content_block;
        if (cb?.type === 'web_search_tool_result' && Array.isArray(cb.content)) {
          for (const result of cb.content) {
            if (result.type === 'web_search_result' && result.url) {
              if (!sources.some(s => s.url === result.url)) {
                sources.push({ url: result.url, title: result.title || result.url });
              }
            }
          }
        }
      }
    }

    if (signal?.aborted) break;
    if (stopReason !== 'max_tokens') break;

    if (attempt >= MAX_CONTINUATIONS) {
      const truncated = fullText.replace(/[^.!?]*$/, '').trim();
      if (truncated && truncated.length < fullText.length) {
        const delta = truncated.length - fullText.length;
        fullText = truncated;
        onChunk('\0'.repeat(Math.abs(delta)));
      }
      const note = '\n\n*[Synthèse condensée]*';
      fullText += note;
      onChunk(note);
      break;
    }

    messages = [
      ...messages,
      { role: 'assistant', content: chunkText },
      { role: 'user', content: 'Continue exactement où tu t\'es arrêté, sans répéter ce qui précède.' }
    ];
  }

  return { text: fullText, usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }, sources };
}

module.exports = {
  MODEL,
  areSimilar,
  updateProjectContext,
  appendTimelineEntry,
  patchTimelineEntry,
  appendMessageEntry,
  appendPendingStepSuggestion,
  streamAgent,
};
