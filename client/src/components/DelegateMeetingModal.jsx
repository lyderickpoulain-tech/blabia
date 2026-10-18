import { useEffect, useState } from 'react';
import { X, Plus } from 'lucide-react';
import api from '../utils/api';
import { Button, Badge } from './ui';
import { launchPreparation } from '../utils/preparation';
import { notifyError, notifySuccess } from '../utils/notify';

// Confier une réunion du plan au bras droit (v5.1, 16/10/2026, étape 2) : le cadre (ce qu'il
// peut trancher, ce qui vous est réservé), les assistants convoqués, puis la réunion tourne sur le
// serveur sans vous. Sur les boutons, l'acteur est toujours nommé (« le bras droit », « vous »).

const DEFAULT_CAN = ['Les détails d’organisation et de mise en forme', 'Entre deux options équivalentes, au même coût'];
const DEFAULT_RESERVED = ['Le budget', 'Les choix finaux et structurants', 'Tout ce qui sort du brief'];

function EditableList({ title, tone, items, setItems, placeholder }) {
  const [draft, setDraft] = useState('');
  const add = () => { const v = draft.trim(); if (v) { setItems([...items, v].slice(0, 8)); setDraft(''); } };
  const box = tone === 'ok' ? 'border-ok-border bg-ok-light/40' : 'border-await-border bg-await-bg';
  return (
    <section className={`border rounded-2xl p-4 space-y-2 ${box}`}>
      <h3 className={`text-sm font-extrabold ${tone === 'ok' ? 'text-ok' : 'text-await'}`}>{title}</h3>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={`${it}-${i}`} className="flex items-start gap-2 text-sm text-ink-soft">
            <span className="flex-1">{it}</span>
            <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={`Retirer « ${it} »`}
              className="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-md text-ink-faint hover:bg-white hover:text-ink"><X size={14} /></button>
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5">
        <label className="sr-only" htmlFor={`add-${tone}`}>{placeholder}</label>
        <input id={`add-${tone}`} value={draft} onChange={e => setDraft(e.target.value)} placeholder={placeholder} maxLength={160}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          className="flex-1 min-w-0 h-9 text-sm border border-line rounded-lg px-2.5 bg-white outline-none focus:ring-2 focus:ring-action-border" />
        <button type="button" onClick={add} disabled={!draft.trim()} aria-label="Ajouter"
          className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-line bg-white text-action disabled:opacity-40"><Plus size={16} /></button>
      </div>
    </section>
  );
}

