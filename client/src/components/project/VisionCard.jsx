import { useState } from 'react';
import { Eye, Check, Pencil } from 'lucide-react';
import api from '../../utils/api';
import { Button, Card } from '../ui';
import { notifyError, notifySuccess } from '../../utils/notify';

// « Votre vision » (v5.1, 18/10/2026 — personas : le novice craint « de ne pas avoir une
// retranscription exacte de sa vision ») : BlabIA écrit ce qu'il a compris, avec vos mots ;
// vous corrigez, vous validez ; la vision validée guide toutes les réunions.
export default function VisionCard({ project, canEdit, hasMeetings, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.vision || '');
  const [expanded, setExpanded] = useState(false);
  const status = project.vision ? project.visionStatus || 'draft' : null;

  const write = async () => {
    setBusy(true);
    try { const { data } = await api.post(`/projects/${project.id}/vision/draft`); setDraft(data.vision); onChanged(); }
    catch (err) { notifyError(err, 'BlabIA n’a pas pu rédiger votre vision.'); }
    setBusy(false);
  };
  const save = async (text, validated) => {
    setBusy(true);
    try {
      await api.put(`/projects/${project.id}/vision`, { text, validated });
      setEditing(false);
      if (validated) notifySuccess('Votre vision est validée : les assistants s’y référeront à chaque réunion.');
      onChanged();
    } catch (err) { notifyError(err, 'Votre vision n’a pas pu être enregistrée.'); }
    setBusy(false);
  };

  if (!status) {
    if (!canEdit || !hasMeetings) return null;
    return (
      <Card as="section" aria-labelledby="vision-title" className="p-5 flex flex-wrap items-center gap-4">
        <Eye size={22} className="text-ai shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-[240px]">
          <h2 id="vision-title" className="text-base font-extrabold text-ink">Votre vision, telle que BlabIA l’a comprise</h2>
          <p className="text-sm text-ink-muted mt-0.5">Vérifiez que BlabIA a bien compris votre projet, avec vos mots. Vous corrigez, vous validez : les assistants s’y tiendront.</p>
        </div>
        <Button variant="secondary" disabled={busy} onClick={write}>{busy ? 'BlabIA rédige…' : 'Voir ce que BlabIA a compris'}</Button>
      </Card>
    );
  }

  const validated = status === 'validated';
  return (
    <Card as="section" aria-labelledby="vision-title" className={`p-5 space-y-3 ${validated ? '' : 'border-ai-border'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Eye size={18} className="text-ai shrink-0" aria-hidden="true" />
        <h2 id="vision-title" className="flex-1 text-base font-extrabold text-ink">{validated ? 'Votre vision' : 'Voici ce que BlabIA a compris de votre projet. C’est bien ça ?'}</h2>
        {validated && <span className="text-xs font-bold text-ok inline-flex items-center gap-1"><Check size={14} aria-hidden="true" /> Validée par vous</span>}
      </div>
      {editing ? (
        <>
          <label htmlFor="vision-text" className="sr-only">Votre vision</label>
          <textarea id="vision-text" rows={7} value={draft} onChange={e => setDraft(e.target.value)} maxLength={3000}
            className="w-full border border-line rounded-[10px] px-3.5 py-2.5 text-[15px] leading-relaxed bg-white outline-none focus:ring-2 focus:ring-action-border" />
          <div className="flex flex-wrap gap-2 justify-end">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setEditing(false); setDraft(project.vision); }}>Annuler</Button>
            <Button size="sm" variant="primary" disabled={busy || !draft.trim()} onClick={() => save(draft, true)}>Enregistrer et valider</Button>
          </div>
        </>
      ) : (
        <>
          <p className={`text-[15px] leading-relaxed text-ink-soft whitespace-pre-line ${validated && !expanded ? 'line-clamp-3' : ''}`}>{project.vision}</p>
          <div className="flex flex-wrap gap-2 items-center">
            {validated && <button type="button" onClick={() => setExpanded(v => !v)} className="text-[13px] font-bold text-action hover:underline">{expanded ? 'Réduire' : 'Lire tout'}</button>}
            {canEdit && (
              <div className="flex flex-wrap gap-2 ml-auto">
                <Button size="sm" variant={validated ? 'ghost' : 'secondary'} disabled={busy} onClick={() => { setDraft(project.vision); setEditing(true); }}><Pencil size={14} aria-hidden="true" /> {validated ? 'Modifier' : 'Corriger'}</Button>
                {!validated && <Button size="sm" variant="primary" disabled={busy} onClick={() => save(project.vision, true)}>C’est bien ça</Button>}
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
