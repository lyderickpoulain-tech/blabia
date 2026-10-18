import { useState, useEffect, useMemo } from 'react';
import { CalendarRange, X, GripVertical, Lock } from 'lucide-react';
import api from '../../utils/api';
import { MeetingTypeIcon } from './MilestoneDrawers';

const STATUS_LABEL = { pending: 'À tenir', in_progress: 'En cours', done: 'Terminée', blocked: 'Bloquée' };

// Fusionne les réunions réelles du projet avec les suggestions gardées de cette
// réunion, insérées à la position indiquée par leur référence "after" (R1, R2…
// — la même numérotation que celle vue par les assistants, cf. phase 3.4).
export function buildMergedPlan(milestones, keptSuggestions) {
  const sorted = [...milestones].sort((a, b) => a.displayOrder - b.displayOrder);
  const refToId = {};
  sorted.forEach((m, i) => { refToId[`R${i + 1}`] = m.id; });

  const items = sorted.map(m => ({ kind: 'milestone', key: m.id, data: m }));

  for (const sug of keptSuggestions) {
    if (sug.milestoneId) continue; // déjà matérialisée lors d'une validation précédente
    const item = { kind: 'suggestion', key: sug.id, data: sug };
    const afterId = sug.after ? refToId[sug.after] : null;
    if (afterId) {
      const idx = items.findIndex(it => it.kind === 'milestone' && it.key === afterId);
      items.splice(idx >= 0 ? idx + 1 : items.length, 0, item);
    } else {
      items.push(item);
    }
  }
  return items;
}

export default function MeetingPlanModal({ projectId, sessionId, keptSuggestions, onClose, onValidated }) {
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [items, setItems]           = useState([]);
  const [dragKey, setDragKey]       = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  const [validating, setValidating] = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    api.get(`/projects/${projectId}/plan`)
      .then(({ data }) => setMilestones(data.milestones || []))
      .catch(() => setError('Impossible de charger le plan des réunions.'))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    setItems(buildMergedPlan(milestones, keptSuggestions));
  }, [milestones, keptSuggestions]);

  const isLocked = (item) => item.kind === 'milestone' && item.data.status === 'done';

  const handleDrop = (targetKey) => {
    if (!dragKey || dragKey === targetKey) { setDragKey(null); setDragOverKey(null); return; }
    const fromIdx = items.findIndex(it => it.key === dragKey);
    const toIdx   = items.findIndex(it => it.key === targetKey);
    if (fromIdx < 0 || toIdx < 0 || isLocked(items[fromIdx]) || isLocked(items[toIdx])) {
      setDragKey(null); setDragOverKey(null); return;
    }
    const reordered = [...items];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setItems(reordered);
    setDragKey(null);
    setDragOverKey(null);
  };

  const handleValidate = async () => {
    if (validating) return;
    setValidating(true);
    setError('');
    try {
      const order = items.map(it => it.kind === 'milestone' ? { milestoneId: it.key } : { suggestionId: it.key });
      await api.post(`/projects/${projectId}/sessions/${sessionId}/meeting-plan/validate`, { order });
      onValidated?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la validation du plan');
    }
    setValidating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-bold text-gray-900 flex-1 flex items-center gap-2"><CalendarRange size={18} strokeWidth={1.75} className="text-action" aria-hidden="true" /> Plan des réunions</h2>
          <button onClick={onClose} aria-label="Fermer" className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-blabia-blue border-t-transparent rounded-full animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Aucune réunion pour l'instant</p>
          ) : (
            items.map(item => {
              const locked = isLocked(item);
              const isNew  = item.kind === 'suggestion';
              const title  = isNew ? item.data.title : item.data.title;
              const type   = isNew ? item.data.type : item.data.type;
              const status = isNew ? null : item.data.status;
              return (
                <div
                  key={item.key}
                  draggable={!locked}
                  onDragStart={() => setDragKey(item.key)}
                  onDragOver={(e) => { e.preventDefault(); if (!locked) setDragOverKey(item.key); }}
                  onDrop={(e) => { e.preventDefault(); handleDrop(item.key); }}
                  onDragEnd={() => { setDragKey(null); setDragOverKey(null); }}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition ${
                    locked ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-200'
                  } ${dragOverKey === item.key && dragKey !== item.key ? 'ring-2 ring-blue-300' : ''}`}
                >
                  <GripVertical size={14} aria-hidden="true" className={`shrink-0 text-gray-300 ${locked ? '' : 'cursor-grab'}`} />
                  <MeetingTypeIcon type={type} size={16} className="shrink-0 text-ink-soft" />
                  <span className="flex-1 min-w-0 text-sm text-gray-800 truncate">{title}</span>
                  {isNew ? (
                    <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full shrink-0">Nouvelle</span>
                  ) : (
                    <span className="text-[10px] text-gray-400 shrink-0">{STATUS_LABEL[status] || status}</span>
                  )}
                  {locked && <span className="shrink-0 text-gray-400" title="Réunion terminée — verrouillée"><Lock size={13} aria-hidden="true" /></span>}
                </div>
              );
            })
          )}
        </div>

        {error && (
          <div className="px-4 pb-2">
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          </div>
        )}

        <div className="shrink-0 border-t border-gray-100 p-4">
          <button
            onClick={handleValidate}
            disabled={validating || loading}
            className="w-full bg-blabia-blue hover:bg-blabia-blue text-white font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-50"
          >
            {validating ? 'Validation…' : 'Valider le plan'}
          </button>
        </div>
      </div>
    </div>
  );
}
