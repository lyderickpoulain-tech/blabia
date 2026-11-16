import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Layout from '../components/Layout';
import { Button, Card } from '../components/ui';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useTour } from '../tour/TourContext';

// v6 « l'ouvrage d'abord » : création en une seule question. BlabIA déduit le genre, le nom
// et le niveau de langage ; la première version s'écrit aussitôt, sans question. Tout ce qui
// n'est pas dit devient une supposition modifiable sur « Mon projet ».
const MIN = 15;

const EXAMPLES = [
  'Créons un jeu de société sur le thème des volcans, pour jouer en famille.',
  'Organiser le Noël du comité d’entreprise : 5 idées de cadeaux pour chacune des 5 tranches d’âge.',
  'Ouvrir un salon de thé à Lyon, avec une boutique de thés en vrac.',
];

export default function NewProjectStory() {
  const [story, setStory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();
  const tour = useTour();
  const inTour = tour?.active && tour.chapterId === 'create';
  const ready = story.trim().length >= MIN;

  // Visite guidée : récit pré-rempli ; « Créer » ouvre le projet exemple (aucun appel à l'IA)
  useEffect(() => {
    if (tour?.step?.prefill) setStory('Ouvrir un salon de thé cosy doublé d’une boutique de thés en vrac à Lyon, rentable dès la deuxième année. J’ai 25 000 € d’apport et aucune expérience de la restauration.');
  }, [tour?.step?.prefill]);

  const submit = async e => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    if (inTour) {
      try { await tour.createDemo(); } catch { setError('Le projet exemple n’a pas pu être créé.'); }
      setBusy(false);
      return;
    }
    try {
      const { data } = await api.post('/projects/from-story', { story: story.trim() });
      navigate(`/projects/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Le projet n’a pas pu être créé. Réessayez dans un instant.');
      setBusy(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink mb-4">
          <ArrowLeft size={16} aria-hidden="true" /> Mes projets
        </Link>

        <h1 className="text-2xl font-extrabold text-ink">Racontez votre projet</h1>
        <p className="text-[15px] text-ink-muted mt-1 mb-5">
          Avec vos mots, comme à un ami. BlabIA en fait aussitôt une première version complète, que vous pourrez corriger.
        </p>

        <form onSubmit={submit} data-tour="np-story">
          <Card className="p-5 sm:p-6 space-y-4">
            <label htmlFor="story" className="sr-only">Votre projet</label>
            <textarea
              id="story"
              value={story}
              onChange={e => setStory(e.target.value)}
              rows={7}
              autoFocus
              maxLength={8000}
              placeholder={EXAMPLES[0]}
              className="w-full px-3.5 py-3 border border-line rounded-[10px] text-[15px] text-ink bg-white outline-none focus:ring-2 focus:ring-action focus:border-transparent transition resize-y"
            />
            <div className="text-sm text-ink-muted">
              <p className="font-bold text-ink-soft mb-1">Par exemple :</p>
              <ul className="space-y-1">
                {EXAMPLES.map(ex => (
                  <li key={ex}>
                    <button type="button" onClick={() => setStory(ex)} className="text-left text-action hover:underline">{ex}</button>
                  </li>
                ))}
              </ul>
            </div>
            {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
            <Button type="submit" variant="primary" disabled={!ready || busy} className="w-full sm:w-auto" data-tour="np-submit">
              {busy ? 'Création…' : 'Créer'}
            </Button>
            {!ready && story.trim().length > 0 && (
              <p className="text-xs text-ink-muted">Une ou deux phrases suffisent.</p>
            )}
          </Card>
        </form>

        {user?.advancedMode && (
          <p className="text-sm text-ink-muted mt-4">
            <Link to="/projects/new?detail=1" className="font-semibold text-action hover:underline">Création détaillée (mode avancé)</Link>
          </p>
        )}
      </div>
    </Layout>
  );
}
