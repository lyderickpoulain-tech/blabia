import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

// ── Composant principal ────────────────────────────────────────────────────────
export default function StackCheckModal({ milestone, projectId, onClose, onRefresh }) {
  const navigate = useNavigate();

  // Initialiser les items depuis milestone.checklistData
  const initialItems = (() => {
    const raw = milestone.checklistData;
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed.items) ? parsed.items : [];
  })();

  const [items, setItems]           = useState(initialItems);
  const [showMissing, setShowMissing] = useState(false);
  const [missingText, setMissingText] = useState('');
  const [saving, setSaving]         = useState(false);

  // ── Grouper les items par catégorie ────────────────────────────────────────
  const groups = items.reduce((acc, item) => {
    const cat = item.category || 'Autre';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const checkedCount = items.filter(i => i.checked).length;
  const pct = items.length > 0 ? Math.round((checkedCount / items.length) * 100) : 0;

  // ── Sauvegarder la checklist ───────────────────────────────────────────────
  const saveChecklist = useCallback(async (newItems, finalStatus = null) => {
    setSaving(true);
    try {
      await api.patch(`/projects/${projectId}/milestones/${milestone.id}/checklist`, {
        items: newItems,
        ...(finalStatus ? { finalStatus } : {})
      });
      onRefresh?.();
    } catch {}
    setSaving(false);
  }, [projectId, milestone.id, onRefresh]);

  // ── Toggle checkbox ────────────────────────────────────────────────────────
  const toggleItem = async (id) => {
    const newItems = items.map(i => i.id === id ? { ...i, checked: !i.checked } : i);
    setItems(newItems);
    await saveChecklist(newItems);
  };

  // ── Modifier les notes (local seulement, sauvegarde à l'action finale) ─────
  const updateNotes = (id, notes) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, notes } : i));
  };

  // ── Marquer comme vérifié ─────────────────────────────────────────────────
  const handleMarkDone = async () => {
    await saveChecklist(items, 'done');
    onClose();
  };

  // ── Des outils manquent → bloquer + créer réunion ──────────────────────────
  const handleMissingConfirm = async () => {
    await saveChecklist(items, 'blocked');
    const task = missingText.trim()
      ? `Résoudre les outils manquants : ${missingText.trim()}`
      : 'Résoudre les outils manquants de la stack';
    onClose();
    navigate(`/projects/${projectId}/session/new`, {
      state: { initialTask: task, milestoneId: milestone.id }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col">

        {/* En-tête */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <span className="text-2xl">🔧</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900">Vérification de la stack</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{milestone.title}</p>
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition">
            ×
          </button>
        </div>

        {/* Barre de progression */}
        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>{checkedCount}/{items.length} outil{items.length !== 1 ? 's' : ''} vérifié{checkedCount !== 1 ? 's' : ''}</span>
            <span className="font-medium">{pct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Checklist groupée */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {items.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">Aucun outil à vérifier</p>
              <p className="text-xs text-gray-300 mt-1">La checklist se remplit automatiquement depuis la stack et les sessions</p>
            </div>
          ) : Object.entries(groups).map(([category, catItems]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">
                {category}
              </h3>
              <div className="space-y-2">
                {catItems.map(item => (
                  <div key={item.id}
                    className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition ${
                      item.checked ? 'bg-green-50 border border-green-100' : 'bg-gray-50 border border-transparent'
                    }`}>
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleItem(item.id)}
                      className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition shrink-0 ${
                        item.checked
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-gray-300 hover:border-green-400 bg-white'
                      }`}
                    >
                      {item.checked && (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium leading-snug ${
                        item.checked ? 'text-green-800' : 'text-gray-800'
                      }`}>
                        {item.label}
                        {item.checked && <span className="ml-1.5 text-green-500 text-xs">✓</span>}
                      </p>
                      <input
                        type="text"
                        value={item.notes}
                        onChange={e => updateNotes(item.id, e.target.value)}
                        onBlur={() => saveChecklist(items)}
                        placeholder="Notes (optionnel)…"
                        className="mt-1 w-full text-xs bg-transparent border-0 border-b border-gray-200 focus:border-blue-400 outline-none py-0.5 text-gray-500 placeholder-gray-300 transition"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="shrink-0 px-5 py-4 border-t border-gray-100 space-y-2">
          {!showMissing ? (
            <div className="flex gap-2">
              <button onClick={handleMarkDone} disabled={saving}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-50 flex items-center justify-center gap-1.5">
                ✅ Marquer comme vérifié
              </button>
              <button onClick={() => setShowMissing(true)}
                className="flex-1 border border-orange-300 text-orange-700 hover:bg-orange-50 font-medium py-2.5 rounded-xl text-sm transition">
                ⚠️ Des outils manquent
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 block">
                Quels outils manquent ?
              </label>
              <textarea
                value={missingText}
                onChange={e => setMissingText(e.target.value)}
                autoFocus
                placeholder="Ex : système de paiement, CDN, monitoring…"
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-orange-400 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowMissing(false)}
                  className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 py-2.5 rounded-xl text-sm transition font-medium">
                  Annuler
                </button>
                <button onClick={handleMissingConfirm} disabled={saving}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-50">
                  Créer une réunion →
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
