import { useState, useEffect } from 'react';
import { Handshake, Code2, Wrench, X, Play, RotateCcw, FileText, Trash2, Pin, CalendarDays, ListChecks } from 'lucide-react';
import api from '../../utils/api';
import { notifyError } from '../../utils/notify';
import { Button, Badge, IconButton, SectionLabel } from '../ui';

export const STATUS_OPTS   = ['pending', 'in_progress', 'done', 'blocked'];
export const STATUS_LABELS = { pending: 'À tenir', in_progress: 'En cours', done: 'Terminée', blocked: 'Bloquée' };
export const STATUS_TONE   = { pending: 'muted', in_progress: 'action', done: 'ok', blocked: 'await' };

export const TYPE_ICON = { decision: '🤝', claude_code: '💻', stack: '🔧' };
export const TYPE_LABEL = { decision: 'Décision', claude_code: 'Claude Code', stack: 'Outils' };
// Icônes contour, les mêmes que les livrables de la préparation d'une réunion
export const TYPE_LUCIDE = { decision: Handshake, claude_code: Code2, stack: Wrench };
export const MEETING_TYPES = ['decision', 'claude_code', 'stack'];

export function MeetingTypeIcon({ type, size = 18, className = '' }) {
  const Icon = TYPE_LUCIDE[type] || Handshake;
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" className={className} />;
}

export function trunc(str, n = 28) {
  return str && str.length > n ? str.slice(0, n) + '…' : (str || '');
}

export const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const DELIVERABLE_LABEL = {
  decision:    'Voir le compte-rendu',
  claude_code: 'Voir le prompt',
  stack:       'Voir les outils',
};
const SESSION_STATUS = {
  open:      { label: 'Réunion en cours', tone: 'action' },
  accepted:  { label: 'Réunion conclue', tone: 'ok' },
  abandoned: { label: 'Réunion abandonnée', tone: 'await' },
};

