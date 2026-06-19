import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../utils/api';
import { TOOLBOX_CATEGORIES, PRICING_CONFIG, buildIncompatMap } from '../utils/techStack';

const INCOMPAT_MAP = buildIncompatMap(TOOLBOX_CATEGORIES);

const STATUS_OPTS = [
  { value: 'owned',      label: 'Possédé ✓' },
  { value: 'planned',    label: 'Prévu' },
  { value: 'evaluating', label: "J'évalue" },
];

const STATUS_BADGE = {
  owned:      { label: 'Possédé',  cls: 'bg-green-100 text-green-700 border-green-200' },
  planned:    { label: 'Prévu',    cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  evaluating: { label: "J'évalue", cls: 'bg-gray-100 text-gray-500 border-gray-200' },
};

const FILTERS = [
  { id: 'all',       label: 'Tous' },
  { id: 'essential', label: 'Essentiels' },
  { id: 'advanced',  label: 'Avancés' },
  { id: 'free',      label: 'Gratuits' },
];

function findToolLabel(toolId) {
  for (const cat of TOOLBOX_CATEGORIES) {
    const t = cat.tools.find(t => t.id === toolId);
    if (t) return t.label;
  }
  return toolId;
}

function CategoryCard({ category, toolbox, allSelectedIds, onSelect, onSetStatus, onAddCustom, onRemoveCustom }) {
  const selectedId     = toolbox[category.id]?.selected;
  const selectedStatus = toolbox[category.id]?.status || 'owned';
  const customList     = toolbox[`_custom_${category.id}`] || [];
  const [showAdd, setShowAdd] = useState(false);
  const [addInput, setAddInput] = useState('');

  const customTools = customList.map(t => ({
    ...t,
    pricing: null, pricingDetail: null, role: null,
    compatibleWith: [], incompatibleWith: [],
    recommended: false, complexity: null, isCustom: true,
  }));

  const allTools = [...category.tools, ...customTools];

  const getIncompatLabel = (toolId) => {
    const incompat = INCOMPAT_MAP.get(toolId) || new Set();
    for (const selId of allSelectedIds) {
      if (selId === toolId) continue;
      if (incompat.has(selId)) return findToolLabel(selId);
    }
    return null;
  };

  const handleAdd = () => {
    if (!addInput.trim()) return;
    onAddCustom(category.id, addInput.trim());
    setAddInput('');
    setShowAdd(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      {/* En-tête catégorie */}
      <div className="flex items-start gap-3 mb-4">
        <span className="text-xl shrink-0">{category.icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-gray-900 text-sm">{category.label}</h2>
            {category.required && (
              <span className="text-xs font-medium bg-blue-50 text-blabia-blue border border-blue-200 px-1.5 py-0.5 rounded-full">
                Obligatoire
              </span>
            )}
            {selectedId && STATUS_BADGE[selectedStatus] && (
              <span className={`text-xs font-medium border px-1.5 py-0.5 rounded-full ${STATUS_BADGE[selectedStatus].cls}`}>
                {STATUS_BADGE[selectedStatus].label}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{category.categoryDescription}</p>
        </div>
      </div>

      {/* Liste des outils */}
      <div className="space-y-2">
        {allTools.map(tool => {
          const isSelected    = selectedId === tool.id;
          const incompatLabel = !isSelected ? getIncompatLabel(tool.id) : null;

          return (
            <div
              key={tool.id}
              onClick={() => onSelect(category.id, tool.id)}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                isSelected
                  ? 'bg-blue-50 border-blue-300'
                  : incompatLabel
                    ? 'bg-red-50 border-red-100 opacity-60'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
              }`}
            >
              {/* Bouton radio */}
              <div className={`shrink-0 w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center ${
                isSelected ? 'border-blabia-blue bg-blabia-blue' : 'border-gray-300 bg-white'
              }`}>
                {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
              </div>

              <div className="flex-1 min-w-0">
                {/* Ligne badges */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">{tool.label}</span>
                  {tool.recommended && (
                    <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">
                      ⭐ Recommandé
                    </span>
                  )}
                  {tool.pricing && PRICING_CONFIG[tool.pricing] && (
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${PRICING_CONFIG[tool.pricing].color}`}>
                      {PRICING_CONFIG[tool.pricing].dot} {PRICING_CONFIG[tool.pricing].label}
                    </span>
                  )}
                  {tool.complexity === 'advanced' && (
                    <span className="text-xs text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full">
                      Avancé
                    </span>
                  )}
                  {incompatLabel && (
                    <span className="text-xs text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                      ⚠️ Incompatible avec {incompatLabel}
                    </span>
                  )}
                  {tool.isCustom && (
                    <button
                      onClick={e => { e.stopPropagation(); onRemoveCustom(category.id, tool.id); }}
                      className="text-xs text-gray-400 hover:text-red-500 transition ml-1"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Rôle vulgarisé */}
                {tool.role && (
                  <p className="text-xs text-gray-500 mt-0.5">{tool.role}</p>
                )}

                {/* Détail prix si sélectionné */}
                {isSelected && tool.pricingDetail && (
                  <p className="text-xs text-gray-400 mt-0.5">{tool.pricingDetail}</p>
                )}

                {/* Dropdown statut si sélectionné */}
                {isSelected && (
                  <div className="flex items-center gap-2 mt-2" onClick={e => e.stopPropagation()}>
                    <span className="text-xs text-gray-500">J'utilise →</span>
                    <select
                      value={selectedStatus}
                      onChange={e => onSetStatus(category.id, e.target.value)}
                      className="text-xs border border-blue-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blabia-blue cursor-pointer"
                    >
                      {STATUS_OPTS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Ajouter outil non listé */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        {showAdd ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={addInput}
              onChange={e => setAddInput(e.target.value)}
              placeholder="Nom de l'outil…"
              autoFocus
              className="flex-1 text-xs border border-gray-300 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-blabia-blue"
              onKeyDown={e => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') { setShowAdd(false); setAddInput(''); }
              }}
            />
            <button
              onClick={handleAdd}
              className="text-xs bg-blabia-blue text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition"
            >
              Ajouter
            </button>
            <button
              onClick={() => { setShowAdd(false); setAddInput(''); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="text-xs text-gray-400 hover:text-blabia-blue transition flex items-center gap-1"
          >
            + Ajouter un outil non listé
          </button>
        )}
      </div>
    </div>
  );
}

export default function MyToolbox() {
  const [toolbox, setToolbox]   = useState({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');
  const [filter, setFilter]     = useState('all');
  const saveTimerRef            = useRef(null);
  const isFirstLoad             = useRef(true);

  useEffect(() => {
    api.get('/users/me/toolbox')
      .then(({ data }) => setToolbox(data || {}))
      .catch(() => setToolbox({}))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (isFirstLoad.current) { isFirstLoad.current = false; return; }
    setSaved(false);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      setError('');
      try {
        await api.patch('/users/me/toolbox', { toolbox });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch { setError('Erreur lors de la sauvegarde — réessayez.'); }
      finally { setSaving(false); }
    }, 1000);
    return () => clearTimeout(saveTimerRef.current);
  }, [toolbox, loading]);

  // Ensemble de tous les IDs d'outils sélectionnés (toutes catégories)
  const allSelectedIds = new Set(
    TOOLBOX_CATEGORIES.map(cat => toolbox[cat.id]?.selected).filter(Boolean)
  );

  const handleSelect = (catId, toolId) => {
    setToolbox(prev => {
      if (prev[catId]?.selected === toolId) {
        const next = { ...prev };
        delete next[catId];
        return next;
      }
      return { ...prev, [catId]: { selected: toolId, status: prev[catId]?.status || 'owned' } };
    });
  };

  const handleSetStatus = (catId, status) => {
    setToolbox(prev => ({
      ...prev,
      [catId]: { ...(prev[catId] || {}), status }
    }));
  };

  const handleAddCustom = (catId, name) => {
    const key = `_custom_${catId}`;
    setToolbox(prev => {
      const existing = prev[key] || [];
      if (existing.some(t => t.name.toLowerCase() === name.toLowerCase())) return prev;
      return { ...prev, [key]: [...existing, { id: `c${Date.now()}`, name }] };
    });
  };

  const handleRemoveCustom = (catId, toolId) => {
    const key = `_custom_${catId}`;
    setToolbox(prev => {
      const next = { ...prev, [key]: (prev[key] || []).filter(t => t.id !== toolId) };
      if (next[catId]?.selected === toolId) delete next[catId];
      return next;
    });
  };

  const getFilteredTools = (cat) => {
    const selectedId = toolbox[cat.id]?.selected;
    if (filter === 'advanced') return cat.tools.filter(t => t.complexity === 'advanced' || t.id === selectedId);
    if (filter === 'free')     return cat.tools.filter(t => t.pricing === 'gratuit'       || t.id === selectedId);
    return cat.tools;
  };

  const visibleCategories = TOOLBOX_CATEGORIES
    .filter(cat => filter !== 'essential' || cat.required)
    .map(cat => ({ ...cat, tools: getFilteredTools(cat) }))
    .filter(cat => {
      if (filter === 'all' || filter === 'essential') return true;
      const custom = toolbox[`_custom_${cat.id}`] || [];
      return cat.tools.length > 0 || custom.length > 0;
    });

  const selectedCount = TOOLBOX_CATEGORIES.filter(cat => toolbox[cat.id]?.selected).length;

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-blabia-blue border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <Link to="/dashboard" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-5">
          ← Tableau de bord
        </Link>

        {/* En-tête */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Ma boîte à outils</h1>
              <p className="text-sm text-gray-500 mt-1">
                Sélectionne les outils que tu utilises — ils guideront les suggestions et les exports Claude Code.
              </p>
            </div>
            <div className="shrink-0 text-right">
              {saving && (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">
                  <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                  Sauvegarde…
                </span>
              )}
              {saved && !saving && (
                <span className="inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
                  ✓ Sauvegardé
                </span>
              )}
            </div>
          </div>
          {selectedCount > 0 && (
            <div className="mt-3 text-xs text-blabia-blue flex items-center gap-1.5">
              ✅ <span>{selectedCount} outil{selectedCount > 1 ? 's' : ''} configuré{selectedCount > 1 ? 's' : ''}</span>
            </div>
          )}
          {error && (
            <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Filtres */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`text-sm font-medium px-4 py-2 rounded-xl border transition ${
                filter === f.id
                  ? 'bg-blabia-blue text-white border-blabia-blue'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Catégories */}
        <div className="space-y-4">
          {visibleCategories.map(cat => (
            <CategoryCard
              key={cat.id}
              category={cat}
              toolbox={toolbox}
              allSelectedIds={allSelectedIds}
              onSelect={handleSelect}
              onSetStatus={handleSetStatus}
              onAddCustom={handleAddCustom}
              onRemoveCustom={handleRemoveCustom}
            />
          ))}
        </div>

        {visibleCategories.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">
            Aucun outil ne correspond à ce filtre.
          </div>
        )}

        <p className="text-xs text-gray-400 text-center mt-6 pb-4">
          Les modifications sont sauvegardées automatiquement.
        </p>
      </div>
    </Layout>
  );
}
