import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, SlidersHorizontal, PanelRight, Globe, RotateCcw, Compass, Video } from 'lucide-react';
import { Badge, Button, IconButton } from '../ui';
import PhaseStepper from './PhaseStepper';
import QuestionModePicker from '../QuestionModePicker';
import ThemeToggle from '../ThemeToggle';
import LevelSlider, { EXPERTISE_LABELS, HUMOR_LABELS, HUMOR_ICONS } from '../LevelSlider';

// En-tête de réunion sur une ligne (refonte UX v5.1) : retour, objectif
// (modifiable), quatre temps, compteur de questions, réglages, panneau, conclure.
export default function MeetingHeader({
  projectId, session, isClosed, statusLabel,
  phase, skippedPhases,
  editingTask, setEditingTask, taskDraft, setTaskDraft, savingTask, handleSaveTask,
  intentionMeta, currentIntention, deliverableTypes, savingIntention, handleSaveIntention,
  expertiseLevel, humorLevel, questionMode, onChangeLevel,
  questionsUsed, decisionBudget, pendingDecisionCount,
  tokensUsed, activeAgents,
  panelOpen, onTogglePanel, onShowQuestions,
  onConclude, onReset,
  onWhere, whereBusy = false, // v5.1 : point de situation par l'animation
  visio = false, onToggleVisio = null, // v5.1 : vue « salle » (vignettes des participants)
}) {
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(null);

  useEffect(() => {
    if (!showSettings) return;
    const close = e => { if (settingsRef.current && !settingsRef.current.contains(e.target)) setShowSettings(false); };
    const esc = e => { if (e.key === 'Escape') setShowSettings(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [showSettings]);

  const agentNames = activeAgents.map(a => a.name).join(', ');

  return (
    <header className="shrink-0 bg-white border-b border-line shadow-header px-3 sm:px-4 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 relative z-10">
      <Link to={`/projects/${projectId}`} aria-label="Retour au projet" title="Retour au projet"
        className="w-11 h-11 -ml-1 shrink-0 inline-flex items-center justify-center rounded-[10px] text-ink-muted hover:bg-muted-light hover:text-ink">
        <ArrowLeft size={18} />
      </Link>

      <div className="flex-1 min-w-[200px] flex flex-col min-w-0">
        {editingTask ? (
          <input
            autoFocus
            value={taskDraft}
            onChange={e => setTaskDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  { e.preventDefault(); handleSaveTask(); }
              if (e.key === 'Escape') setEditingTask(false);
            }}
            onBlur={() => setEditingTask(false)}
            disabled={savingTask}
            aria-label="Objectif de la réunion"
            className="text-base font-extrabold text-ink border border-action-border rounded-md px-1.5 outline-none focus:ring-2 focus:ring-action-border min-w-0"
          />
        ) : (
          <h1
            className={`text-base font-extrabold text-ink truncate ${!isClosed ? 'cursor-text hover:text-action' : ''}`}
            title={isClosed ? session.task : `${session.task} — cliquer pour modifier`}
            onClick={() => { if (!isClosed) { setTaskDraft(session.task); setEditingTask(true); } }}
          >
            {session.task}
          </h1>
        )}
        <span className="text-xs text-ink-muted truncate flex items-center gap-1.5">
          {intentionMeta.label}{agentNames && ` · ${agentNames}`}
          {session.webSearchEnabled && <Globe size={12} className="text-action" aria-label="Recherche web activée" />}
        </span>
      </div>

      <div data-tour="mr-phases"><PhaseStepper phase={phase} skipped={skippedPhases} /></div>

      <div className="flex items-center gap-1 ml-auto">
        <ThemeToggle />
        {decisionBudget ? (
          <button type="button" onClick={onShowQuestions} className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-action"
            title={`Questions posées par les assistants / budget de la réunion${pendingDecisionCount ? ` — ${pendingDecisionCount} en attente` : ''}. Au-delà, ils tranchent par hypothèse.`}>
            <Badge tone={pendingDecisionCount ? 'await' : 'muted'}>
              Questions {questionsUsed}/{decisionBudget}
            </Badge>
          </button>
        ) : null}

        <div className="relative" ref={settingsRef}>
          <IconButton label="Réglages de la réunion" active={showSettings} onClick={() => setShowSettings(v => !v)} aria-expanded={showSettings}>
            <SlidersHorizontal size={18} />
          </IconButton>
          {showSettings && (
            <div role="dialog" aria-label="Réglages de la réunion"
              className="absolute right-0 top-full mt-1 w-80 max-w-[calc(100vw-24px)] bg-white border border-line rounded-xl shadow-lg z-30 p-4 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="space-y-1.5">
                <p className="text-sm font-bold text-ink-soft">Type de réunion</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {deliverableTypes.map(d => (
                    <button key={d.id} type="button" disabled={isClosed || savingIntention}
                      onClick={() => handleSaveIntention(d.id)}
                      className={`text-xs rounded-lg border px-2 py-2 font-semibold transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5 ${
                        d.id === currentIntention ? 'bg-action border-action text-white' : 'bg-white border-line text-ink-muted hover:border-action-border'
                      }`}>
                      <d.icon size={14} strokeWidth={1.75} aria-hidden="true" /> {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <LevelSlider label="Maîtrise du sujet" value={expertiseLevel} onChange={v => onChangeLevel('expertiseLevel', v)} labels={EXPERTISE_LABELS} />
              <LevelSlider label="Humour" value={humorLevel} onChange={v => onChangeLevel('humorLevel', v)} labels={HUMOR_LABELS} icons={HUMOR_ICONS} />
              <QuestionModePicker value={questionMode} onChange={v => onChangeLevel('questionMode', v)} />
              <p className="text-[11px] text-ink-faint">Effet à partir du prochain message.</p>
              <div className="border-t border-line pt-3 space-y-1 text-xs text-ink-muted">
                <p>Recherche web : {session.webSearchEnabled ? 'activée' : 'désactivée'}</p>
                {tokensUsed && (
                  <p title={`Entrée : ${tokensUsed.input.toLocaleString('fr-FR')} · Sortie : ${tokensUsed.output.toLocaleString('fr-FR')}`}>
                    Consommation : {tokensUsed.total.toLocaleString('fr-FR')} jetons
                  </p>
                )}
              </div>
              {!isClosed && (
                <button type="button" onClick={() => { setShowSettings(false); onReset(); }}
                  className="w-full inline-flex items-center gap-2 text-sm font-semibold text-await hover:bg-await-bg rounded-lg px-2 py-2">
                  <RotateCcw size={15} /> Réinitialiser cette réunion
                </button>
              )}
            </div>
          )}
        </div>

        {onToggleVisio && (
          <IconButton label={visio ? 'Masquer la vue salle' : 'Vue salle : les participants en vignettes'} active={visio} onClick={onToggleVisio} aria-pressed={visio}>
            <Video size={18} />
          </IconButton>
        )}
        <IconButton label={panelOpen ? 'Masquer le panneau' : 'Afficher le panneau'} active={panelOpen} onClick={onTogglePanel} aria-pressed={panelOpen}>
          <PanelRight size={18} />
        </IconButton>

        {!isClosed && onWhere && (
          <Button size="md" variant="ghost" onClick={onWhere} disabled={whereBusy} title="L'animation fait le point en trois lignes : où on en est, ce qui est acquis, ce qui reste à trancher">
            <Compass size={16} aria-hidden="true" /> <span className="hidden md:inline">{whereBusy ? 'Point en cours…' : 'Où en est-on ?'}</span>
          </Button>
        )}
        {isClosed
          ? <Badge tone={session.status === 'accepted' ? 'ok' : 'muted'}>{statusLabel}</Badge>
          : <Button data-tour="mr-conclude" size="md" variant="secondary" onClick={onConclude}>Conclure</Button>}
      </div>
    </header>
  );
}
