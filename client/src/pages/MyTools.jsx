import { useState, useEffect, useRef, useMemo } from 'react';
import Layout from '../components/Layout';
import ToolsMap from '../components/tools/ToolsMap';
import ToolCostEditor from '../components/tools/ToolCostEditor';
import api from '../utils/api';
import { useToolsCatalog, USER_STATUS, costLabel } from '../utils/toolsCatalog';

// v5.0 phase 4.1 : « Mes outils » — fusion de l'ancienne page Environnement
// (User.techStack) et de la Boîte à outils (User.toolbox) dans User.tools.

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `t${Date.now()}${Math.random().toString(16).slice(2)}`;
}

function ToolRow({ tool, catalogTool, onChange, onRemove }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="border border-gray-100 rounded-lg px-3 py-2 bg-white">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-900 flex-1 min-w-[120px]">{tool.name}</span>
        <span className="text-xs text-gray-500">{costLabel(tool.cost)}</span>
        <select
          value={tool.status}
          onChange={e => onChange({ ...tool, status: e.target.value })}
          className={`text-xs border rounded-full px-2 py-0.5 outline-none ${USER_STATUS[tool.status]?.cls || ''}`}
        >
          {Object.entries(USER_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
        </select>
        <button onClick={() => setEditing(e => !e)} className="text-xs text-gray-400 hover:text-gray-700" title="Coût et note">✏️</button>
        <button onClick={onRemove} className="text-xs text-gray-300 hover:text-red-500" title="Retirer">🗑</button>
      </div>
      {catalogTool?.role && <p className="text-xs text-gray-400 mt-0.5">{catalogTool.role}</p>}
      {tool.note && !editing && <p className="text-xs text-gray-600 mt-1 italic">📝 {tool.note}</p>}
      {editing && (
        <div className="mt-2 space-y-2">
          <ToolCostEditor cost={tool.cost} onChange={cost => onChange({ ...tool, cost })} />
          <textarea
            value={tool.note || ''}
            onChange={e => onChange({ ...tool, note: e.target.value })}
            placeholder="Note libre (ex. compte pro, identifiant, limite atteinte…)"
            rows={2}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-300 resize-none"
          />
        </div>
      )}
    </div>
  );
}

function AddToolForm({ category, catalogTools, existing, onAdd, onCancel }) {
  const [choice, setChoice] = useState('');
  const [customName, setCustomName] = useState('');
  const available = catalogTools.filter(t => !existing.some(e => e.catalogId === t.id));

  const submit = () => {
    if (choice && choice !== '__custom') {
      const t = catalogTools.find(x => x.id === choice);
      onAdd({ id: newId(), catalogId: t.id, name: t.name, category: category.id, cost: { ...t.cost }, status: 'using', note: '' });
    } else if (customName.trim()) {
      onAdd({ id: newId(), catalogId: null, name: customName.trim(), category: category.id, cost: { type: 'free', monthlyMin: 0, monthlyMax: 0, freeTier: null }, status: 'using', note: '' });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg p-2">
      <select
        value={choice}
        onChange={e => setChoice(e.target.value)}
        className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white outline-none flex-1 min-w-[160px]"
      >
        <option value="">Choisir un outil…</option>
        {available.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        <option value="__custom">Autre (saisie libre)…</option>
      </select>
      {choice === '__custom' && (
        <input
          autoFocus
          value={customName}
          onChange={e => setCustomName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Nom de l'outil"
          className="text-sm border border-gray-200 rounded-lg px-2 py-1 outline-none flex-1 min-w-[140px]"
        />
      )}
      <button
        onClick={submit}
        disabled={!choice || (choice === '__custom' && !customName.trim())}
        className="text-xs bg-blabia-blue text-white px-3 py-1.5 rounded-lg disabled:opacity-40"
      >
        Ajouter
      </button>
      <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
    </div>
  );
}

export default function MyTools() {
  const { catalog, error: catalogError } = useToolsCatalog();
  const [tools, setTools]     = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [addingCat, setAddingCat] = useState(null);
  const [showEmpty, setShowEmpty] = useState(true);
  const loaded = useRef(false);

  useEffect(() => {
    api.get('/tools/me')
      .then(({ data }) => setTools(Array.isArray(data) ? data : []))
      .catch(() => setLoadError('Impossible de charger vos outils.'));
  }, []);

  // Enregistrement automatique (débounce) après chaque modification
  useEffect(() => {
    if (tools === null) return;
    if (!loaded.current) { loaded.current = true; return; }
    setSaveState('saving');
    const t = setTimeout(() => {
      api.put('/tools/me', { tools })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, 600);
    return () => clearTimeout(t);
  }, [tools]);

  const catalogById = useMemo(
    () => Object.fromEntries((catalog?.tools || []).map(t => [t.id, t])),
    [catalog]
  );

  const updateTool = (updated) => setTools(prev => prev.map(t => t.id === updated.id ? updated : t));
  const removeTool = (id) => setTools(prev => prev.filter(t => t.id !== id));
  const addTool    = (tool) => { setTools(prev => [...prev, tool]); setAddingCat(null); };

  const mapItems = (tools || []).map(t => ({
    key: t.id, name: t.name, category: t.category, dashed: t.status === 'to_try',
    detail: {
      role: catalogById[t.catalogId]?.role,
      cost: costLabel(t.cost),
      status: USER_STATUS[t.status]?.label,
    },
  }));

  const ready = catalog && tools;

  return (
    <Layout wide>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🧰 Mes outils</h1>
            <p className="text-sm text-gray-500 mt-1">
              Les outils que vous utilisez ou envisagez, tous projets confondus. Les agents en tiennent compte pour vous conseiller.
            </p>
          </div>
          <span className="text-xs text-gray-400 pt-2">
            {saveState === 'saving' && 'Enregistrement…'}
            {saveState === 'saved' && '✓ Enregistré'}
            {saveState === 'error' && <span className="text-red-500">Erreur d'enregistrement</span>}
          </span>
        </div>

        {(catalogError || loadError) && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{catalogError || loadError}</div>
        )}

        {!ready && !catalogError && !loadError && (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blabia-blue border-t-transparent rounded-full animate-spin" /></div>
        )}

        {ready && (
          <>
            <section className="bg-white rounded-2xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">Comment vos outils s'articulent</h2>
              <p className="text-xs text-gray-400 mb-3">Cliquez sur un outil pour sa fiche. En pointillé : outils « à essayer » ou catégories vides.</p>
              <ToolsMap catalog={catalog} items={mapItems} />
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">Par catégorie</h2>
                <label className="text-xs text-gray-500 flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={showEmpty} onChange={e => setShowEmpty(e.target.checked)} />
                  Afficher les catégories vides
                </label>
              </div>

              {catalog.categories.map(cat => {
                const list = tools.filter(t => t.category === cat.id);
                if (!showEmpty && list.length === 0 && addingCat !== cat.id) return null;
                return (
                  <div key={cat.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-xl leading-none">{cat.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {cat.label} <span className="text-xs font-normal text-gray-400">· {cat.technical}</span>
                        </p>
                        <p className="text-xs text-gray-500">{cat.explanation}</p>
                      </div>
                      {addingCat !== cat.id && (
                        <button onClick={() => setAddingCat(cat.id)} className="text-xs text-blabia-blue hover:underline shrink-0">+ Ajouter</button>
                      )}
                    </div>
                    {list.map(t => (
                      <ToolRow key={t.id} tool={t} catalogTool={catalogById[t.catalogId]} onChange={updateTool} onRemove={() => removeTool(t.id)} />
                    ))}
                    {addingCat === cat.id && (
                      <AddToolForm
                        category={cat}
                        catalogTools={catalog.tools.filter(t => t.category === cat.id)}
                        existing={list}
                        onAdd={addTool}
                        onCancel={() => setAddingCat(null)}
                      />
                    )}
                  </div>
                );
              })}
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
