import { useState } from 'react';
import api from '../utils/api';

const TYPE_ICON = {
  summary: '📋', claude_code: '💻', timeline_steps: '📅',
  stack_check: '🔧', milestone: '🏁',
};

export default function TimelineStepsModal({ session, projectId, onClose, onRefresh }) {
  const raw = session?.pendingStepSuggestions;
  const steps = Array.isArray(raw)
    ? raw
    : (() => { try { return JSON.parse(raw || '[]'); } catch { return []; } })();

  const [addedIdxs, setAddedIdxs] = useState(new Set());
  const [singleAdding, setSingleAdding] = useState(null);
  const [addingAll,    setAddingAll]    = useState(false);

  const addOne = async (step, idx) => {
    await api.post(`/projects/${projectId}/milestones`, {
      title: step.title || step,
      type:  step.type  || 'timeline_steps',
    });
    setAddedIdxs(prev => new Set([...prev, idx]));
    onRefresh?.();
  };

  const handleAdd = async (step, idx) => {
    if (singleAdding !== null || addingAll) return;
    setSingleAdding(idx);
    try { await addOne(step, idx); } catch {}
    setSingleAdding(null);
  };

  const handleAddAll = async () => {
    if (addingAll || singleAdding !== null) return;
    setAddingAll(true);
    const done = new Set(addedIdxs);
    for (let i = 0; i < steps.length; i++) {
      if (done.has(i)) continue;
      try { await addOne(steps[i], i); done.add(i); } catch {}
    }
    setAddingAll(false);
  };

  const date = session.createdAt
    ? new Date(session.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-gray-900 leading-snug">📅 {session.task}</h2>
            {date && <p className="text-xs text-gray-400 mt-0.5">{date}</p>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-600 text-xl w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition"
          >
            ✕
          </button>
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {steps.length === 0 ? (
            <p className="text-sm text-gray-400 italic text-center py-8">Aucune étape proposée</p>
          ) : steps.map((step, idx) => {
            const stepTitle = step.title || step;
            const stepType  = step.type  || 'timeline_steps';
            const isAdded   = addedIdxs.has(idx);
            const isAdding  = singleAdding === idx || (addingAll && !isAdded);
            return (
              <div
                key={idx}
                className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                  isAdded ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                }`}
              >
                <span className="text-base shrink-0">{TYPE_ICON[stepType] || '📅'}</span>
                <p className="flex-1 text-sm text-gray-700 leading-snug">{stepTitle}</p>
                {isAdded ? (
                  <span className="text-xs text-green-600 font-medium shrink-0">✅ Ajoutée</span>
                ) : (
                  <button
                    onClick={() => handleAdd(step, idx)}
                    disabled={singleAdding !== null || addingAll}
                    className="text-xs bg-blabia-blue hover:bg-blabia-blue text-white px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50 shrink-0"
                  >
                    {isAdding ? '…' : 'Ajouter'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 pb-4 pt-3 border-t border-gray-100 space-y-2">
          {steps.length > 1 && addedIdxs.size < steps.length && (
            <button
              onClick={handleAddAll}
              disabled={addingAll || singleAdding !== null}
              className="w-full bg-blabia-blue hover:bg-blabia-blue text-white py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50"
            >
              {addingAll ? 'Ajout en cours…' : 'Tout ajouter à la timeline'}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full border border-gray-200 text-gray-600 py-2 rounded-xl text-sm hover:bg-gray-50 transition font-medium"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
}
