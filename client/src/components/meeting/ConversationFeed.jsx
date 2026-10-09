import { useState } from 'react';
import { Image as ImageIcon, Sparkles } from 'lucide-react';
import DecisionCard from '../DecisionCard';
import Markdown from '../Markdown';

// ── Fil de conversation compact (refonte UX v5.1) ─────────────────────────────
// Messages façon messagerie : avatar et nom au premier message d'une série.
// Les suggestions sont dans le panneau latéral ; les illustrations s'ouvrent
// dans la zone de droite ; la préparation tient en une ligne « Briefing ».

// ── Recherche web (2.6) ────────────────────────────────────────────────────────

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

// Insère un appel de note [n] juste après chaque extrait réellement cité,
// quand on parvient à le localiser dans le texte affiché.
function annotateWithCitations(content, sources) {
  let result = content;
  sources.forEach((s, i) => {
    if (!s.citedText) return;
    const idx = result.indexOf(s.citedText);
    if (idx === -1) return;
    const insertAt = idx + s.citedText.length;
    result = `${result.slice(0, insertAt)} [${i + 1}]${result.slice(insertAt)}`;
  });
  return result;
}

function WebSearchBlock({ webSearch }) {
  const [open, setOpen] = useState(false);
  const queries = webSearch.queries || [];
  const sources = webSearch.sources || [];
  if (queries.length === 0) return null;

  return (
    <div className="mt-0.5">
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
        className="min-h-[28px] text-xs font-semibold text-action hover:underline">
        {queries.length} recherche{queries.length !== 1 ? 's' : ''} web
        {sources.length > 0 && <span className="text-ink-faint"> · {sources.length} source{sources.length !== 1 ? 's' : ''} {open ? '▲' : '▼'}</span>}
      </button>
      {open && sources.length > 0 && (
        <div className="mt-1 space-y-1 border-l-2 border-action-light pl-2">
          {sources.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
              className="flex items-start gap-1.5 text-xs text-action hover:underline">
              <span className="text-ink-faint shrink-0">[{i + 1}]</span>
              <span className="truncate">{s.title} <span className="text-ink-faint">— {extractDomain(s.url)}</span></span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// Hypothèse explicite d'un agent (consigne du prompt : « Je pars sur X, sauf avis contraire »)
const HYPOTHESIS_RE = /sauf avis contraire|^\s*hypoth[eè]se\s*:/i;
const stripHypothesisPrefix = t => t.replace(/^\s*hypoth[eè]se\s*:\s*/i, '');
const KIND_LABEL = { mermaid: 'Schéma', html: 'Maquette', svg: 'Visuel' };
const TURN_SEPARATOR = 'mt-2 pt-2.5 border-t border-line [&:first-child]:mt-0 [&:first-child]:border-t-0';
const timeOf = ts => {
  if (!ts) return '';
  const d = new Date(ts);
  return isNaN(d) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

function AgentAvatar({ agent, color, name, hidden }) {
  return (
    <span aria-hidden="true"
      className={`w-7 h-7 rounded-full ${color.avatar} text-white text-xs font-extrabold flex items-center justify-center shrink-0 ${hidden ? 'invisible' : ''}`}>
      {agent?.emoji || name?.[0] || '?'}
    </span>
  );
}

export default function ConversationFeed({
  messages, activeAgents, streamingAgent, streamingReason,
  session, project, onAutoLaunch, onPrepare, isClosed, isStreaming,
  pendingDecisionId, onAnswerDecision, onDeferDecision, onDelegateDecision,
  agentColors, deliverableTypes, decisionBudget,
  onOpenArtifact, openArtifactId, onContradict,
  prepExpanded, onTogglePrep,
}) {
  const [acknowledged, setAcknowledged] = useState(() => new Set()); // hypothèses approuvées

  function agentColor(name) {
    const idx = activeAgents.findIndex(a => a.name === name);
    return agentColors[(idx >= 0 ? idx : 0) % agentColors.length];
  }

  // ── Réunion vide : point de départ ─────────────────────────────────────────
  if (messages.length === 0 && !streamingAgent) {
    const intentionKey0 = Array.isArray(session?.intention) ? session.intention[0]
      : (() => { try { const p = JSON.parse(session?.intention || '[]'); return p[0] || 'decision'; } catch { return 'decision'; } })();
    const intentionMeta0 = deliverableTypes.find(d => d.id === intentionKey0) || deliverableTypes[0];
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-4 py-8">
        <div className="w-full max-w-md bg-white border border-line rounded-2xl p-5 space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-extrabold uppercase tracking-wider text-action">Réunion prête</p>
            <h3 className="text-lg font-extrabold text-ink leading-snug">{session?.task}</h3>
            <p className="text-[13px] text-ink-muted">{intentionMeta0.label} · {activeAgents.map(a => a.name).join(', ')}</p>
          </div>
          {!isClosed && (
            <div className="space-y-2">
              {onPrepare && activeAgents.length >= 2 && (
                <div className="space-y-1">
                  <button type="button" onClick={onPrepare} disabled={!session || !project || isStreaming}
                    className="w-full h-11 rounded-[10px] border border-ai-border text-ai font-bold text-sm hover:bg-ai-bg disabled:opacity-40">
                    Préparer avant mon arrivée
                  </button>
                  <p className="text-xs text-ink-faint text-center leading-snug">Les agents débattent entre eux sans vous. Vous arrivez sur un briefing : synthèse et décisions à trancher.</p>
                </div>
              )}
              <button type="button" onClick={onAutoLaunch} disabled={!session || !project || isStreaming}
                className="w-full h-11 rounded-[10px] bg-action text-white font-bold text-sm hover:bg-action-dark disabled:opacity-40">
                {isStreaming ? 'En cours…' : 'Démarrer les échanges'}
              </button>
              <p className="text-xs text-ink-faint text-center">ou écrivez votre premier message ci-dessous</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Préparation : débat + synthèse + ses décisions repliés en une ligne ─────
  const prepSummaryIdx = messages.findIndex(m => m.type === 'prep_summary');
  const isPrepMessage = (m, i) => m.role === 'agent' && (m.prep || (prepSummaryIdx >= 0 && i < prepSummaryIdx));
  const prepDebate = messages.filter(isPrepMessage);
  const prepSummary = prepSummaryIdx >= 0 ? messages[prepSummaryIdx] : null;
  const prepDecisions = messages.filter(m => m.type === 'decision' && m.agentName === 'Préparation');
  const preparing = isStreaming && prepDebate.length > 0 && !prepSummary;
  const isPrepItem = (m, i) => isPrepMessage(m, i) || m.type === 'prep_summary' || (m.type === 'decision' && m.agentName === 'Préparation');
  const decisionsOnly = messages.filter(m => m.type === 'decision');

  const decisionCard = (d) => (
    <DecisionCard key={d.id} message={d} number={decisionsOnly.indexOf(d) + 1} budget={decisionBudget}
      onAnswer={onAnswerDecision} onDefer={onDeferDecision} onDelegate={onDelegateDecision}
      disabled={isClosed || (!!pendingDecisionId && pendingDecisionId !== d.id)} />
  );

  const renderAgentMessage = (msg, grouped) => {
    const color = agentColor(msg.agentName);
    const agent = activeAgents.find(a => a.name === msg.agentName);
    const isHypothesis = HYPOTHESIS_RE.test(msg.content || '');
    const text = isHypothesis ? stripHypothesisPrefix(msg.content) : msg.content;
    return (
      <div key={msg.id} className={`flex gap-2.5 items-start ${grouped ? 'pt-0.5' : TURN_SEPARATOR}`}>
        <AgentAvatar agent={agent} color={color} name={msg.agentName} hidden={grouped} />
        <div className="flex-1 min-w-0">
          {!grouped && (
            <p className="text-xs text-ink-faint">
              <strong className={`font-bold ${color.text}`}>{msg.agentName}</strong>
              {agent?.role && <> · {agent.role}</>}
              {timeOf(msg.timestamp) && <> · {timeOf(msg.timestamp)}</>}
              {msg.reason && <span className="italic"> · {msg.reason}</span>}
            </p>
          )}
          <div className={`inline-block max-w-full mt-0.5 px-3 py-1.5 rounded-[12px] ${grouped ? '' : 'rounded-tl-[4px]'} text-sm leading-[1.45] text-ink-soft ${color.soft || 'bg-white ring-1 ring-line'}`}>
            {isHypothesis && (
              <span className="inline-block mr-1.5 px-1.5 rounded-md bg-muted-light text-ink-soft text-[11px] font-extrabold uppercase tracking-wider">Hypothèse</span>
            )}
            <Markdown size="bubble">
              {msg.webSearch?.sources?.length > 0 ? annotateWithCitations(text, msg.webSearch.sources) : text}
            </Markdown>
          </div>
          {isHypothesis && !isClosed && !acknowledged.has(msg.id) && (
            <div className="flex gap-4 text-[13px]">
              <button type="button" onClick={() => setAcknowledged(s => new Set(s).add(msg.id))}
                className="min-h-[32px] font-bold text-ok hover:underline">D'accord</button>
              <button type="button" onClick={() => onContradict?.(msg.agentName)}
                className="min-h-[32px] font-bold text-await hover:underline">Je contredis</button>
            </div>
          )}
          {msg.webSearch && <WebSearchBlock webSearch={msg.webSearch} />}
          {msg.artifact && (
            <button type="button" onClick={() => onOpenArtifact?.(msg)}
              className={`mt-1 w-full max-w-md flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition ${
                openArtifactId === msg.id ? 'border-ai bg-ai-light' : 'border-ai-border bg-ai-bg hover:bg-ai-light'
              }`}>
              <ImageIcon size={16} className="text-ai shrink-0" aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-bold text-ink truncate">{msg.artifact.title}</span>
                <span className="block text-[11px] text-ink-faint">{KIND_LABEL[msg.artifact.kind]}</span>
              </span>
              <span className="text-[13px] font-bold text-ai shrink-0">{openArtifactId === msg.id ? 'Ouverte' : 'Ouvrir'}</span>
            </button>
          )}
          {msg.interrupted && <p className="text-xs text-await mt-0.5">Interrompu</p>}
        </div>
      </div>
    );
  };

  const renderHuman = (msg) => (
    <div key={msg.id} className={`flex justify-end ${TURN_SEPARATOR}`}>
      <div className="max-w-[75%] space-y-1">
        {msg.attachments?.length > 0 && (
          <div className="flex gap-1.5 flex-wrap justify-end">
            {msg.attachments.map((a, i) => a.isImage && a.dataUrl ? (
              <a key={i} href={a.dataUrl} target="_blank" rel="noopener noreferrer" title={a.name}>
                <img src={a.dataUrl} alt={a.name} className="w-16 h-16 rounded-lg object-cover border border-action-border" />
              </a>
            ) : (
              <span key={i} className="text-xs bg-action-light text-action rounded-lg px-2 py-1 max-w-[160px] truncate inline-block">{a.name}</span>
            ))}
          </div>
        )}
        <p className="bg-action text-white rounded-[14px] rounded-tr-[4px] px-3 py-1.5 text-sm leading-[1.45] whitespace-pre-wrap">
          {msg.content || <span className="opacity-70 italic">fichier joint</span>}
        </p>
      </div>
    </div>
  );

  // Rendu séquentiel avec regroupement des messages consécutifs d'un même agent
  const items = [];
  let prevAgent = null;
  let prepInserted = false;
  messages.forEach((msg, i) => {
    if (isPrepItem(msg, i)) {
      if (!prepInserted) {
        prepInserted = true;
        const settledPrep = prepDecisions.filter(d => d.status === 'answered' || d.status === 'delegated').length;
        let prevDebate = null;
        items.push(
          <div key="prep-block" className="pb-1">
            <button type="button" onClick={onTogglePrep} aria-expanded={!!prepExpanded}
              className="w-full min-h-[36px] flex items-center gap-2 px-2.5 py-1.5 rounded-[10px] border border-dashed border-ai-border bg-ai-bg text-left text-[13px] font-bold text-ai">
              {preparing
                ? <span className="w-3.5 h-3.5 border-2 border-ai border-t-transparent rounded-full animate-spin shrink-0" />
                : <Sparkles size={15} className="shrink-0" aria-hidden="true" />}
              <span className="flex-1">
                {preparing
                  ? `Les agents préparent la réunion (${prepDebate.length} messages)`
                  : `Briefing · synthèse de la préparation${prepDecisions.length ? ` et ${settledPrep}/${prepDecisions.length} décisions tranchées` : ''}`}
              </span>
              <span>{prepExpanded ? 'Masquer' : 'Revoir'}</span>
            </button>
            {prepExpanded && (
              <div className="mt-2 pl-3 border-l-2 border-ai-border space-y-1">
                {prepSummary && (
                  <div className="bg-ai-bg border border-ai-border rounded-xl px-4 py-3">
                    <Markdown size="synthesis">{prepSummary.content}</Markdown>
                  </div>
                )}
                {prepDecisions.map(decisionCard)}
                {prepDebate.map(m => { const g = prevDebate === m.agentName; prevDebate = m.agentName; return renderAgentMessage(m, g); })}
              </div>
            )}
          </div>
        );
      }
      prevAgent = null;
      return;
    }
    if (msg.role === 'system' && msg.type === 'decision') {
      items.push(decisionCard(msg));
      prevAgent = null;
      return;
    }
    // Réponses aux questions (decision_answer) : messages techniques pour les
    // agents, déjà visibles sur la carte de question et dans « Tranché ici »
    if (msg.role === 'system' && msg.type === 'decision_answer') return;
    if (msg.role === 'system') {
      items.push(<p key={msg.id} className="text-center text-xs text-ink-faint py-1">{msg.content}</p>);
      prevAgent = null;
      return;
    }
    if (msg.role === 'human') {
      items.push(renderHuman(msg));
      prevAgent = null;
      return;
    }
    if (msg.role === 'agent') {
      items.push(renderAgentMessage(msg, prevAgent === msg.agentName));
      prevAgent = msg.agentName;
    }
  });

  const showTyping = streamingAgent && (!preparing || streamingAgent === 'BlabIA');

  return (
    <div className="max-w-[820px] mx-auto px-4 py-2.5 flex flex-col">
      {items}
      {showTyping && (
        <div className="flex gap-2.5 items-center pt-2.5 text-[13px] text-ink-faint">
          <AgentAvatar agent={activeAgents.find(a => a.name === streamingAgent)} color={agentColor(streamingAgent)} name={streamingAgent} />
          <span><strong className="text-ink-soft">{streamingAgent}</strong> écrit…{streamingReason && <span className="italic"> ({streamingReason})</span>}</span>
        </div>
      )}
    </div>
  );
}
