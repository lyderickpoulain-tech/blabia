import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useProjectPanel } from './ProjectLayout';

const TYPE_ICON = {
  synthesis:   '📋',
  claude_code: '💻',
  stack_check: '🔧',
};
const TYPES = ['synthesis', 'claude_code', 'stack_check'];

export default function GenerateTimelineModal({ project, existingCount, onClose, onAdded }) {
  const { refreshPanel } = useProjectPanel();
  const [steps, setSteps]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [adding, setAdding]     = useState(false);
  const [done, setDone]         = useState(false);
  const [dragIdx, setDragIdx]   = useState(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post(`/projects/${project.id}/generate-timeline`);
      setSteps((data.steps || []).map((s, i) => ({ ...s, _key: i, active: true })));
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la génération');
    }
    setLoading(false);
  }, [project.id]);

  // Auto-generate on mount
  useEffect(() => { generate(); }, []);

  const updateStep = (i, field, value) => {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  };

  const removeStep = (i) => setSteps(prev => prev.filter((_, idx) => idx !== i));

  const insertAfter = (i) => {
    setSteps(prev => [
      ...prev.slice(0, i + 1),
      { title: '', description: '', type: 'meeting', estimatedOrder: i + 1.5, _key: Date.now(), active: true },
      ...prev.slice(i + 1)
    ]);
  };

  const handleDragStart = (i) => setDragIdx(i);
  const handleDrop = (i) => {
    if (dragIdx === null || dragIdx === i) return;
    setSteps(prev => {
      const arr = [...prev];
      const [item] = arr.splice(dragIdx, 1);
      arr.splice(i, 0, item);
      return arr;
    });
    setDragIdx(null);
  };

  const handleAdd = async () => {
    const active = steps.filter(s => s.active && s.title?.trim());
    if (active.length === 0) return;
    setAdding(true);
    setError('');
    const payload = {
      milestones: active.map(s => ({
        title: s.title.trim(),
        description: s.description?.trim() || '',
        type: s.type || 'synthesis',
        todos: []
      })),
      standalone_todos: []
    };
    console.log('[GenerateTimeline] POST /plan/bulk payload:', JSON.stringify(payload));
    try {
      const { data } = await api.post(`/projects/${project.id}/plan/bulk`, payload);
      console.log('[GenerateTimeline] succès:', data);
      refreshPanel();
      setDone(true);
      onAdded?.();
    } catch (err) {
      console.error('[GenerateTimeline] erreur:', err.response?.data || err.message);
      setError(err.response?.data?.error || 'Erreur lors de l\'ajout');
    }
    setAdding(false);
  };

  const activeCount = steps.filter(s => s.active && s.title?.trim()).length;
  const newCount = Math.max(0, activeCount - existingCount);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col">

        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <span className="text-xl">📅</span>
          <div className="flex-1">
            <h2 className="text-base font-bold text-gray-900">Timeline proposée pour « {project.name} »</h2>
            {!loading && steps.length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">{steps.length} étape{steps.length > 1 ? 's' : ''} générée{steps.length > 1 ? 's' : ''}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
              <div className="w-8 h-8 border-2 border-blabia-blue border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Analyse du brief et génération de la timeline…</p>
            </div>
          )}

          {error && !loading && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
              <span>⚠️ {error}</span>
              <button onClick={generate} className="text-xs font-medium underline">Réessayer</button>
            </div>
          )}

          {done && (
            <div className="text-center py-8 space-y-2">
              <div className="text-3xl">✅</div>
              <p className="font-semibold text-gray-800">{activeCount} étapes ajoutées à la timeline</p>
              <button onClick={onClose} className="text-sm text-blabia-blue hover:underline">Fermer</button>
            </div>
          )}

          {!loading && !done && steps.length > 0 && (
            <div className="space-y-2">
              {steps.map((step, i) => (
                <div key={step._key}
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => handleDrop(i)}
                  className={`group relative border rounded-xl p-3 transition cursor-move ${
                    step.active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-50'
                  }`}>
                  <div className="flex items-start gap-2">
                    <span className="text-gray-300 mt-1 text-xs select-none">⠿</span>
                    <span className="text-lg shrink-0 mt-0.5">{TYPE_ICON[step.type] || '🎯'}</span>
                    <div className="flex-1 min-w-0 space-y-1">
                      <input
                        type="text"
                        value={step.title}
                        onChange={e => updateStep(i, 'title', e.target.value)}
                        placeholder="Titre de l'étape…"
                        className="w-full text-sm font-medium border-0 border-b border-transparent focus:border-blue-300 outline-none bg-transparent py-0.5"
                      />
                      <p className="text-xs text-gray-400 leading-relaxed">{step.description}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Sélecteur type */}
                      <select value={step.type} onChange={e => updateStep(i, 'type', e.target.value)}
                        className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white outline-none">
                        {TYPES.map(t => (
                          <option key={t} value={t}>{TYPE_ICON[t]}</option>
                        ))}
                      </select>
                      <button onClick={() => updateStep(i, 'active', !step.active)}
                        className="text-gray-300 hover:text-gray-500 text-xs px-1">
                        {step.active ? '👁' : '🚫'}
                      </button>
                      <button onClick={() => removeStep(i)}
                        className="text-gray-300 hover:text-red-400 text-xs px-1">
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <button onClick={() => insertAfter(steps.length - 1)}
                className="w-full py-2 border-2 border-dashed border-gray-200 hover:border-blue-300 rounded-xl text-xs text-gray-400 hover:text-blue-500 transition">
                + Ajouter une étape
              </button>
            </div>
          )}
        </div>

        {!done && !loading && steps.length > 0 && (
          <div className="shrink-0 px-5 py-4 border-t border-gray-100 space-y-2">
            {existingCount > 0 && (
              <p className="text-xs text-gray-400 text-center">
                {newCount} étape{newCount > 1 ? 's' : ''} seront ajoutées — {existingCount} jalon{existingCount > 1 ? 's' : ''} existant{existingCount > 1 ? 's' : ''} conservé{existingCount > 1 ? 's' : ''}
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={onClose}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition">
                Annuler
              </button>
              <button onClick={handleAdd} disabled={adding || activeCount === 0}
                className="flex-1 bg-blabia-blue hover:bg-blabia-blue text-white font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-50">
                {adding ? 'Ajout…' : `Ajouter ${activeCount} étape${activeCount > 1 ? 's' : ''} à ma timeline →`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
