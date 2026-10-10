import { useState, useEffect } from 'react';
import api from '../utils/api';

// Registre des décisions du projet : ce qui est tranché (les agents ne le
// redemandent pas) ; l'humain peut modifier, remettre en question ou supprimer.

const fmtDate = d => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

function DecisionItem({ decision, onPatch, onDelete }) {
  const [mode, setMode] = useState(null); // null | 'edit' | 'reopen'
  const [statement, setStatement] = useState(decision.statement);
  const [rationale, setRationale] = useState(decision.rationale || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => { setBusy(true); try { await fn(); setMode(null); } finally { setBusy(false); } };
  const reopened = decision.status === 'reopened';
  const superseded = decision.status === 'superseded';

  return (
    <div className={`border rounded-xl p-3 space-y-1.5 ${
      reopened ? 'border-amber-300 bg-amber-50/60' : superseded ? 'border-gray-100 bg-gray-50 opacity-70' : 'border-gray-200 bg-white'
    }`}>
      {mode === 'edit' ? (
        <div className="space-y-1.5">
          <input value={statement} onChange={e => setStatement(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-300" />
          <input value={rationale} onChange={e => setRationale(e.target.value)} placeholder="Pourquoi (optionnel)"
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-300" />
          <div className="flex gap-2">
            <button disabled={busy || !statement.trim()} onClick={() => run(() => onPatch(decision.id, { statement, rationale }))}
              className="text-xs bg-blabia-blue text-white px-3 py-1 rounded-lg disabled:opacity-40">Enregistrer</button>
            <button onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
          </div>
        </div>
      ) : (
        <>
          <p className={`text-sm text-gray-900 ${superseded ? 'line-through' : ''}`}>{decision.statement}</p>
          {decision.rationale && <p className="text-xs text-gray-600">{decision.rationale}</p>}
          {decision.rejectedOptions?.length > 0 && <p className="text-[11px] text-gray-400">Écarté : {decision.rejectedOptions.join(', ')}</p>}
          {reopened && (
            <p className="text-xs text-amber-800">⚠️ Remise en question{decision.reopenNote ? ` : ${decision.reopenNote}` : ''} — les agents la retraiteront à la prochaine réunion concernée.</p>
          )}
          <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-400">
            <span className={`font-medium px-1.5 py-0.5 rounded-full ${decision.origin === 'human' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
              {decision.origin === 'human' ? 'Votre arbitrage' : 'Hypothèse des agents'}
            </span>
            <span>{fmtDate(decision.createdAt)}</span>
            {decision.sessionTask && <span className="truncate max-w-[220px]">· {decision.sessionTask}</span>}
          </div>
        </>
      )}

      {mode === 'reopen' && (
        <div className="space-y-1.5">
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} autoFocus
            placeholder="Pourquoi la remettre en question ? (les agents en tiendront compte)"
            className="w-full text-xs border border-amber-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-amber-300 resize-none" />
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => run(() => onPatch(decision.id, { status: 'reopened', reopenNote: note }))}
              className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-lg disabled:opacity-40">Remettre en question</button>
            <button onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
          </div>
        </div>
      )}

      {mode === null && (
        <div className="flex gap-3 flex-wrap text-xs pt-0.5">
          {decision.status === 'active' && (
            <button onClick={() => setMode('reopen')} className="text-amber-700 hover:underline">Remettre en question</button>
          )}
          {decision.status !== 'active' && (
            <button disabled={busy} onClick={() => run(() => onPatch(decision.id, { status: 'active' }))} className="text-green-700 hover:underline">Rétablir</button>
          )}
          {decision.status === 'reopened' && (
            <button disabled={busy} onClick={() => run(() => onPatch(decision.id, { status: 'superseded' }))} className="text-gray-500 hover:underline">Marquer comme remplacée</button>
          )}
          <button onClick={() => setMode('edit')} className="text-blabia-blue hover:underline">Modifier</button>
          <button disabled={busy} onClick={() => { if (confirm('Supprimer cette décision du registre ?')) run(() => onDelete(decision.id)); }}
            className="text-gray-300 hover:text-red-500 ml-auto">Supprimer</button>
        </div>
      )}
    </div>
  );
}

export default function DecisionRegistryPanel({ projectId, onChanged }) {
  const [decisions, setDecisions] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [newStatement, setNewStatement] = useState('');
  const [newRationale, setNewRationale] = useState('');
  const [showSuperseded, setShowSuperseded] = useState(false);

  const load = () => api.get(`/projects/${projectId}/decisions`)
    .then(({ data }) => { setDecisions(data); onChanged?.(data); })
    .catch(() => setError('Impossible de charger le registre des décisions.'));

  useEffect(() => { load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (id, body) => {
    try { await api.patch(`/projects/${projectId}/decisions/${id}`, body); await load(); }
    catch (err) { setError(err.response?.data?.error || 'Erreur lors de la modification'); }
  };
  const remove = async (id) => {
    try { await api.delete(`/projects/${projectId}/decisions/${id}`); await load(); }
    catch { setError('Erreur lors de la suppression'); }
  };
  const add = async () => {
    try {
      await api.post(`/projects/${projectId}/decisions`, { statement: newStatement, rationale: newRationale });
      setNewStatement(''); setNewRationale(''); setAdding(false);
      await load();
    } catch (err) { setError(err.response?.data?.error || 'Erreur lors de l\'ajout'); }
  };

  const reopened   = (decisions || []).filter(d => d.status === 'reopened');
  const active     = (decisions || []).filter(d => d.status === 'active');
  const superseded = (decisions || []).filter(d => d.status === 'superseded');

  return (
    <div>
      <div>
        <div className="space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          {adding ? (
            <div className="border border-blue-100 bg-blue-50 rounded-xl p-3 space-y-2">
              <input autoFocus value={newStatement} onChange={e => setNewStatement(e.target.value)} placeholder="La décision, en une phrase"
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1 outline-none bg-white" />
              <input value={newRationale} onChange={e => setNewRationale(e.target.value)} placeholder="Pourquoi (optionnel)"
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none bg-white" />
              <div className="flex gap-2">
                <button onClick={add} disabled={!newStatement.trim()} className="text-xs bg-blabia-blue text-white px-3 py-1.5 rounded-lg disabled:opacity-40">Ajouter au registre</button>
                <button onClick={() => setAdding(false)} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="text-xs text-blabia-blue hover:underline">+ Ajouter une décision</button>
          )}

          {decisions === null && !error && (
            <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-blabia-blue border-t-transparent rounded-full animate-spin" /></div>
          )}

          {decisions && decisions.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">Aucune décision pour l'instant. Elles s'ajoutent à la clôture de chaque réunion, après votre validation.</p>
          )}

          {reopened.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Remises en question ({reopened.length})</h3>
              {reopened.map((d, i) => <div key={d.id} data-tour={i === 0 ? 'dec-reopened' : undefined}><DecisionItem decision={d} onPatch={patch} onDelete={remove} /></div>)}
            </section>
          )}

          {active.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Décisions en vigueur ({active.length})</h3>
              {active.map(d => <DecisionItem key={d.id} decision={d} onPatch={patch} onDelete={remove} />)}
            </section>
          )}

          {superseded.length > 0 && (
            <section className="space-y-2">
              <button onClick={() => setShowSuperseded(s => !s)} className="text-xs text-gray-500 hover:text-gray-800">
                {showSuperseded ? '▲' : '▼'} Remplacées ({superseded.length})
              </button>
              {showSuperseded && superseded.map(d => <DecisionItem key={d.id} decision={d} onPatch={patch} onDelete={remove} />)}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