export default function DelegateMeetingModal({ project, milestone, onClose, onLaunched }) {
  const [canDecide, setCanDecide] = useState(DEFAULT_CAN);
  const [reserved, setReserved] = useState(DEFAULT_RESERVED);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [stopOnBlock, setStopOnBlock] = useState(true);
  const [agents, setAgents] = useState(null);     // agents du projet
  const [selected, setSelected] = useState([]);   // ids retenus
  const [recommended, setRecommended] = useState(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [{ data: list }, { data: sugg }] = await Promise.all([
          api.get(`/projects/${project.id}/agents`),
          api.post(`/projects/${project.id}/sessions/suggest-agents`, { task: milestone.title, milestoneType: milestone.type, milestoneId: milestone.milestoneId || milestone.id }),
        ]);
        if (!alive) return;
        setAgents(list);
        setSelected((sugg.existingSelected || []).map(s => s.agentId).slice(0, 4));
        setRecommended(sugg.recommended || null);
      } catch (err) { if (alive) { setAgents([]); notifyError(err, 'Les assistants n’ont pas pu être proposés.'); } }
    })();
    return () => { alive = false; };
  }, [project.id, milestone]);

  const toggle = id => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  const launch = async () => {
    if (launching || !selected.length) return;
    setLaunching(true);
    setError('');
    try {
      const activeAgents = agents.filter(a => selected.includes(a.agentId || a.id)).map(a => ({
        id: a.agentId || a.id, name: a.name, role: a.role, systemPrompt: a.systemPrompt || `Tu es ${a.name}. ${a.role}.`, emoji: a.emoji || '',
      }));
      const { data } = await api.post(`/projects/${project.id}/sessions`, {
        task: milestone.title, intention: [milestone.type || 'decision'], activeAgents, mode: 'meeting',
        milestoneId: milestone.milestoneId || milestone.id,
        ...(recommended?.model ? { model: recommended.model } : {}),
        webSearchEnabled: recommended?.webSearch === true,
        delegation: { canDecide, reserved, notifyEmail, stopOnBlock },
      });
      await launchPreparation(project.id, data.session.id, { delegate: true });
      notifySuccess(`Votre bras droit tient « ${milestone.title} ». Sa note de retour arrivera dans votre conversation${notifyEmail ? ', et par e-mail' : ''}.`);
      onLaunched?.(data.session);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'La réunion n’a pas pu être confiée.');
      setLaunching(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-start gap-3 px-6 pt-5 pb-3 border-b border-line">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-wider text-ai">Confier au bras droit</p>
            <h2 id="dlg-title" className="text-xl font-extrabold text-ink leading-snug mt-0.5">{milestone.ref ? `${milestone.ref} · ` : ''}{milestone.title}</h2>
            <p className="text-sm text-ink-muted mt-1">Le bras droit tient la réunion à votre place : il convoque les assistants, anime, tranche dans le cadre ci-dessous et vous rend une note de retour.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="w-10 h-10 inline-flex items-center justify-center rounded-[10px] text-ink-muted hover:bg-muted-light"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <EditableList title="Le bras droit peut trancher" tone="ok" items={canDecide} setItems={setCanDecide} placeholder="Ajouter (ex. le fournisseur)" />
            <EditableList title="Réservé à vous" tone="await" items={reserved} setItems={setReserved} placeholder="Ajouter (ex. la date)" />
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-extrabold text-ink">Assistants convoqués</h3>
            {agents === null ? (
              <p className="text-sm text-ink-muted">Le bras droit choisit les assistants utiles…</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {agents.map(a => {
                  const id = a.agentId || a.id;
                  const on = selected.includes(id);
                  return (
                    <button key={id} type="button" onClick={() => toggle(id)} aria-pressed={on}
                      className={`min-h-[36px] px-3 rounded-full border text-[13px] font-semibold ${on ? 'bg-action-light border-action text-action' : 'bg-white border-line text-ink-muted hover:border-action-border'}`}>
                      {a.name}
                    </button>
                  );
                })}
              </div>
            )}
            {recommended && (
              <p className="text-xs text-ink-faint flex flex-wrap gap-1.5 items-center">
                <Badge tone="ok" className="!text-[10px] !px-2 !py-0.5">Recommandé</Badge>
                {recommended.model === 'claude-opus-5-5' ? 'Opus' : 'Sonnet'}{recommended.webSearch ? ', recherche web activée' : ''}{recommended.modelReason ? ` — ${recommended.modelReason}` : ''}
              </p>
            )}
          </section>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2.5 text-sm text-ink-soft"><input type="checkbox" checked={notifyEmail} onChange={e => setNotifyEmail(e.target.checked)} className="w-4 h-4 accent-action" /> Vous prévenir par e-mail à la fin</label>
            <label className="flex items-center gap-2.5 text-sm text-ink-soft"><input type="checkbox" checked={stopOnBlock} onChange={e => setStopOnBlock(e.target.checked)} className="w-4 h-4 accent-action" /> Arrêter la réunion si une question qui vous est réservée bloque tout</label>
          </div>
          {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-6 py-4 border-t border-line">
          <p className="flex-1 min-w-[200px] text-xs text-ink-faint">Vous pourrez suivre la réunion en direct, ou ne rien ouvrir.</p>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={launch} disabled={launching || !selected.length || agents === null}>
            {launching ? 'Le bras droit commence…' : 'Confier la réunion'}
          </Button>
        </div>
      </div>
    </div>
  );
}
