import { useEffect, useRef, useState } from 'react';
import { Plus, X, Image as ImageIcon, Check, Sparkles, Lightbulb, Users, CircleHelp, CheckCheck } from 'lucide-react';
import DecisionCard from '../DecisionCard';
import AgentScopeSelector from './AgentScopeSelector';
import MeetingSuggestionCard from './MeetingSuggestionCard';
import { costLabel } from '../../utils/toolsCatalog';

// Panneau latéral repliable de la réunion (refonte UX v5.1) :
// questions en attente, tranché ici, suggestions (style unique), équipe, illustrations.

const KIND_LABEL = { mermaid: 'Schéma', html: 'Maquette', svg: 'Visuel' };

const TONES = {
  ok:     'bg-ok-light text-ok',
  await:  'bg-await-light text-await',
  action: 'bg-action-light text-action',
  ai:     'bg-ai-light text-ai',
};

function PanelSection({ icon: Icon, tone, title, count, children, sectionRef }) {
  return (
    <section ref={sectionRef} className="bg-white border border-line rounded-xl p-3 space-y-2 shadow-card">
      <h2 className="flex items-center gap-2 text-[13px] font-extrabold text-ink">
        <span className={`w-6 h-6 rounded-lg inline-flex items-center justify-center ${TONES[tone]}`} aria-hidden="true"><Icon size={14} /></span>
        <span className="flex-1">{title}</span>
        {count !== undefined && <span className="text-xs font-bold text-ink-faint">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

function SuggestionShell({ kind, title, detail, children }) {
  return (
    <div className="border border-line rounded-[10px] px-2.5 py-2 space-y-0.5">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink-faint">{kind}</p>
      <p className="text-[13px] font-bold text-ink">{title}</p>
      {detail && <p className="text-xs text-ink-muted leading-snug">{detail}</p>}
      {children}
    </div>
  );
}

function AgentSuggestion({ suggestion, idx, onInvite, onDismiss, onCreateAndInvite }) {
  const [form, setForm] = useState(suggestion.createForm || { name: suggestion.name, role: suggestion.role, systemPrompt: '' });
  const [scope, setScope] = useState('project');
  if (suggestion.invited) return null;
  return (
    <SuggestionShell kind="Agent à inviter" title={suggestion.name} detail={[suggestion.role, suggestion.reason].filter(Boolean).join(' · ')}>
      {suggestion.showCreate ? (
        <div className="space-y-1.5 pt-1">
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nom" aria-label="Nom de l'agent"
            className="w-full h-8 text-xs border border-line rounded-lg px-2 outline-none focus:ring-2 focus:ring-action-border" />
          <input value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} placeholder="Rôle" aria-label="Rôle de l'agent"
            className="w-full h-8 text-xs border border-line rounded-lg px-2 outline-none focus:ring-2 focus:ring-action-border" />
          <AgentScopeSelector scope={scope} onChange={setScope} size="xs" />
          <div className="flex gap-3 text-[13px]">
            <button type="button" onClick={() => onCreateAndInvite(idx, form, scope)} disabled={!form.name.trim() || suggestion.inviting}
              className="min-h-[32px] font-bold text-action disabled:opacity-40">{suggestion.inviting ? 'Création…' : 'Créer et inviter'}</button>
            <button type="button" onClick={() => onDismiss(idx)} className="min-h-[32px] font-semibold text-ink-muted">Annuler</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 text-[13px]">
          <button type="button" onClick={() => onInvite(idx)} disabled={suggestion.inviting} className="min-h-[32px] font-bold text-action disabled:opacity-40">
            {suggestion.inviting ? 'Invitation…' : 'Inviter'}
          </button>
          <button type="button" onClick={() => onDismiss(idx)} className="min-h-[32px] font-semibold text-ink-muted">Écarter</button>
        </div>
      )}
    </SuggestionShell>
  );
}

function AgentAddMenu({ loadingAvailable, availableForAdd, addingAgentId, handleAddAgent,
  dropdownCreateForm, setDropdownCreateForm, handleDropdownCreateAgent, onOpen }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => { if (!open) onOpen?.(); setOpen(o => !o); }}
        className="min-h-[32px] inline-flex items-center gap-1 text-[13px] font-bold text-action">
        <Plus size={14} /> Ajouter un agent
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-line rounded-xl shadow-lg z-20 overflow-hidden">
          {loadingAvailable ? (
            <div className="flex justify-center py-4"><span className="w-4 h-4 border-2 border-action border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <>
              {availableForAdd.length === 0 ? (
                <p className="text-xs text-ink-faint text-center py-3 px-3">Tous les agents du projet sont déjà là.</p>
              ) : (
                <ul className="py-1 max-h-48 overflow-y-auto">
                  {availableForAdd.map(a => {
                    const id = a.agentId || a.id;
                    return (
                      <li key={id}>
                        <button type="button" onClick={() => handleAddAgent(id)} disabled={addingAgentId === id}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-canvas text-left disabled:opacity-50">
                          <span className="w-6 h-6 rounded-full bg-muted-light text-xs flex items-center justify-center shrink-0">{a.emoji || a.name?.[0] || '?'}</span>
                          <span className="min-w-0">
                            <span className="block text-[13px] font-semibold text-ink truncate">{a.name}</span>
                            <span className="block text-[11px] text-ink-faint truncate">{a.role}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="border-t border-line">
                {dropdownCreateForm.open ? (
                  <div className="p-2 space-y-1.5">
                    <input autoFocus value={dropdownCreateForm.name} placeholder="Nom de l'agent" aria-label="Nom de l'agent"
                      onChange={e => setDropdownCreateForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full h-8 text-xs border border-line rounded-lg px-2 outline-none focus:ring-2 focus:ring-action-border" />
                    <input value={dropdownCreateForm.role} placeholder="Rôle" aria-label="Rôle de l'agent"
                      onChange={e => setDropdownCreateForm(p => ({ ...p, role: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') handleDropdownCreateAgent(); }}
                      className="w-full h-8 text-xs border border-line rounded-lg px-2 outline-none focus:ring-2 focus:ring-action-border" />
                    {dropdownCreateForm.error && <p className="text-[11px] text-red-600">{dropdownCreateForm.error}</p>}
                    <AgentScopeSelector scope={dropdownCreateForm.scope} onChange={scope => setDropdownCreateForm(p => ({ ...p, scope }))} size="xs" />
                    <div className="flex gap-3 text-[13px]">
                      <button type="button" onClick={handleDropdownCreateAgent}
                        disabled={!dropdownCreateForm.name.trim() || !dropdownCreateForm.role.trim() || dropdownCreateForm.creating}
                        className="min-h-[32px] font-bold text-action disabled:opacity-40">{dropdownCreateForm.creating ? '…' : 'Créer et inviter'}</button>
                      <button type="button" onClick={() => setDropdownCreateForm({ open: false, name: '', role: '', creating: false, error: '', scope: 'project' })}
                        className="min-h-[32px] font-semibold text-ink-muted">Annuler</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setDropdownCreateForm(p => ({ ...p, open: true }))}
                    className="w-full text-xs font-semibold text-ink-muted hover:text-action hover:bg-canvas py-2 px-3 text-left">
                    + Créer un agent…
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function MeetingSidePanel({
  isClosed, decisions, decisionBudget, onAnswerDecision, onDeferDecision, onDelegateDecision,
  meetingSuggestions, onKeepMeeting, onDiscardMeeting, onSaveMeeting, meetingSuggestionBusyId, meetingRefs,
  agentSuggestions, onInviteSuggested, onDismissSuggestion, onCreateAndInvite,
  toolSuggestions,
  activeAgents, agentColors, agentAddProps, onOpenAgentAdd,
  artifacts, onOpenArtifact,
  questionsRef,
}) {
  const waiting  = decisions.filter(d => d.status === 'deferred');
  const settled  = decisions.filter(d => d.status === 'answered' || d.status === 'delegated');
  const pendingMeetings = (meetingSuggestions || []).filter(s => s.status !== 'discarded');
  const pendingAgents   = (agentSuggestions || []).map((s, idx) => ({ s, idx })).filter(({ s }) => !s.dismissed && !s.invited);
  const suggestionCount = pendingMeetings.filter(s => s.status === 'pending').length + pendingAgents.length + (toolSuggestions?.length || 0);
  const numberOf = d => decisions.indexOf(d) + 1;

  return (
    <aside aria-label="Panneau de la réunion" className="w-[292px] shrink-0 border-l border-line bg-canvas-deep overflow-y-auto p-3 space-y-3">

      {waiting.length > 0 && (
        <PanelSection sectionRef={questionsRef} icon={CircleHelp} tone="await" title="Questions reportées" count={waiting.length}>
          {waiting.map(d => (
            <div key={d.id} className="-ml-[38px]">
              <DecisionCard message={{ ...d, status: 'pending' }} number={numberOf(d)} budget={decisionBudget}
                disabled={isClosed} onAnswer={onAnswerDecision} onDefer={onDeferDecision} onDelegate={onDelegateDecision} />
            </div>
          ))}
        </PanelSection>
      )}

      <PanelSection sectionRef={waiting.length ? undefined : questionsRef} icon={CheckCheck} tone="ok" title="Tranché ici" count={settled.length}>
        {settled.length === 0 && <p className="text-xs text-ink-faint">Rien pour l'instant. Proposé au registre à la conclusion.</p>}
        <ul className="space-y-2">
          {settled.map(d => (
            <li key={d.id} className="text-[13px] leading-snug">
              <p className="text-ink-muted">{d.question}</p>
              {d.status === 'answered' ? (
                <p className="mt-0.5 inline-flex items-start gap-1 font-bold text-ok"><Check size={13} className="mt-0.5 shrink-0" aria-hidden="true" />{d.answer}</p>
              ) : (
                <p className="mt-0.5 inline-flex items-center gap-1 font-bold text-ai"><Sparkles size={13} aria-hidden="true" />Les agents décident</p>
              )}
            </li>
          ))}
        </ul>
      </PanelSection>

      <PanelSection icon={Lightbulb} tone="await" title="Suggestions" count={suggestionCount}>
        {suggestionCount === 0 && pendingMeetings.length === 0 && <p className="text-xs text-ink-faint">Aucune pour l'instant.</p>}
        {pendingMeetings.map(s => (
          <div key={s.id} className="-mx-4">
            <MeetingSuggestionCard suggestion={s} busy={meetingSuggestionBusyId === s.id}
              onKeep={onKeepMeeting} onDiscard={onDiscardMeeting} onSave={onSaveMeeting} meetingRefs={meetingRefs} />
          </div>
        ))}
        {pendingAgents.map(({ s, idx }) => (
          <AgentSuggestion key={`a${idx}`} suggestion={s} idx={idx}
            onInvite={onInviteSuggested} onDismiss={onDismissSuggestion} onCreateAndInvite={onCreateAndInvite} />
        ))}
        {(toolSuggestions || []).map(t => (
          <SuggestionShell key={t.id} kind="Outil · à valider à la conclusion" title={t.name}
            detail={[t.need, costLabel(t.cost), t.priceSource ? null : 'prix indicatif'].filter(Boolean).join(' · ')}>
            {t.priceSource && <a href={t.priceSource} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold">Source du prix</a>}
          </SuggestionShell>
        ))}
      </PanelSection>

      {artifacts.length > 0 && (
        <PanelSection icon={ImageIcon} tone="ai" title="Illustrations" count={artifacts.length}>
          {artifacts.map(m => (
            <button key={m.id} type="button" onClick={() => onOpenArtifact(m)}
              className="w-full min-h-[36px] flex items-center gap-2 text-left text-[13px] rounded-lg px-1.5 hover:bg-canvas">
              <ImageIcon size={14} className="text-ai shrink-0" aria-hidden="true" />
              <span className="flex-1 truncate font-semibold text-ink">{m.artifact.title}</span>
              <span className="text-[11px] text-ink-faint shrink-0">{KIND_LABEL[m.artifact.kind]}</span>
            </button>
          ))}
        </PanelSection>
      )}

      <PanelSection icon={Users} tone="action" title="Équipe" count={activeAgents.length}>
        {activeAgents.map((a, i) => {
          const c = agentColors[i % agentColors.length];
          return (
            <div key={a.id || a.name} className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full ${c.avatar} text-white text-xs flex items-center justify-center shrink-0`}>{a.emoji || a.name?.[0]}</span>
              <span className="text-[13px] min-w-0 truncate"><strong className="font-extrabold">{a.name}</strong> · {a.role}</span>
            </div>
          );
        })}
        {!isClosed && <AgentAddMenu {...agentAddProps} onOpen={onOpenAgentAdd} />}
      </PanelSection>
    </aside>
  );
}

// Zone « Illustration » : remplace le panneau quand une illustration est ouverte
export function IllustrationPanel({ message, onClose, children }) {
  return (
    <aside aria-label={`Illustration : ${message.artifact.title}`}
      className="w-[46%] min-w-[320px] max-w-[720px] shrink-0 border-l border-line bg-white flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-line">
        <ImageIcon size={16} className="text-ai" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold text-ink truncate">{message.artifact.title}</p>
          <p className="text-[11px] text-ink-faint">{KIND_LABEL[message.artifact.kind]} · par {message.agentName}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer l'illustration" title="Fermer"
          className="w-11 h-11 inline-flex items-center justify-center rounded-[10px] text-ink-muted hover:bg-muted-light">
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">{children}</div>
    </aside>
  );
}
