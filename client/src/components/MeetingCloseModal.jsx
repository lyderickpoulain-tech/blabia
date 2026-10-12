import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import SummaryDisplayModal from './SummaryDisplayModal';
import MeetingSuggestionCard from './meeting/MeetingSuggestionCard';
import MeetingPlanModal, { buildMergedPlan } from './meeting/MeetingPlanModal';
import { costLabel } from '../utils/toolsCatalog';
import { Flag, X, Check, RotateCcw, FileText, Maximize2, Code2, Copy, ScrollText, ListChecks, ShieldAlert, Wrench, Lightbulb, ListOrdered, Ban, ArrowRight, ArrowLeft, CalendarPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, IconButton, Badge, SectionLabel } from './ui';
import { notifyError, notifySuccess } from '../utils/notify';

// v5.0 phase 3.3 : bouton unique "Conclure la réunion" — génération automatique
// à l'ouverture, puis assistant en 3 étapes : relecture CR + livrable → revue
// des réunions suggérées → validation (statut accepté, CR en mémoire, livrable enregistré).
export default function MeetingCloseModal({ session, initialSuggestions, meetingRefs, initialToolSuggestions, projectId, onClose, onClosed }) {
  const [step, setStep] = useState('generating');
  const [meetingType, setMeetingType] = useState(null);
  const [summary, setSummary]         = useState('');
  const [deliverable, setDeliverable] = useState(null);
  const [genError, setGenError]       = useState('');
  const [copied, setCopied]           = useState(false);
  const [showFullContent, setShowFullContent] = useState(false);

  const [suggestions, setSuggestions] = useState(
    Array.isArray(initialSuggestions) ? initialSuggestions
      : (Array.isArray(session.pendingMeetingSuggestions) ? session.pendingMeetingSuggestions : [])
  );
  const [suggestionBusyId, setSuggestionBusyId] = useState(null);
  // Réunion stack : outils proposés + décision par outil { [id]: 'validated' | 'refused' }
  const [toolSuggestions, setToolSuggestions] = useState(Array.isArray(initialToolSuggestions) ? initialToolSuggestions : []);
  const [toolDecisions, setToolDecisions]     = useState({});
  // Registre des décisions : proposées par BlabIA, inscrites seulement si gardées
  // (null = extraction indisponible)
  const [decisionProposals, setDecisionProposals] = useState([]);
  const decisionsSavedRef = useRef(false);
  // Actions entre les réunions : proposées par BlabIA, créées seulement si gardées
  const [actionProposals, setActionProposals] = useState([]);
  const actionsSavedRef = useRef(false);
  const updateAction = (key, patch) => setActionProposals(prev => prev.map(a => a.key === key ? { ...a, ...patch } : a));
  // Ce qui n'est pas une action (v5.1) : réunions proposées (décisions à prendre, code),
  // outils à mettre en place (page Outils), outils manquants pour le développement
  const [meetingProposals, setMeetingProposals] = useState([]);
  const meetingsSavedRef = useRef(false);
  const updateMeeting = (key, patch) => setMeetingProposals(prev => prev.map(m => m.key === key ? { ...m, ...patch } : m));
  const [toolSetups, setToolSetups] = useState([]);
  const [devMissingTools, setDevMissingTools] = useState([]);
  const updateProposal = (key, patch) => setDecisionProposals(prev => prev.map(d => d.key === key ? { ...d, ...patch } : d));
  const [showPlan, setShowPlan] = useState(false);
  // Développement depuis BlabIA (v5.1) : lancé à la conclusion si le dépôt du projet est prêt
  const [devReady, setDevReady]   = useState(false);
  const [launchDev, setLaunchDev] = useState(true);
  useEffect(() => {
    if (meetingType !== 'claude_code') return;
    api.get(`/projects/${projectId}/github`)
      .then(({ data }) => setDevReady(!!(data.ready && data.isOwner)))
      .catch(() => {}); // facultatif : sans dépôt prêt, on garde « Copier »
  }, [meetingType, projectId]);

  const [applying,       setApplying]       = useState(false);
  const [applyError,     setApplyError]     = useState('');
  const [abandonConfirm, setAbandonConfirm] = useState(false);
  const [abandoning,     setAbandoning]     = useState(false);

  useEffect(() => { generate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async () => {
    setStep('generating');
    setGenError('');
    try {
      const { data } = await api.post(`/projects/${projectId}/sessions/${session.id}/generate-deliverable`, {});
      setMeetingType(data.meetingType);
      setSummary(data.summary || '');
      setDeliverable(data.deliverable || null);
      if (Array.isArray(data.toolSuggestions)) setToolSuggestions(data.toolSuggestions);
      setDecisionProposals(Array.isArray(data.decisionProposals)
        ? data.decisionProposals.map((d, i) => ({ ...d, key: i, keep: true, replaceKeep: !!d.replaces }))
        : null);
      setActionProposals(Array.isArray(data.actionProposals)
        ? data.actionProposals.map((a, i) => ({ ...a, key: i, keep: true }))
        : null);
      setMeetingProposals((data.meetingProposals || []).map(m => ({ ...m, keep: true })));
      setToolSetups(data.toolSetups || []);
      setDevMissingTools(data.devMissingTools || []);
      if ((data.devMissingTools || []).length) setLaunchDev(false); // lancé depuis Développements une fois les outils prêts
      setStep('review');
    } catch (err) {
      setGenError(err.response?.data?.error || 'Erreur lors de la génération du compte-rendu');
      setStep('review');
    }
  };

  const handleCopyDeliverable = () => {
    navigator.clipboard.writeText(deliverable || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Suggestions de réunions (3.4) ─────────────────────────────────────────
  const pendingSuggestions = suggestions.filter(s => s.status === 'pending');
  const keptSuggestions    = suggestions.filter(s => s.status === 'kept');

  const patchSuggestion = async (id, body) => {
    setSuggestionBusyId(id);
    try {
      const { data } = await api.patch(`/projects/${projectId}/sessions/${session.id}/meeting-suggestions/${id}`, body);
      setSuggestions(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
    } catch (err) { notifyError(err, 'La suggestion de réunion n’a pas pu être mise à jour.'); }
    setSuggestionBusyId(null);
  };
  const handleKeepSuggestion    = (id) => patchSuggestion(id, { status: 'kept' });
  const handleDiscardSuggestion = (id) => patchSuggestion(id, { status: 'discarded' });
  const handleSaveSuggestion    = (id, fields) => patchSuggestion(id, fields);

  // ── Validation finale ──────────────────────────────────────────────────────
  const handleApply = async () => {
    if (applying) return;
    setApplying(true);
    setApplyError('');
    try {
      await api.patch(`/projects/${projectId}/sessions/${session.id}`, {
        summary,
        ...(meetingType === 'claude_code' ? { deliverable } : {}),
      });

      // Registre des décisions : seulement celles gardées par l'humain
      // (une seule fois : si une étape suivante échoue, un nouveau clic ne les réinscrit pas)
      const kept = (decisionProposals || []).filter(d => d.keep && d.statement.trim());
      if (kept.length > 0 && !decisionsSavedRef.current) {
        await api.post(`/projects/${projectId}/decisions/from-session`, {
          sessionId: session.id,
          decisions: kept.map(({ statement, rationale, rejectedOptions, origin, replaces, replaceKeep }) => ({
            statement, rationale, rejectedOptions, origin, ...(replaces && replaceKeep ? { replaces } : {}),
          })),
        });
        decisionsSavedRef.current = true;
      }

      // Actions entre les réunions : seulement celles gardées (une seule fois)
      const keptActions = (actionProposals || []).filter(a => a.keep && a.title.trim());
      if (keptActions.length > 0 && !actionsSavedRef.current) {
        await api.post(`/projects/${projectId}/actions/from-session`, {
          sessionId: session.id,
          actions: keptActions.map(({ title, description, dueDate }) => ({ title, description, dueDate })),
        });
        actionsSavedRef.current = true;
      }

      // Réunions proposées (décisions à prendre, travail de code) : ajoutées au plan (une seule fois)
      const keptMeetings = meetingProposals.filter(m => m.keep && m.title.trim());
      if (keptMeetings.length > 0 && !meetingsSavedRef.current) {
        for (const m of keptMeetings) {
          await api.post(`/projects/${projectId}/milestones`, { title: m.title.trim(), description: m.description, type: m.type });
        }
        meetingsSavedRef.current = true;
      }

      // Réunion stack : outils reportés dans les outils du projet avec la décision prise
      if (meetingType === 'stack' && toolSuggestions.length > 0) {
        await api.post(`/projects/${projectId}/sessions/${session.id}/tools/apply`, {
          decisions: Object.entries(toolDecisions).map(([id, status]) => ({ id, status })),
        });
      }

      // Suggestions gardées pas encore matérialisées → ajoutées au plan à leur
      // position "after". État relu côté serveur : celles déjà ajoutées via
      // "Voir le plan des réunions" portent un milestoneId et sont ignorées.
      const [{ data: fresh }, { data: plan }] = await Promise.all([
        api.get(`/projects/${projectId}/sessions/${session.id}`),
        api.get(`/projects/${projectId}/plan`),
      ]);
      const toAdd = (fresh.pendingMeetingSuggestions || []).filter(s => s.status === 'kept' && !s.milestoneId);
      if (toAdd.length > 0) {
        const order = buildMergedPlan(plan.milestones || [], toAdd)
          .map(it => it.kind === 'milestone' ? { milestoneId: it.key } : { suggestionId: it.key });
        await api.post(`/projects/${projectId}/sessions/${session.id}/meeting-plan/validate`, { order });
      }

      await api.patch(`/projects/${projectId}/sessions/${session.id}/status`, { status: 'accepted' });
      if (meetingType === 'claude_code' && devReady && launchDev && deliverable?.trim()) {
        // La réunion est conclue même si le lancement échoue : il reste possible depuis Projet › Développements
        try {
          await api.post(`/projects/${projectId}/dev-tasks`, { sessionId: session.id });
          notifySuccess('Développement lancé : suivez-le dans Projet › Développements.');
        } catch (err) {
          notifyError(err, err.response?.data?.missingTools
            ? 'Développement non lancé : des outils sont à mettre en place (Projet › Outils), puis lancez-le depuis Projet › Développements.'
            : 'Le développement n’a pas pu être lancé : relancez-le depuis Projet › Développements.');
        }
      }
      onClosed?.('accepted');
    } catch (err) {
      setApplyError(err.response?.data?.error || 'Erreur lors de la validation');
      setApplying(false);
    }
  };

  const handleAbandon = async () => {
    if (abandoning) return;
    setAbandoning(true);
    try {
      await api.patch(`/projects/${projectId}/sessions/${session.id}/status`, { status: 'abandoned' });
      onClosed?.('abandoned');
    } catch {
      setAbandoning(false);
    }
  };

  const decisionMessages = (Array.isArray(session.messages) ? session.messages : []).filter(m => m.type === 'decision');
  const deferred = decisionMessages.filter(m => m.status === 'deferred' || m.status === 'pending');
  const answered = decisionMessages.filter(m => m.status === 'answered');

  return (
    <>
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="close-title"
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* En-tête */}
        <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-line shrink-0">
          <span className="w-10 h-10 rounded-xl bg-ok-light text-ok inline-flex items-center justify-center shrink-0">
            <Flag size={20} aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 id="close-title" className="text-lg font-extrabold text-ink">Conclure la réunion</h2>
            <p className="text-xs text-ink-muted truncate">{session.task}</p>
          </div>
          <IconButton label="Fermer" size="sm" onClick={onClose}><X size={18} aria-hidden="true" /></IconButton>
        </div>

        {/* Fil des étapes */}
        <ol className="flex items-center gap-2 px-5 py-2.5 border-b border-line shrink-0 text-xs">
          {[['review', 'Relecture'], ['suggestions', 'Suite du plan']].map(([key, label], i) => {
            const active = step === key || (key === 'review' && step === 'generating');
            const done   = key === 'review' && step === 'suggestions';
            return (
              <li key={key} className="flex items-center gap-2">
                {i > 0 && <span className="w-6 h-px bg-line" aria-hidden="true" />}
                <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[11px] font-extrabold ${
                  done ? 'bg-ok text-white' : active ? 'bg-action text-white' : 'bg-muted-light text-ink-muted'
                }`}>
                  {done ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : i + 1}
                </span>
                <span className={active ? 'font-extrabold text-ink' : 'font-semibold text-ink-muted'}>{label}</span>
              </li>
            );
          })}
        </ol>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {step === 'generating' && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="w-8 h-8 border-2 border-ai border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-bold text-ai">BlabIA rédige le compte-rendu{meetingType === 'claude_code' ? ' et le prompt' : ''}…</p>
              <p className="text-xs text-ink-faint">Il identifie aussi les décisions à inscrire au registre.</p>
            </div>
          )}

          {genError && (
            <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
              <p className="text-sm text-red-700">{genError}</p>
              <Button size="sm" variant="danger" onClick={generate}><RotateCcw size={14} aria-hidden="true" /> Réessayer</Button>
            </div>
          )}

          {step === 'review' && !genError && (
            <>
              {/* Arbitrages de la réunion */}
              {decisionMessages.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {answered.length > 0 && (
                    <div className="rounded-xl border border-ok-border bg-ok-light/50 p-3.5">
                      <SectionLabel className="!text-ok mb-2">Actées · {answered.length}</SectionLabel>
                      <ul className="space-y-1.5">
                        {answered.map((m, i) => (
                          <li key={m.id || i} className="text-sm text-ink-soft leading-snug">
                            {m.question}
                            {m.answer && <span className="font-extrabold text-ok"> → {m.answer}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {deferred.length > 0 && (
                    <div className="rounded-xl border border-await-border bg-await-bg p-3.5">
                      <SectionLabel className="!text-await mb-2">Restent à trancher · {deferred.length}</SectionLabel>
                      <ul className="space-y-1.5">
                        {deferred.map((m, i) => (
                          <li key={m.id || i} className="text-sm text-ink-soft leading-snug">{m.question}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Compte-rendu (éditable) */}
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold text-ink">
                    <FileText size={16} className="text-ai" aria-hidden="true" /> Compte-rendu
                    <Badge tone="ai">Rédigé par BlabIA</Badge>
                  </h3>
                  <Button size="sm" variant="ghost" onClick={() => setShowFullContent(true)}>
                    <Maximize2 size={14} aria-hidden="true" /> Plein écran
                  </Button>
                </div>
                <textarea
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  rows={8}
                  aria-label="Compte-rendu"
                  className="w-full px-3.5 py-3 border border-ai-border bg-ai-bg rounded-xl text-sm outline-none focus:ring-2 focus:ring-ai resize-y text-ink-soft leading-relaxed"
                />
                <p className="text-[11px] text-ink-faint">Modifiable : c'est ce texte qui sera mémorisé dans le projet.</p>
              </section>

              {/* Livrable claude_code (éditable) */}
              {meetingType === 'claude_code' && deliverable !== null && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-extrabold text-ink">
                      <Code2 size={16} className="text-ai" aria-hidden="true" /> Prompt Claude Code
                    </h3>
                    <Button size="sm" variant={copied ? 'secondary' : 'primary'} onClick={handleCopyDeliverable}>
                      {copied ? <><Check size={14} aria-hidden="true" /> Copié</> : <><Copy size={14} aria-hidden="true" /> Copier</>}
                    </Button>
                  </div>
                  <textarea
                    value={deliverable}
                    onChange={e => setDeliverable(e.target.value)}
                    rows={8}
                    aria-label="Prompt Claude Code"
                    className="w-full px-3.5 py-3 bg-ink text-green-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-action resize-y leading-relaxed"
                  />
                  {devMissingTools.length > 0 && (
                    <div className="text-xs bg-await-bg border border-await-border rounded-[10px] px-3 py-2 space-y-1">
                      <p className="font-extrabold text-await">Ce développement se sert d’outils qui ne sont pas prêts :</p>
                      <ul className="list-disc ml-4 text-ink-soft">
                        {devMissingTools.map(m => <li key={m.category}>{m.reason === 'not_chosen' ? <>{m.label} : aucun outil choisi</> : <><strong>{m.tool}</strong> ({m.label}) : pas encore mis en place</>}</li>)}
                      </ul>
                      <p className="text-ink-muted">Il ne sera pas lancé automatiquement. Mettez ces outils en place (<Link className="underline" to={`/projects/${projectId}/outils`}>Projet › Outils</Link>, avec le guide), puis lancez-le depuis Projet › Développements.</p>
                    </div>
                  )}
                  {devReady && devMissingTools.length === 0 && (
                    <label className="flex items-start gap-2 text-sm text-ink-soft cursor-pointer">
                      <input type="checkbox" checked={launchDev} onChange={e => setLaunchDev(e.target.checked)} className="mt-0.5 w-4 h-4 accent-action" />
                      <span><strong>Lancer le développement dès la conclusion</strong> : Claude Code réalise ce prompt dans le dépôt GitHub du projet. Rien n’est mis en ligne sans votre accord (Projet › Développements).</span>
                    </label>
                  )}
                </section>
              )}

              {/* Registre des décisions du projet */}
              <section className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-extrabold text-ink">
                  <ScrollText size={16} className="text-action" aria-hidden="true" /> Décisions à inscrire au registre
                </h3>
                {decisionProposals === null ? (
                  <p className="text-xs text-await bg-await-bg border border-await-border rounded-[10px] px-3 py-2">
                    L'extraction des décisions n'a pas abouti. Vous pourrez les ajouter à la main dans le registre du projet.
                  </p>
                ) : decisionProposals.length === 0 ? (
                  <p className="text-xs text-ink-faint">Aucune décision tranchée identifiée dans cette réunion.</p>
                ) : (
                  <>
                    <p className="text-xs text-ink-muted">Les agents s'y référeront aux prochaines réunions et ne reposeront plus ces questions. Décochez ce qui n'a pas vraiment été décidé.</p>
                    <ul className="space-y-1.5">
                      {decisionProposals.map(d => (
                        <li key={d.key} className={`flex items-start gap-2.5 border rounded-xl p-2.5 transition ${
                          d.keep ? 'border-line bg-white' : 'border-line bg-canvas opacity-60'
                        }`}>
                          <input type="checkbox" checked={d.keep} aria-label="Inscrire cette décision"
                            onChange={e => updateProposal(d.key, { keep: e.target.checked })} className="mt-1.5 w-4 h-4 accent-action shrink-0" />
                          <div className="flex-1 min-w-0 space-y-1">
                            <input
                              value={d.statement}
                              onChange={e => updateProposal(d.key, { statement: e.target.value })}
                              disabled={!d.keep}
                              aria-label="Énoncé de la décision"
                              className="w-full text-sm font-semibold text-ink border border-transparent hover:border-line focus:border-action-border rounded-md px-1.5 py-0.5 outline-none bg-transparent"
                            />
                            <div className="flex items-center gap-2 flex-wrap px-1.5">
                              <Badge tone={d.origin === 'human' ? 'action' : 'ai'} className="!text-[10px] !px-2 !py-0.5">
                                {d.origin === 'human' ? 'Votre arbitrage' : 'Hypothèse des agents'}
                              </Badge>
                              {d.rationale && <span className="text-[11px] text-ink-muted">{d.rationale}</span>}
                            </div>
                            {d.rejectedOptions?.length > 0 && (
                              <p className="text-[11px] text-ink-faint px-1.5">Écarté : {d.rejectedOptions.join(', ')}</p>
                            )}
                            {d.replaces && (
                              <label className="flex items-start gap-2 text-xs text-ink-soft bg-action-light border border-action-border rounded-lg px-2 py-1.5 mx-1.5 cursor-pointer">
                                <input type="checkbox" checked={d.replaceKeep} disabled={!d.keep} onChange={e => updateProposal(d.key, { replaceKeep: e.target.checked })} className="mt-0.5 w-3.5 h-3.5 accent-action shrink-0" />
                                <span><strong>Remplace la décision remise en question :</strong> « {d.replacesStatement} » (elle passera « remplacée »)</span>
                              </label>
                            )}
                            {d.vigilance && (
                              <p className="text-xs text-await bg-await-bg border border-await-border rounded-lg px-2 py-1.5 mx-1.5 flex items-start gap-1.5">
                                <ShieldAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                                <span><strong>Contradicteur :</strong> {d.vigilance}</span>
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              {/* Actions d'ici la prochaine réunion (v5.1) */}
              <section className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-extrabold text-ink">
                  <ListChecks size={16} className="text-action" aria-hidden="true" /> Actions d'ici la prochaine réunion
                </h3>
                {actionProposals === null ? (
                  <p className="text-xs text-await bg-await-bg border border-await-border rounded-[10px] px-3 py-2">
                    Les actions n'ont pas pu être proposées. Vous pourrez les ajouter dans Projet › Actions.
                  </p>
                ) : actionProposals.length === 0 ? (
                  <p className="text-xs text-ink-faint">Aucune action concrète identifiée pour vous dans cette réunion.</p>
                ) : (
                  <>
                    <p className="text-xs text-ink-muted">Ce que vous avez à faire avant la prochaine réunion, dans l'ordre où les mener. L'échéance est facultative. Les agents feront le point dessus en l'ouvrant. Décochez ce qui ne vous concerne pas.</p>
                    <ul className="space-y-1.5">
                      {actionProposals.map((a, i) => (
                        <li key={a.key} className={`flex items-start gap-2.5 border rounded-xl p-2.5 transition ${a.keep ? 'border-line bg-white' : 'border-line bg-canvas opacity-60'}`}>
                          <span className="mt-1.5 w-5 h-5 rounded-full bg-action-light text-action text-[11px] font-extrabold inline-flex items-center justify-center shrink-0" aria-hidden="true">{i + 1}</span>
                          <input type="checkbox" checked={a.keep} aria-label="Garder cette action"
                            onChange={e => updateAction(a.key, { keep: e.target.checked })} className="mt-2 w-4 h-4 accent-action shrink-0" />
                          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                            <input value={a.title} onChange={e => updateAction(a.key, { title: e.target.value })} disabled={!a.keep}
                              aria-label="Action" className="flex-1 min-w-[180px] text-sm font-semibold text-ink border border-transparent hover:border-line focus:border-action-border rounded-md px-1.5 py-1 outline-none bg-transparent" />
                            <input type="date" value={a.dueDate || ''} onChange={e => updateAction(a.key, { dueDate: e.target.value || null })} disabled={!a.keep}
                              aria-label="Échéance (facultative)" title="Échéance facultative" className="text-xs text-ink-soft border border-line rounded-md px-2 h-8 outline-none bg-white" />
                            {a.description && <p className="basis-full text-[11px] text-ink-muted px-1.5">{a.description}</p>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              {/* Outils à mettre en place : relèvent de la page Outils, pas des actions (v5.1) */}
              {toolSetups.length > 0 && (
                <section className="space-y-1.5">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold text-ink">
                    <Wrench size={16} className="text-action" aria-hidden="true" /> Outils à mettre en place
                  </h3>
                  <ul className="text-xs text-ink-soft space-y-0.5">
                    {toolSetups.map(t => <li key={t.tool}>• <strong>{t.tool}</strong> : {t.status === 'not_chosen' ? 'pas encore choisi dans les outils du projet' : 'retenu, à mettre en place'}</li>)}
                  </ul>
                  <p className="text-xs text-ink-muted">Ce ne sont pas des actions : créez les comptes et branchez-les depuis <Link className="underline" to={`/projects/${projectId}/outils`}>Projet › Outils</Link> (guide de mise en place), puis cochez « Mis en place ».</p>
                </section>
              )}

              {/* Livrable stack : outils proposés, validés un par un (phase 4.3) */}
              {meetingType === 'stack' && (
                <section className="space-y-2">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold text-ink">
                    <Wrench size={16} className="text-action" aria-hidden="true" /> Outils proposés · {toolSuggestions.length}
                  </h3>
                  {toolSuggestions.length === 0 && (
                    <p className="text-xs text-ink-faint">Aucun outil complémentaire proposé : vos outils actuels couvrent les besoins discutés.</p>
                  )}
                  {toolSuggestions.map(t => {
                    const decision = toolDecisions[t.id];
                    return (
                      <div key={t.id} className={`border rounded-xl p-3 space-y-1 transition ${
                        decision === 'validated' ? 'border-ok-border bg-ok-light/50'
                          : decision === 'refused' ? 'border-line bg-canvas opacity-70' : 'border-line bg-white'
                      }`}>
                        <p className="text-sm font-extrabold text-ink">{t.name}</p>
                        {t.need && <p className="text-xs text-ink-soft"><span className="text-ink-faint">Besoin :</span> {t.need}</p>}
                        {t.why && <p className="text-xs text-ink-soft"><span className="text-ink-faint">Pourquoi :</span> {t.why}</p>}
                        <p className="text-xs text-ink-muted">
                          {costLabel(t.cost)}{t.cost?.freeTier && ` · gratuit jusqu'à : ${t.cost.freeTier}`}
                          {t.priceSource
                            ? <> · <a href={t.priceSource} target="_blank" rel="noopener noreferrer" className="text-action font-semibold hover:underline">source</a></>
                            : <span className="text-await"> · indicatif, à vérifier</span>}
                        </p>
                        <div className="flex gap-2 pt-1">
                          <button type="button" aria-pressed={decision === 'validated'}
                            onClick={() => setToolDecisions(d => ({ ...d, [t.id]: 'validated' }))}
                            className={`inline-flex items-center gap-1 text-xs font-bold px-3 h-8 rounded-[10px] border-2 transition ${
                              decision === 'validated' ? 'bg-ok-light border-ok text-ok' : 'border-line text-ink-muted hover:border-ok-border'}`}>
                            <Check size={13} aria-hidden="true" /> Valider
                          </button>
                          <button type="button" aria-pressed={decision === 'refused'}
                            onClick={() => setToolDecisions(d => ({ ...d, [t.id]: 'refused' }))}
                            className={`inline-flex items-center gap-1 text-xs font-bold px-3 h-8 rounded-[10px] border-2 transition ${
                              decision === 'refused' ? 'bg-muted-light border-muted text-ink-soft' : 'border-line text-ink-muted hover:border-ink-faint'}`}>
                            <X size={13} aria-hidden="true" /> Refuser
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {toolSuggestions.some(t => !toolDecisions[t.id]) && (
                    <p className="text-xs text-await">Les outils sans décision restent « suggérés » dans les outils du projet.</p>
                  )}
                </section>
              )}
            </>
          )}

          {step === 'suggestions' && (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-extrabold text-ink">
                    <Lightbulb size={16} className="text-ai" aria-hidden="true" />
                    Réunions à ajouter au plan {(suggestions.length + meetingProposals.length) > 0 && `· ${suggestions.length + meetingProposals.length}`}
                  </h3>
                  <p className="text-xs text-ink-muted mt-0.5">Celles que vous gardez rejoignent le plan du projet à la validation.</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setShowPlan(true)}>
                  <ListOrdered size={14} aria-hidden="true" /> Voir le plan
                </Button>
              </div>
              {/* Réunions proposées par BlabIA à la conclusion : décisions restées à prendre, travail
                  de code (v5.1) — dans la même étape que les suggestions des agents */}
              {meetingProposals.length > 0 && (
                <section className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-extrabold text-ink-soft">
                    <CalendarPlus size={14} className="text-action" aria-hidden="true" /> Proposées par BlabIA à la conclusion
                  </p>
                  <p className="text-xs text-ink-muted">Ce qui reste à décider, ou à développer, n’est pas une action pour vous : une réunion pour le traiter. Décochez ce que vous ne voulez pas.</p>
                  <ul className="space-y-1.5">
                    {meetingProposals.map(m => (
                      <li key={m.key} className={`flex items-start gap-2.5 border rounded-xl p-2.5 ${m.keep ? 'border-line bg-white' : 'border-line bg-canvas opacity-60'}`}>
                        <input type="checkbox" checked={m.keep} aria-label="Ajouter cette réunion au plan"
                          onChange={e => updateMeeting(m.key, { keep: e.target.checked })} className="mt-2 w-4 h-4 accent-action shrink-0" />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge tone={m.type === 'claude_code' ? 'ai' : 'action'} className="!text-[10px] !px-2 !py-0.5">{m.type === 'claude_code' ? 'Claude Code' : 'Décision'}</Badge>
                            <input value={m.title} onChange={e => updateMeeting(m.key, { title: e.target.value })} disabled={!m.keep} aria-label="Titre de la réunion"
                              className="flex-1 min-w-[180px] text-sm font-semibold text-ink border border-transparent hover:border-line focus:border-action-border rounded-md px-1.5 py-1 outline-none bg-transparent" />
                          </div>
                          <p className="text-[11px] text-ink-muted whitespace-pre-line px-1.5">{m.description}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {suggestions.length === 0 ? (
                meetingProposals.length === 0 && <p className="text-sm text-ink-faint text-center py-8">Aucune réunion à ajouter au plan.</p>
              ) : (
                <div className="space-y-2 -mx-4">
                  {meetingProposals.length > 0 && <p className="px-4 flex items-center gap-1.5 text-xs font-extrabold text-ink-soft"><Lightbulb size={14} className="text-ai" aria-hidden="true" /> Suggérées par les agents pendant la réunion</p>}
                  {suggestions.map(s => (
                    <MeetingSuggestionCard
                      key={s.id}
                      suggestion={s}
                      busy={suggestionBusyId === s.id}
                      onKeep={handleKeepSuggestion}
                      onDiscard={handleDiscardSuggestion}
                      onSave={handleSaveSuggestion}
                      meetingRefs={meetingRefs}
                    />
                  ))}
                </div>
              )}
              {session.todoId && (
                <p className="text-xs text-ok font-bold text-center">L’action d’où vient cette réunion sera cochée « faite » à la validation.</p>
              )}
              {pendingSuggestions.length > 0 && (
                <p className="text-xs text-await text-center">
                  {pendingSuggestions.length} suggestion{pendingSuggestions.length > 1 ? 's' : ''} encore sans décision : elle{pendingSuggestions.length > 1 ? 's' : ''} ne sera{pendingSuggestions.length > 1 ? 'ont' : ''} pas ajoutée{pendingSuggestions.length > 1 ? 's' : ''} au plan.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Pied */}
        <div className="shrink-0 border-t border-line px-5 py-3.5 space-y-2">
          {applyError && (
            <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-[10px] px-3 py-2">{applyError}</p>
          )}
          {!abandonConfirm ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAbandonConfirm(true)} disabled={applying || abandoning}
                className="text-ink-faint hover:!text-red-700">
                <Ban size={14} aria-hidden="true" /> Abandonner
              </Button>
              <div className="flex-1" />
              {step === 'review' && (
                <Button variant="primary" onClick={() => setStep('suggestions')} disabled={!!genError}>
                  Suivant <ArrowRight size={16} aria-hidden="true" />
                </Button>
              )}
              {step === 'suggestions' && (
                <>
                  <Button variant="secondary" onClick={() => setStep('review')}>
                    <ArrowLeft size={16} aria-hidden="true" /> Retour
                  </Button>
                  <Button variant="primary" onClick={handleApply} disabled={applying} className="!bg-ok hover:!bg-green-800">
                    {applying
                      ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><Check size={16} aria-hidden="true" /> Valider et clore</>}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center space-y-1">
                <p className="text-sm font-extrabold text-red-700">Abandonner cette réunion ?</p>
                <p className="text-xs text-red-600">Action définitive : aucun compte-rendu ni livrable ne sera enregistré.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setAbandonConfirm(false)}>Annuler</Button>
                <Button className="flex-1 !bg-red-600 hover:!bg-red-700 !text-white !border-transparent" onClick={handleAbandon} disabled={abandoning}>
                  {abandoning ? '…' : 'Confirmer l’abandon'}
                </Button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>

    {showFullContent && (
      <SummaryDisplayModal
        title={session.task}
        date={session.createdAt ? new Date(session.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : undefined}
        content={summary}
        onClose={() => setShowFullContent(false)}
      />
    )}

    {showPlan && (
      <MeetingPlanModal
        projectId={projectId}
        sessionId={session.id}
        keptSuggestions={keptSuggestions}
        onClose={() => setShowPlan(false)}
        onValidated={() => setShowPlan(false)}
      />
    )}
    </>
  );
}
