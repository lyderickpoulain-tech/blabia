import { useState, useEffect, useMemo } from 'react';
import ToolsMap from './ToolsMap';
import ToolCostEditor from './ToolCostEditor';
import api from '../../utils/api';
import { useToolsCatalog, PROJECT_STATUS, USER_STATUS, costLabel, totalLabel } from '../../utils/toolsCatalog';

// v5.0 phase 4.3 : outils d'un projet = sélection parmi « Mes outils » +
// outils complémentaires (besoin, pourquoi, coût, statut suggéré/validé/refusé).

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `t${Date.now()}${Math.random().toString(16).slice(2)}`;
}

function ComplementaryCard({ tool, category, onChange, onRemove }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className={`border rounded-xl p-3 space-y-1.5 ${tool.status === 'refused' ? 'bg-gray-50 border-gray-100 opacity-70' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-base">{category?.icon}</span>
        <span className="text-sm font-semibold text-gray-900 flex-1 min-w-[120px]">{tool.name}</span>
        <span className={`text-[10px] font-medium border px-1.5 py-0.5 rounded-full ${PROJECT_STATUS[tool.status]?.cls}`}>{PROJECT_STATUS[tool.status]?.label}</span>
      </div>
      {tool.need && <p className="text-xs text-gray-700"><span className="text-gray-400">Besoin :</span> {tool.need}</p>}
      {tool.why && <p className="text-xs text-gray-600"><span className="text-gray-400">Pourquoi :</span> {tool.why}</p>}
      <p className="text-xs text-gray-500">
        💶 {costLabel(tool.cost)}
        {tool.cost?.freeTier && <span> · gratuit jusqu'à : {tool.cost.freeTier}</span>}
        {tool.priceSource
          ? <> · <a href={tool.priceSource} target="_blank" rel="noopener noreferrer" className="text-blabia-blue hover:underline">source</a></>
          : <span className="text-amber-600"> · indicatif, à vérifier</span>}
      </p>
      {editing && <ToolCostEditor cost={tool.cost} onChange={cost => onChange({ ...tool, cost })} />}
      <div className="flex gap-2 pt-1 flex-wrap">
        {tool.status !== 'validated' && (
          <button onClick={() => onChange({ ...tool, status: 'validated' })} className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg">Valider</button>
        )}
        {tool.status !== 'refused' && (
          <button onClick={() => onChange({ ...tool, status: 'refused' })} className="text-xs border border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-1 rounded-lg">Refuser</button>
        )}
        <button onClick={() => setEditing(e => !e)} className="text-xs text-gray-500 hover:text-gray-800 px-1">{editing ? 'Fermer' : 'Modifier le coût'}</button>
        <button onClick={onRemove} className="text-xs text-gray-300 hover:text-red-500 ml-auto">Supprimer</button>
      </div>
    </div>
  );
}

function AddComplementaryForm({ categories, onAdd, onCancel }) {
  const [form, setForm] = useState({ name: '', category: categories[0]?.id || 'devtools', need: '', why: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="border border-blue-100 bg-blue-50 rounded-xl p-3 space-y-2">
      <div className="flex gap-2 flex-wrap">
        <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nom de l'outil"
          className="flex-1 min-w-[140px] text-sm border border-gray-200 rounded-lg px-2 py-1 outline-none" />
        <select value={form.category} onChange={e => set('category', e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white outline-none">
          {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
        </select>
      </div>
      <input value={form.need} onChange={e => set('need', e.target.value)} placeholder="Besoin couvert"
        className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1 outline-none" />
      <input value={form.why} onChange={e => set('why', e.target.value)} placeholder="Pourquoi cet outil"
        className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1 outline-none" />
      <div className="flex gap-2">
        <button
          disabled={!form.name.trim()}
          onClick={() => onAdd({
            id: newId(), catalogId: null, name: form.name.trim(), category: form.category, origin: 'complementary',
            status: 'suggested', need: form.need.trim(), why: form.why.trim(),
            cost: { type: 'free', monthlyMin: 0, monthlyMax: 0, freeTier: null }, priceSource: null, sessionId: null,
          })}
          className="text-xs bg-blabia-blue text-white px-3 py-1.5 rounded-lg disabled:opacity-40"
        >
          Ajouter
        </button>
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
      </div>
    </div>
  );
}

export default function ProjectToolsPanel({ projectId, onClose, onChanged }) {
  const { catalog } = useToolsCatalog();
  const [tools, setTools]       = useState(null);
  const [myTools, setMyTools]   = useState([]);
  const [total, setTotal]       = useState({ min: 0, max: 0 });
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [adding, setAdding]     = useState(false);
  const [pickMine, setPickMine] = useState('');

  useEffect(() => {
    Promise.all([api.get(`/projects/${projectId}/tools`), api.get('/tools/me')])
      .then(([{ data: p }, { data: mine }]) => {
        setTools(p.tools || []);
        setTotal(p.total || { min: 0, max: 0 });
        setMyTools(Array.isArray(mine) ? mine : []);
      })
      .catch(() => setError('Impossible de charger les outils du projet.'));
  }, [projectId]);

  const save = async (next) => {
    setTools(next);
    setSaving(true);
    setError('');
    try {
      const { data } = await api.put(`/projects/${projectId}/tools`, { tools: next });
      setTotal(data.total);
      onChanged?.(next);
    } catch {
      setError('Erreur lors de l\'enregistrement');
    }
    setSaving(false);
  };

  const catById = useMemo(() => Object.fromEntries((catalog?.categories || []).map(c => [c.id, c])), [catalog]);
  const roleById = useMemo(() => Object.fromEntries((catalog?.tools || []).map(t => [t.id, t.role])), [catalog]);

  if (!catalog || tools === null) {
    return (
      <Shell onClose={onClose}>
        {error ? <p className="text-sm text-red-600">{error}</p>
          : <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blabia-blue border-t-transparent rounded-full animate-spin" /></div>}
      </Shell>
    );
  }

  const mine = tools.filter(t => t.origin === 'mine');
  const complementary = tools.filter(t => t.origin === 'complementary');
  const notYetPicked = myTools.filter(m => !mine.some(t => (t.catalogId && t.catalogId === m.catalogId) || t.name === m.name));

  const update = (u) => save(tools.map(t => t.id === u.id ? u : t));
  const remove = (id) => save(tools.filter(t => t.id !== id));

  const addMine = () => {
    const m = myTools.find(x => x.id === pickMine);
    if (!m) return;
    save([...tools, {
      id: newId(), catalogId: m.catalogId, name: m.name, category: m.category, origin: 'mine', status: 'validated',
      need: '', why: '', cost: m.cost, priceSource: null, sessionId: null,
    }]);
    setPickMine('');
  };

  const mapItems = tools.filter(t => t.status !== 'refused').map(t => ({
    key: t.id, name: t.name, category: t.category, dashed: t.status === 'suggested',
    detail: {
      role: t.why || roleById[t.catalogId],
      cost: costLabel(t.cost),
      status: PROJECT_STATUS[t.status]?.label,
    },
  }));

  return (
    <Shell onClose={onClose} saving={saving}>
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
        <span className="text-sm text-gray-600">Total mensuel estimé (outils validés)</span>
        <span className="text-base font-bold text-gray-900">{totalLabel(total)}</span>
      </div>

      <ToolsMap catalog={catalog} items={mapItems} />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Mes outils retenus pour ce projet</h3>
        {mine.length === 0 && <p className="text-xs text-gray-400">Aucun pour l'instant.</p>}
        {mine.map(t => (
          <div key={t.id} className="flex items-center gap-2 border border-gray-100 rounded-lg px-3 py-2 bg-white">
            <span>{catById[t.category]?.icon}</span>
            <span className="text-sm text-gray-900 flex-1">{t.name}</span>
            <span className="text-xs text-gray-400 hidden sm:inline">{catById[t.category]?.label}</span>
            <span className="text-xs text-gray-500">{costLabel(t.cost)}</span>
            <button onClick={() => remove(t.id)} className="text-xs text-gray-300 hover:text-red-500" title="Retirer du projet">✕</button>
          </div>
        ))}
        {notYetPicked.length > 0 ? (
          <div className="flex gap-2">
            <select value={pickMine} onChange={e => setPickMine(e.target.value)}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none">
              <option value="">Ajouter un de mes outils…</option>
              {notYetPicked.map(m => (
                <option key={m.id} value={m.id}>{m.name} — {catById[m.category]?.label} ({USER_STATUS[m.status]?.label})</option>
              ))}
            </select>
            <button onClick={addMine} disabled={!pickMine} className="text-xs bg-blabia-blue text-white px-3 rounded-lg disabled:opacity-40">Ajouter</button>
          </div>
        ) : (
          <p className="text-xs text-gray-400">Tous vos outils sont déjà retenus — complétez la liste dans <a href="/outils" className="text-blabia-blue hover:underline">Mes outils</a>.</p>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Outils complémentaires</h3>
          {!adding && <button onClick={() => setAdding(true)} className="text-xs text-blabia-blue hover:underline">+ Ajouter</button>}
        </div>
        <p className="text-xs text-gray-400">Proposés par les agents (réunion de type « Outils ») ou ajoutés à la main.</p>
        {adding && (
          <AddComplementaryForm categories={catalog.categories} onCancel={() => setAdding(false)}
            onAdd={t => { save([...tools, t]); setAdding(false); }} />
        )}
        {complementary.length === 0 && !adding && <p className="text-xs text-gray-400">Aucun pour l'instant.</p>}
        {complementary.map(t => (
          <ComplementaryCard key={t.id} tool={t} category={catById[t.category]} onChange={update} onRemove={() => remove(t.id)} />
        ))}
      </section>
    </Shell>
  );
}

function Shell({ children, onClose, saving }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-4xl max-h-[92vh] flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-bold text-gray-900 flex-1">🧰 Outils du projet</h2>
          {saving && <span className="text-xs text-gray-400">Enregistrement…</span>}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">{children}</div>
      </div>
    </div>
  );
}
