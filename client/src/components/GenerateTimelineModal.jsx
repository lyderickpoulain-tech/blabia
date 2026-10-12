import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { CalendarRange, GripVertical, Eye, EyeOff, Trash2, Plus, X, CheckCircle2, ArrowRight } from 'lucide-react';
import { Button, IconButton } from './ui';
import { MeetingTypePicker } from './meeting/MeetingInsertControls';

export default function GenerateTimelineModal({ project, existingCount, onClose, onAdded }) {
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
      { title: '', description: '', type: 'decision', estimatedOrder: i + 1.5, _key: Date.now(), active: true },
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
        type: s.type || 'decision',
        todos: []
      })),
      standalone_todos: []
    };
    console.log('[GenerateTimeline] POST /plan/bulk payload:', JSON.stringify(payload));
    try {
      const { data } = await api.post(`/projects/${project.id}/plan/bulk`, payload);
      console.log('[GenerateTimeline] succès:', data);
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
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl max-h-[90vh] flex flex-col">

        <div className="flex items-start gap-3 px-5 sm:px-6 py-4 border-b border-line shrink-0">
          <span className="w-10 h-10 shrink-0 rounded-xl bg-ai-light text-ai inline-flex items-center justify-center">
            <CalendarRange size={20} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-ink leading-snug">Réunions proposées pour « {project.name} »</h2>
            <p className="text-sm text-ink-muted mt-0.5">
              {loading ? 'BlabIA lit le brief du projet…'
                : steps.length > 0 ? `${steps.length} réunion${steps.length > 1 ? 's' : ''} proposée${steps.length > 1 ? 's' : ''} : modifiez, réordonnez ou écartez-les avant de les ajouter.` : ''}
            </p>
          </div>
          <IconButton label="Fermer" size="sm" onClick={onClose}><X size={18} /></IconButton>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-ink-muted">
              <div className="w-8 h-8 border-2 border-ai border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Analyse du brief et préparation des réunions…</p>
            </div>
          )}

          {error && !loading && (
            <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between gap-3">
              <span>{error}</span>
              <button onClick={generate} className="text-sm font-bold underline shrink-0">Réessayer</button>
            </div>
          )}

          {done && (
            <div className="text-center py-10 space-y-3">
              <CheckCircle2 size={40} strokeWidth={1.75} className="mx-auto text-ok" aria-hidden="true" />
              <p className="text-base font-bold text-ink">{activeCount} réunion{activeCount > 1 ? 's' : ''} ajoutée{activeCount > 1 ? 's' : ''} au plan</p>
              <Button variant="secondary" onClick={onClose}>Fermer</Button>
            </div>
          )}

          {!loading && !done && steps.length > 0 && (
            <ol className="space-y-2">
              {steps.map((step, i) => (
                <li key={step._key}
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => handleDrop(i)}
                  className={`group flex items-start gap-3 rounded-2xl border p-4 transition ${
                    step.active ? 'border-line bg-white' : 'border-line bg-canvas opacity-60'
                  }`}>
                  <span className="hidden sm:flex mt-1 text-ink-faint cursor-grab active:cursor-grabbing" title="Glisser pour changer l'ordre" aria-hidden="true">
                    <GripVertical size={16} />
                  </span>
                  <span className="mt-0.5 w-7 h-7 shrink-0 rounded-full bg-action-light text-action text-xs font-extrabold inline-flex items-center justify-center">{i + 1}</span>
                  <div className="flex-1 min-w-0 space-y-2">
                    <input
                      type="text"
                      value={step.title}
                      onChange={e => updateStep(i, 'title', e.target.value)}
                      placeholder="Sujet de la réunion…"
                      aria-label={`Sujet de la réunion ${i + 1}`}
                      className="w-full text-[15px] font-bold text-ink border-0 border-b border-transparent hover:border-line focus:border-action outline-none bg-transparent py-0.5"
                    />
                    {step.description && <p className="text-sm text-ink-soft leading-relaxed">{step.description}</p>}
                    <MeetingTypePicker value={step.type || 'decision'} onChange={t => updateStep(i, 'type', t)} />
                  </div>
                  <div className="flex items-center shrink-0 -mr-1">
                    <IconButton size="sm" label={step.active ? 'Écarter cette réunion' : 'Garder cette réunion'} onClick={() => updateStep(i, 'active', !step.active)}>
                      {step.active ? <Eye size={16} /> : <EyeOff size={16} />}
                    </IconButton>
                    <IconButton size="sm" label="Supprimer" className="hover:!text-red-700" onClick={() => removeStep(i)}>
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                </li>
              ))}
              <li>
                <button onClick={() => insertAfter(steps.length - 1)}
                  className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl border border-dashed border-line text-sm font-bold text-ink-muted hover:text-action hover:border-action-border hover:bg-action-light transition">
                  <Plus size={16} aria-hidden="true" /> Ajouter une réunion
                </button>
              </li>
            </ol>
          )}
        </div>

        {!done && !loading && steps.length > 0 && (
          <div className="shrink-0 px-5 sm:px-6 py-4 border-t border-line space-y-2">
            {existingCount > 0 && (
              <p className="text-xs text-ink-muted text-center">
                {newCount} réunion{newCount > 1 ? 's' : ''} seront ajoutées — {existingCount} réunion{existingCount > 1 ? 's' : ''} existante{existingCount > 1 ? 's' : ''} conservée{existingCount > 1 ? 's' : ''}
              </p>
            )}
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <Button variant="secondary" onClick={onClose}>Annuler</Button>
              <Button variant="primary" onClick={handleAdd} disabled={adding || activeCount === 0}>
                {adding ? 'Ajout…' : <>Ajouter {activeCount} réunion{activeCount > 1 ? 's' : ''} au plan <ArrowRight size={16} aria-hidden="true" /></>}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
