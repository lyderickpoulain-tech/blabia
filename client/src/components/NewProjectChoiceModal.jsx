import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, PenLine, X } from 'lucide-react';
import api from '../utils/api';
import { notifyError } from '../utils/notify';

// Clic sur « Nouveau projet » : projet de démo pré-rempli, ou formulaire de création
export default function NewProjectChoiceModal({ onClose }) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const createDemo = async () => {
    setCreating(true);
    try {
      const { data } = await api.post('/projects/test-sample');
      navigate(`/projects/${data.id}`);
    } catch (err) {
      notifyError(err, 'Le projet de démo n’a pas pu être créé.');
      setCreating(false);
    }
  };

  const choiceCls = 'w-full text-left flex items-start gap-3 p-4 rounded-xl border transition disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action';

  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget && !creating) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="np-choice-title" className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h3 id="np-choice-title" className="text-lg font-extrabold text-ink">Nouveau projet</h3>
          <button onClick={onClose} disabled={creating} aria-label="Fermer" className="text-ink-faint hover:text-ink transition">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <button className={`${choiceCls} border-line hover:border-action-border hover:bg-action-light`} disabled={creating}
          onClick={() => navigate('/projects/new')} autoFocus>
          <span className="w-10 h-10 rounded-xl bg-action-light text-action inline-flex items-center justify-center shrink-0">
            <PenLine size={20} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-extrabold text-ink">Créer mon projet</span>
            <span className="block text-xs text-ink-muted mt-0.5">Vous décrivez votre idée ; BlabIA compose l’équipe d’agents.</span>
          </span>
        </button>

        <button className={`${choiceCls} border-ai-border bg-ai-bg hover:border-ai`} disabled={creating} onClick={createDemo}>
          <span className="w-10 h-10 rounded-xl bg-white text-ai inline-flex items-center justify-center shrink-0">
            <FlaskConical size={20} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-extrabold text-ink">{creating ? 'Création du projet de démo…' : 'Créer un projet de démo'}</span>
            <span className="block text-xs text-ink-muted mt-0.5">
              Un salon de thé déjà avancé : plan, réunions, décisions, actions, documents, missions.
              Pour essayer BlabIA sans partir de zéro ; les agents y sont actifs, avec le coût habituel.
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