// ── Détail d'une réunion du plan ───────────────────────────────────────────────
// Rendu dans un conteneur positionné (panneau latéral de la page Plan)
export function SessionDrawer({ milestone, linkedSession, projectId, navigate, onClose, onRefresh, onShowDeliverable, onDeleteMilestone, onStart }) {
  const [status, setStatus] = useState(milestone.status);
  const [saving, setSaving] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [pinnedDecisions, setPinnedDecisions] = useState([]);

  useEffect(() => {
    if (!linkedSession?.id) return;
    api.get(`/projects/${projectId}/sessions/${linkedSession.id}`)
      .then(({ data }) => {
        if (Array.isArray(data.messages)) {
          setPinnedDecisions(data.messages.filter(m => m.pinned && m.role === 'agent'));
        }
      })
      .catch(() => {}); // décisions épinglées : complément facultatif
  }, [linkedSession?.id, projectId]);

  const changeStatus = async (s) => {
    setStatus(s);
    setSaving(true);
    try {
      await api.patch(`/projects/${projectId}/milestones/${milestone.id}`, { status: s });
      onRefresh();
    } catch (err) { notifyError(err, 'Le statut de la réunion n’a pas pu être modifié.'); }
    setSaving(false);
  };

  const handleReopen = async (sessionId) => {
    setReopening(true);
    try {
      await api.post(`/projects/${projectId}/sessions/${sessionId}/reopen`);
      navigate(`/projects/${projectId}/meeting/${sessionId}`);
    } catch (err) { notifyError(err, 'La réunion n’a pas pu être reprise.'); }
    setReopening(false);
  };

  const start = onStart || (m => navigate(`/projects/${projectId}/meeting/new`, {
    state: { milestoneId: m.id, milestoneTitle: m.title, milestoneType: m.type },
  }));
  const agendaCount = Array.isArray(milestone.agenda) ? milestone.agenda.length : 0;
  const ss = linkedSession && SESSION_STATUS[linkedSession.status];

  return (
    <div className="absolute inset-0 bg-white flex flex-col">
      <div className="flex items-start gap-3 px-5 py-4 border-b border-line shrink-0">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-action-light text-action inline-flex items-center justify-center">
          <MeetingTypeIcon type={milestone.type} size={20} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-wider text-ink-muted">{TYPE_LABEL[milestone.type] || 'Réunion'}</p>
          <h2 className="text-base font-bold text-ink leading-snug mt-0.5">{milestone.title}</h2>
        </div>
        <IconButton label="Fermer" size="sm" onClick={onClose}><X size={18} /></IconButton>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {milestone.description && <p className="text-sm text-ink-soft leading-relaxed whitespace-pre-line">{milestone.description}</p>}

        {agendaCount > 0 && (
          <p className="flex items-center gap-2 text-sm text-await bg-await-bg border border-await-border rounded-xl px-3 py-2">
            <ListChecks size={16} aria-hidden="true" className="shrink-0" />
            Ordre du jour : {agendaCount} décision{agendaCount > 1 ? 's' : ''} remise{agendaCount > 1 ? 's' : ''} en question à retraiter
          </p>
        )}

        <div>
          <SectionLabel className="mb-2"><label htmlFor="milestone-status">Statut</label></SectionLabel>
          <select id="milestone-status" value={status} onChange={e => changeStatus(e.target.value)} disabled={saving}
            className="w-full text-sm text-ink border border-line rounded-[10px] px-3 h-10 outline-none focus:ring-2 focus:ring-action bg-white">
            {STATUS_OPTS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>

        {linkedSession && (
          <div className="flex flex-wrap items-center gap-2">
            {ss && <Badge tone={ss.tone}>{ss.label}</Badge>}
            {linkedSession.createdAt && (
              <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                <CalendarDays size={14} aria-hidden="true" /> {fmtDate(linkedSession.createdAt)}
              </span>
            )}
          </div>
        )}

        {pinnedDecisions.length > 0 && (
          <div className="space-y-2">
            <SectionLabel className="flex items-center gap-1.5"><Pin size={14} aria-hidden="true" /> Messages épinglés</SectionLabel>
            {pinnedDecisions.map((msg, i) => (
              <div key={msg.id || i} className="bg-canvas border border-line rounded-xl px-3 py-2">
                <p className="text-xs font-bold text-ink-muted mb-0.5">{msg.agentName}</p>
                <p className="text-sm text-ink-soft leading-relaxed">{msg.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line px-5 py-4 space-y-2">
        {linkedSession ? (
          <>
            {linkedSession.status === 'abandoned' ? (
              <Button variant="primary" className="w-full" disabled={reopening} onClick={() => handleReopen(linkedSession.id)}>
                <RotateCcw size={16} aria-hidden="true" /> {reopening ? 'Reprise…' : 'Reprendre la réunion'}
              </Button>
            ) : (
              <Button variant={linkedSession.status === 'open' ? 'primary' : 'secondary'} className="w-full"
                onClick={() => navigate(`/projects/${projectId}/meeting/${linkedSession.id}`)}>
                <Play size={16} aria-hidden="true" /> {linkedSession.status === 'open' ? 'Reprendre la réunion' : 'Ouvrir la réunion'}
              </Button>
            )}
            {linkedSession.status === 'accepted' && onShowDeliverable && (
              <Button variant="secondary" className="w-full !text-ai !border-ai-border hover:!bg-ai-bg"
                onClick={() => { onShowDeliverable(linkedSession, milestone.type); onClose(); }}>
                <FileText size={16} aria-hidden="true" /> {DELIVERABLE_LABEL[milestone.type] || 'Voir le livrable'}
              </Button>
            )}
          </>
        ) : (
          <Button variant="primary" className="w-full" onClick={() => { onClose(); start(milestone); }}>
            <Play size={16} aria-hidden="true" /> Préparer la réunion
          </Button>
        )}
        {onDeleteMilestone && (
          <Button variant="ghost" size="sm" className="w-full !text-red-700 hover:!bg-red-50" onClick={() => onDeleteMilestone(milestone.id)}>
            <Trash2 size={14} aria-hidden="true" /> Supprimer cette réunion du plan
          </Button>
        )}
      </div>
    </div>
  );
}
