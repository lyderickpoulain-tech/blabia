import { useState } from 'react';
import api from '../../utils/api';
import { Button, Card } from '../ui';
import { notifyError } from '../../utils/notify';

// Projet sans brief (créé avant le nouveau formulaire, v5.1 — réunion « WorldOfMetal ») :
// sans lui, les assistants ne savent pas ce que fait le projet ni à qui ils parlent.
// Deux questions, comme à la création ; ensuite BlabIA propose un plan.
const LEVELS = [
  { value: 1, label: 'Je n’y connais rien', hint: 'mots de tous les jours' },
  { value: 3, label: 'J’en connais un peu', hint: 'vocabulaire courant du domaine' },
  { value: 5, label: 'C’est mon métier', hint: 'échanges entre spécialistes' },
];

export default function BriefPrompt({ project, onSaved }) {
  const [story, setStory] = useState('');
  const [level, setLevel] = useState(null);
  const [saving, setSaving] = useState(false);
  const ready = story.trim().length >= 20 && level;
  const save = async e => {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      await api.patch(`/projects/${project.id}/brief`, { objectif: story.trim() });
      await api.patch(`/projects/${project.id}`, { expertiseLevel: level });
      onSaved();
    } catch (err) { notifyError(err, 'Votre projet n’a pas pu être enregistré.'); setSaving(false); }
  };
  return (
    <Card as="section" aria-labelledby="brief-prompt-title" className="p-5 border-action-border">
      <form onSubmit={save} className="space-y-4">
        <div>
          <h2 id="brief-prompt-title" className="text-lg font-extrabold text-ink">Racontez votre projet</h2>
          <p className="text-sm text-ink-muted mt-1">Les assistants ne savent pas encore ce que vous voulez faire. Deux questions, et BlabIA vous propose les prochaines réunions.</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="brief-story" className="block text-sm font-extrabold text-ink">Votre projet, avec vos mots</label>
          <p className="text-xs text-ink-muted">Ce que vous voulez faire, pour qui, et ce qui compte pour vous (budget, délai…).</p>
          <textarea id="brief-story" rows={4} value={story} onChange={e => setStory(e.target.value)} maxLength={3000}
            className="w-full border border-line rounded-[10px] px-3.5 py-2.5 text-[15px] bg-white outline-none focus:ring-2 focus:ring-action-border" />
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-extrabold text-ink mb-1.5">Vous et ce sujet</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {LEVELS.map(l => (
              <label key={l.value} className={`cursor-pointer rounded-[10px] border px-3.5 py-2.5 ${level === l.value ? 'border-action bg-action-light/60' : 'border-line bg-white hover:border-action-border'}`}>
                <input type="radio" name="brief-level" value={l.value} checked={level === l.value} onChange={() => setLevel(l.value)} className="sr-only" />
                <span className="block text-sm font-extrabold text-ink">{l.label}</span>
                <span className="block text-xs text-ink-muted">{l.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={!ready || saving}>{saving ? 'Enregistrement…' : 'Enregistrer et proposer un plan'}</Button>
        </div>
      </form>
    </Card>
  );
}
