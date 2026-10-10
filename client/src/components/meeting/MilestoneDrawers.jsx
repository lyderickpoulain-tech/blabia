import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { notifyError } from '../../utils/notify';

export const STATUS_OPTS   = ['pending', 'in_progress', 'done', 'blocked'];
export const STATUS_LABELS = { pending: 'À tenir', in_progress: 'En cours', done: 'Terminée', blocked: 'Bloquée' };

export const TYPE_ICON = { decision: '🤝', claude_code: '💻', stack: '🔧' };
export const TYPE_LABEL = { decision: 'Décision', claude_code: 'Claude Code', stack: 'Outils' };

export function trunc(str, n = 28) {
  return str && str.length > n ? str.slice(0, n) + '…' : (str || '');
}

const DELIVERABLE_LABEL = {
  decision:    '📋 Voir le compte-rendu',
  claude_code: '💻 Voir le prompt',
  stack:       '🔧 Voir les outils',
};

// ── Drawer session (decision / claude_code) ────────────────────────────────────
export function SessionDrawer({ milestone, linkedSession, projectId, navigate, onClose, onRefresh, onShowDeliverable, onDeleteMilestone }) {
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
    } catch (err) {
      console.error('[handleReopen]', err);
    }
    setReopening(false);
  };

  const sessionDate = linkedSession?.createdAt
    ? new Date(linkedSession.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';
  const openSessionPath = linkedSession ? `/projects/${projectId}/meeting/${linkedSession.id}` : null;

  const SESSION_STATUS_LABEL = { open: '🔵 En cours', accepted: '✅ Acceptée', abandoned: '🚫 Abandonnée' };

  return (
    <div className="absolute inset-0 bg-white z-10 flex flex-col rounded-r-xl">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-line shrink-0">
        <button onClick={onClose} className="text-ink-faint hover:text-ink-soft text-base leading-none font-bold">←</button>
        <span className="text-xs font-semibold text-ink flex-1 min-w-0 truncate">
          {TYPE_ICON[milestone.type]} {trunc(milestone.title, 20)}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <span className="inline-flex items-center gap-1 text-xs font-medium bg-canvas-deep text-ink-soft px-2 py-0.5 rounded-full">
          {TYPE_ICON[milestone.type]} {TYPE_LABEL[milestone.type]}
        </span>

        {milestone.description ? (
          <p className="text-xs text-ink-soft leading-relaxed">{milestone.description}</p>
        ) : (
          <p className="text-xs text-ink-faint italic">Aucune description</p>
        )}

        <div>
          <label className="text-xs font-semibold text-ink-soft uppercase tracking-wide block mb-1.5">Statut</label>
          <select value={status} onChange={e => changeStatus(e.target.value)} disabled={saving}
            className="w-full text-xs border border-line rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-action bg-white">
            {STATUS_OPTS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>

        {pinnedDecisions.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-ink-soft uppercase tracking-wide block">📌 Décisions</label>
            {pinnedDecisions.map((msg, i) => (
              <div key={msg.id || i} className="bg-await-bg border border-await-border rounded-lg px-2.5 py-2">
                <p className="text-[10px] font-semibold text-await mb-0.5">{msg.agentName}</p>
                <p className="text-xs text-await leading-relaxed">{msg.content}</p>
              </div>
            ))}
          </div>
        )}

        {linkedSession ? (
          <div className="space-y-2 pt-1">
            {linkedSession.status === 'abandoned' ? (
              <button onClick={() => handleReopen(linkedSession.id)} disabled={reopening}
                className="w-full bg-await hover:bg-await/90 text-white text-xs font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-60">
                {reopening ? '…' : '🔄 Reprendre la réunion'}
              </button>
            ) : (
              <button onClick={() => navigate(openSessionPath)}
                className="w-full bg-ok hover:bg-ok/90 text-white text-xs font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-1.5">
                {linkedSession.status === 'open' ? '▶ Reprendre la réunion' : '📋 Voir la réunion'}
              </button>
            )}
            {linkedSession.status === 'accepted' && onShowDeliverable && (
              <button onClick={() => { onShowDeliverable(linkedSession, milestone.type); onClose(); }}
                className="w-full bg-ai-bg hover:bg-ai-light border border-ai-border text-ai text-xs font-semibold py-2 rounded-xl transition flex items-center justify-center gap-1.5">
                {DELIVERABLE_LABEL[milestone.type] || '📄 Voir le livrable'}
              </button>
            )}
            <div className="text-xs text-ink-faint text-center">
              {sessionDate} · <span className="font-medium text-ink-soft">{SESSION_STATUS_LABEL[linkedSession.status] || linkedSession.status}</span>
            </div>
            <button onClick={onClose} className="w-full border border-line text-ink-soft text-xs font-medium py-2 rounded-xl hover:bg-canvas transition">
              Fermer
            </button>
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            <button
              onClick={() => navigate(`/projects/${projectId}/meeting/new`, {
                state: { milestoneId: milestone.id, milestoneTitle: milestone.title, milestoneType: milestone.type }
              })}
              className="w-full bg-action hover:bg-action-dark text-white text-xs font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-1.5">
              🚀 Démarrer une réunion
            </button>
            <button onClick={onClose} className="w-full border border-line text-ink-soft text-xs font-medium py-2 rounded-xl hover:bg-canvas transition">
              Annuler
            </button>
          </div>
        )}
        {onDeleteMilestone && (
          <div className="pt-2 border-t border-line">
            <button onClick={() => onDeleteMilestone(milestone.id)}
              className="w-full text-xs text-red-400 hover:text-red-600 py-1.5 rounded-lg hover:bg-red-50 transition">
              🗑 Supprimer cette réunion
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
