import { useState } from 'react';
import { Telescope, Search, FileSearch, PenLine, FileText, RotateCcw, X, Play, FileCheck2, FileX2 } from 'lucide-react';
import { Badge, Button } from './ui';
import { formatUSD } from '../utils/cost';
import { MISSION_LEVELS, levelById } from '../utils/missionLevels';

// Mission confiée par un agent à un sous-agent (v5.1) : proposée en réunion,
// validée par l'humain avec un niveau (légère / standard / approfondie, le plafond en
// découle), menée en arrière-plan, rapport versé aux
// documents du projet. Utilisée dans le fil de réunion et sur la page Actions.

export const KIND = {
  research: { label: 'Recherche', icon: Search },
  analysis: { label: 'Analyse',   icon: FileSearch },
  writing:  { label: 'Rédaction', icon: PenLine },
};
const STATUS = {
  proposed:  { label: 'Proposée : attend votre accord', tone: 'await' },
  queued:    { label: 'En attente de démarrage',        tone: 'ai' },
  running:   { label: 'En cours…',                       tone: 'ai' },
  done:      { label: 'Terminée',                        tone: 'ok' },
  failed:    { label: 'Échouée',                         tone: 'muted' },
  rejected:  { label: 'Écartée',                         tone: 'muted' },
  cancelled: { label: 'Annulée',                         tone: 'muted' },
};

export default function MissionCard({ mission, onApprove, onReject, onCancel, onOpenReport, onIntegrate, onDiscard, compact = false, disabled = false, approveLabel = 'Lancer' }) {
  const [level, setLevel] = useState(mission.level || 'standard');
  const [busy, setBusy] = useState(false);
  const kind = KIND[mission.kind] || KIND.research;
  const status = STATUS[mission.status] || STATUS.proposed;
  const act = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const active = mission.status === 'queued' || mission.status === 'running';

  return (
    <div data-tour="mission-card" className={`rounded-xl border px-3.5 py-3 ${mission.status === 'proposed' ? 'border-await-border bg-await-bg' : active ? 'border-ai-border bg-ai-bg' : 'border-line bg-white'}`}>
      <div className="flex items-start gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-ai-light text-ai inline-flex items-center justify-center shrink-0" aria-hidden="true">
          <Telescope size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-ink-faint">
            <strong className="font-extrabold uppercase tracking-wider text-ai">Mission</strong>
            {' · '}{kind.label} · proposée par {mission.agentName}{!compact && mission.sessionTask ? ` · ${mission.sessionTask}` : ''}
          </p>
          <p className="text-sm font-extrabold text-ink mt-0.5">{mission.title}</p>
          {!compact && <p className="text-xs text-ink-soft mt-0.5">{mission.objective}</p>}
          {!compact && mission.deliverable && <p className="text-[11px] text-ink-muted mt-0.5">Livrable : {mission.deliverable}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <Badge tone={status.tone} className="!text-[10px] !py-0.5">
              {mission.status === 'running' && <span className="w-2.5 h-2.5 border-2 border-ai border-t-transparent rounded-full animate-spin" aria-hidden="true" />}
              {status.label}
            </Badge>
            {mission.status === 'done' && <span className="text-[11px] text-ink-faint">coût réel {formatUSD(mission.costUSD)}</span>}
            {active && <span className="text-[11px] text-ink-faint">{levelById(mission.level).label} · {formatUSD(mission.budgetUSD)} au plus</span>}
          </div>
          {mission.status === 'failed' && mission.error && <p className="text-[11px] text-red-700 mt-1">{mission.error}</p>}

          {mission.status === 'proposed' && !disabled && (
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              <label className="text-xs text-ink-soft inline-flex items-center gap-1.5">
                Niveau
                <select value={level} onChange={e => setLevel(e.target.value)} aria-label="Niveau de la mission"
                  className="h-8 border border-line rounded-lg px-1.5 text-xs bg-white">
                  {MISSION_LEVELS.map(l => <option key={l.id} value={l.id}>{l.label} — {l.hint} (≤ {formatUSD(l.budgetUSD)})</option>)}
                </select>
              </label>
              <Button size="sm" variant="primary" className="!h-8" disabled={busy} onClick={() => act(() => onApprove?.(mission, level))}>
                <Play size={13} aria-hidden="true" /> {approveLabel}
              </Button>
              <Button size="sm" variant="ghost" className="!h-8" disabled={busy} onClick={() => act(() => onReject?.(mission))}>
                Écarter
              </Button>
            </div>
          )}
          {mission.status === 'queued' && onCancel && (
            <Button size="sm" variant="ghost" className="!h-8 mt-2" disabled={busy} onClick={() => act(() => onCancel(mission))}>
              <X size={13} aria-hidden="true" /> Annuler
            </Button>
          )}
          {mission.status === 'failed' && onApprove && (
            <Button size="sm" variant="secondary" className="!h-8 mt-2" disabled={busy} onClick={() => act(() => onApprove(mission, mission.level || 'standard'))}>
              <RotateCcw size={13} aria-hidden="true" /> Relancer
            </Button>
          )}
          {mission.status === 'done' && (onOpenReport || (onIntegrate && !mission.outcome)) && (
            <div className="flex flex-wrap gap-2 mt-2">
              {onOpenReport && (
                <Button size="sm" variant="secondary" className="!h-8" onClick={() => onOpenReport(mission)}>
                  <FileText size={13} aria-hidden="true" /> Lire le rapport
                </Button>
              )}
              {onIntegrate && !mission.outcome && (
                <>
                  <Button size="sm" variant="primary" className="!h-8" disabled={busy} onClick={() => act(() => onIntegrate(mission))}>
                    <FileCheck2 size={13} aria-hidden="true" /> Intégrer le CR au projet
                  </Button>
                  <Button size="sm" variant="ghost" className="!h-8" disabled={busy} onClick={() => act(() => onDiscard(mission))}>
                    <FileX2 size={13} aria-hidden="true" /> Ne pas intégrer
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
