import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Layout from '../components/Layout';
import { Button, Card } from '../components/ui';
import api from '../utils/api';
import { useTour } from '../tour/TourContext';
import QuestionModePicker from '../components/QuestionModePicker';
import ChallengerToggle from '../components/ChallengerToggle';
import LevelSlider, { EXPERTISE_LABELS, HUMOR_LABELS, HUMOR_ICONS } from '../components/LevelSlider';

const inputCls = 'w-full px-3.5 py-2.5 border border-line rounded-[10px] text-sm text-ink bg-white outline-none focus:ring-2 focus:ring-action focus:border-transparent transition';

function Field({ label, optional, hint, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-bold text-ink-soft mb-1">
        {label} {optional && <span className="text-ink-faint font-semibold">(optionnel)</span>}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-ink-faint mt-1">{hint}</span>}
    </label>
  );
}

function Block({ title, hint, tour, children }) {
  return (
    <Card className="p-5" data-tour={tour}>
      <h2 className="text-base font-extrabold text-ink">{title}</h2>
      {hint && <p className="text-xs text-ink-muted mt-0.5 mb-4">{hint}</p>}
      <div className={`space-y-4 ${hint ? '' : 'mt-4'}`}>{children}</div>
    </Card>
  );
}

export default function NewProject() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [objectif, setObjectif] = useState('');
  const [contexte, setContexte] = useState('');
  const [notes, setNotes] = useState('');
  const [expertiseLevel, setExpertiseLevel] = useState(3);
  const [humorLevel, setHumorLevel] = useState(2);
  const [questionMode, setQuestionMode] = useState('balanced');
  const [challengerEnabled, setChallengerEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const tour = useTour();
  const inTour = tour?.active && tour.chapterId === 'create';

  // Visite guidée : formulaire pré-rempli avec le projet exemple (salon de thé)
  useEffect(() => {
    if (!tour?.step?.prefill) return;
    setName('Salon de thé « Les Feuilles Vagabondes »');
    setDescription('Ouvrir un salon de thé et une boutique de thés en vrac à Lyon.');
    setObjectif('Ouvrir un salon de thé cosy doublé d’une boutique de thés en vrac, rentable dès la deuxième année.');
    setContexte('Projet porté par une seule personne. Apport de 25 000 €, prêt bancaire en négociation. Aucune expérience de la restauration.');
    setNotes('Ateliers de dégustation le week-end, vente en ligne plus tard. Circuits courts, zéro déchet.');
    setExpertiseLevel(2); setHumorLevel(3); setQuestionMode('balanced');
  }, [tour?.step?.prefill]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    if (inTour) {
      // Visite guidée : c'est le projet exemple (jeu de données fixe) qui est créé
      try { await tour.createDemo(); } catch { setError('Le projet exemple n’a pas pu être créé.'); }
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.post('/projects', { name, description, objectif, contexte, notes, expertiseLevel, humorLevel, questionMode, challengerEnabled });
      navigate(`/projects/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la création');
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink mb-4">
          <ArrowLeft size={16} aria-hidden="true" /> Mes projets
        </Link>

        <h1 className="text-2xl font-extrabold text-ink">Nouveau projet</h1>
        <p className="text-sm text-ink-muted mt-1 mb-5">Plus le brief est précis, moins les agents auront de questions à vous poser.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Block title="Identité" tour="np-identity">
            <Field label="Nom du projet">
              <input type="text" required value={name} onChange={e => setName(e.target.value)}
                placeholder="Ex : Stratégie de communication Q3" maxLength={100} className={inputCls} autoFocus />
            </Field>
            <Field label="Description" optional hint="Affichée dans la liste de vos projets.">
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Quelques mots sur ce projet…" rows={2} maxLength={500} className={`${inputCls} resize-none`} />
            </Field>
          </Block>

          <Block title="Brief" tour="np-brief" hint="Transmis aux agents dès la première réunion : ils arrivent avec ce contexte.">
            <Field label="Objectif principal" optional>
              <textarea value={objectif} onChange={e => setObjectif(e.target.value)}
                placeholder="Que cherchez-vous à accomplir ?" rows={3} className={`${inputCls} resize-none`} />
            </Field>
            <Field label="Contexte" optional>
              <textarea value={contexte} onChange={e => setContexte(e.target.value)}
                placeholder="Qui sont les utilisateurs ? Quelles contraintes (budget, délai, compétences) ?" rows={3} className={`${inputCls} resize-none`} />
            </Field>
            <Field label="Notes initiales" optional>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Idées, inspirations, références, contraintes techniques…" rows={2} className={`${inputCls} resize-none`} />
            </Field>
          </Block>

          <Block title="Façon de travailler" tour="np-work" hint="Valeurs par défaut des réunions, modifiables à chaque réunion.">
            <LevelSlider label="Maîtrise du sujet de l'interlocuteur" value={expertiseLevel}
              onChange={setExpertiseLevel} labels={EXPERTISE_LABELS} />
            <LevelSlider label="Humour" value={humorLevel} onChange={setHumorLevel}
              labels={HUMOR_LABELS} icons={HUMOR_ICONS} />
            <QuestionModePicker value={questionMode} onChange={setQuestionMode} />
            <ChallengerToggle checked={challengerEnabled} onChange={setChallengerEnabled} />
          </Block>

          {error && (
            <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => navigate('/dashboard')}>Annuler</Button>
            <Button data-tour="np-submit" type="submit" variant="primary" disabled={loading || !name.trim()} className="min-w-[180px]">
              {loading ? 'Création…' : 'Créer le projet'}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
