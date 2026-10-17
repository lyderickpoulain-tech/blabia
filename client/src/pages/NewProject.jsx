import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Globe, Store, CalendarHeart, Users, Sparkles } from 'lucide-react';
import Layout from '../components/Layout';
import { Button, Card } from '../components/ui';
import api from '../utils/api';
import { startRepoCreation } from '../utils/github';
import { notifyError } from '../utils/notify';
import { useTour } from '../tour/TourContext';
import QuestionModePicker from '../components/QuestionModePicker';
import ChallengerToggle from '../components/ChallengerToggle';
import LevelSlider, { HUMOR_LABELS, HUMOR_ICONS } from '../components/LevelSlider';

// Création d'un projet (v5.1, refonte 17/10/2026 après le test « Gérard ») : on raconte son
// projet, sans « brief » ni réglages à comprendre. Le genre du projet fixe ce qui s'affiche
// ensuite (Outils, développement : seulement pour un site ou une appli). Le niveau est demandé
// en clair — c'est lui qui règle le vocabulaire des assistants.

const inputCls = 'w-full px-3.5 py-2.5 border border-line rounded-[10px] text-[15px] text-ink bg-white outline-none focus:ring-2 focus:ring-action focus:border-transparent transition';

const KINDS = [
  { id: 'site', label: 'Un site ou une application', icon: Globe, tech: true, example: 'Ex. : un site pour partager ma passion des musiques du monde, mes disques et les concerts près de chez moi.' },
  { id: 'business', label: 'Un commerce, une entreprise', icon: Store, example: 'Ex. : ouvrir un salon de thé à Lyon, avec une boutique de thés en vrac.' },
  { id: 'event', label: 'Un événement', icon: CalendarHeart, example: 'Ex. : organiser le Noël du comité d’entreprise pour 80 enfants.' },
  { id: 'association', label: 'Une association', icon: Users, example: 'Ex. : créer une association de quartier pour un jardin partagé.' },
  { id: 'other', label: 'Autre chose', icon: Sparkles, example: 'Racontez ce que vous voulez faire, avec vos mots.' },
];
const KIND_LABEL = Object.fromEntries(KINDS.map(k => [k.id, k.label]));

// « Vous et ce sujet » → niveau des échanges (1 Découverte, 3 Intermédiaire, 5 Expert)
const LEVELS = [
  { value: 1, label: 'Je n’y connais rien', hint: 'mots de tous les jours' },
  { value: 3, label: 'J’en connais un peu', hint: 'vocabulaire courant du domaine' },
  { value: 5, label: 'C’est mon métier', hint: 'échanges entre spécialistes' },
];

function Question({ number, title, hint, children, tour }) {
  return (
    <section className="space-y-3" data-tour={tour}>
      <div>
        <h2 className="text-[17px] font-extrabold text-ink flex items-baseline gap-2"><span className="text-action">{number}.</span> {title}</h2>
        {hint && <p className="text-sm text-ink-muted mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export default function NewProject() {
  const [kind, setKind] = useState(null);
  const [story, setStory] = useState('');
  const [name, setName] = useState('');
  const [level, setLevel] = useState(null);
  const [website, setWebsite] = useState(true); // pas encore de site : plan de construction + dépôt créé par BlabIA
  const [showSettings, setShowSettings] = useState(false);
  const [description, setDescription] = useState('');
  const [humorLevel, setHumorLevel] = useState(2);
  const [questionMode, setQuestionMode] = useState('balanced');
  const [challengerEnabled, setChallengerEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const tour = useTour();
  const inTour = tour?.active && tour.chapterId === 'create';
  const tech = KINDS.find(k => k.id === kind)?.tech;

  // Visite guidée : formulaire pré-rempli avec le projet exemple (salon de thé)
  useEffect(() => {
    if (!tour?.step?.prefill) return;
    setKind('business');
    setName('Salon de thé « Les Feuilles Vagabondes »');
    setStory('Ouvrir un salon de thé cosy doublé d’une boutique de thés en vrac à Lyon, rentable dès la deuxième année. Je porte le projet seule, avec 25 000 € d’apport et un prêt en négociation ; je n’ai aucune expérience de la restauration.');
    setLevel(1); setHumorLevel(3); setQuestionMode('balanced');
  }, [tour?.step?.prefill]);

  const ready = kind && name.trim() && story.trim() && level;
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setError('');
    setLoading(true);
    if (inTour) {
      // Visite guidée : c'est le projet exemple (jeu de données fixe) qui est créé
      try { await tour.createDemo(); } catch { setError('Le projet exemple n’a pas pu être créé.'); }
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.post('/projects', {
        name, description, objectif: story, contexte: `Genre de projet : ${KIND_LABEL[kind]}.`,
        hasTechnicalStack: !!tech, expertiseLevel: level, humorLevel, questionMode, challengerEnabled,
      });
      if (tech && website) {
        // Plan type (définir → style → construire), puis création du dépôt en passant par GitHub
        await api.post(`/projects/${data.id}/plan/website`).catch(() => {});
        try {
          await startRepoCreation(data.id);
          return;
        } catch (err) {
          notifyError(err, 'Projet créé. La mise en place de la construction du site reprendra depuis Paramètres.');
        }
      }
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

        <h1 className="text-2xl font-extrabold text-ink">Votre projet</h1>
        <p className="text-[15px] text-ink-muted mt-1 mb-5">Quatre questions. Ensuite, une équipe d’assistants en discute avec vous, en réunions courtes ; vous décidez.</p>

        <form onSubmit={handleSubmit}>
          <Card className="p-5 sm:p-6 space-y-7">
            <Question number={1} title="Quel genre de projet ?" tour="np-identity">
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Genre de projet">
                {KINDS.map(k => (
                  <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)}
                    className={`min-h-[52px] flex items-center gap-3 px-3.5 rounded-xl border text-left text-[15px] font-bold transition ${
                      kind === k.id ? 'border-action bg-action-light text-action' : 'border-line bg-white text-ink-soft hover:border-action-border'}`}>
                    <k.icon size={20} aria-hidden="true" className="shrink-0" /> {k.label}
                  </button>
                ))}
              </div>
            </Question>

            <Question number={2} title="Racontez votre projet" hint="Avec vos mots : ce que vous voulez faire, pour qui, et ce qui compte pour vous (budget, délai…)." tour="np-brief">
              <label htmlFor="np-story" className="sr-only">Votre projet, en quelques lignes</label>
              <textarea id="np-story" value={story} onChange={e => setStory(e.target.value)} rows={5} maxLength={4000}
                placeholder={KINDS.find(k => k.id === kind)?.example || 'Racontez ce que vous voulez faire, avec vos mots.'}
                className={`${inputCls} resize-y`} />
            </Question>

            <Question number={3} title="Un nom pour vous y retrouver">
              <label htmlFor="np-name" className="sr-only">Nom du projet</label>
              <input id="np-name" type="text" value={name} onChange={e => setName(e.target.value)} maxLength={100}
                placeholder="Ex. : Mon site musiques du monde" className={inputCls} />
            </Question>

            <Question number={4} title="Vous et ce sujet" hint="Les assistants adaptent leur façon de parler. Modifiable à tout moment." tour="np-level">
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Votre niveau sur ce sujet">
                {LEVELS.map(l => (
                  <button key={l.value} type="button" role="radio" aria-checked={level === l.value} onClick={() => setLevel(l.value)}
                    className={`min-h-[64px] px-3.5 py-2 rounded-xl border text-left transition ${
                      level === l.value ? 'border-action bg-action-light' : 'border-line bg-white hover:border-action-border'}`}>
                    <span className={`block text-[15px] font-bold ${level === l.value ? 'text-action' : 'text-ink'}`}>{l.label}</span>
                    <span className="block text-[13px] text-ink-muted">{l.hint}</span>
                  </button>
                ))}
              </div>
            </Question>

            {tech && !inTour && (
              <section className="rounded-xl border border-line bg-canvas p-4 space-y-2.5">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="mt-1 w-5 h-5 accent-action shrink-0" checked={website} onChange={e => setWebsite(e.target.checked)} />
                  <span className="text-[15px] text-ink-soft">
                    <strong className="text-ink">Je n’ai pas encore de site : BlabIA le construit et le met en ligne.</strong>{' '}
                    Trois réunions pour le définir et choisir son style, puis la construction ; vous le voyez d’abord à une adresse de test gratuite.
                  </span>
                </label>
                {website && (
                  <p className="text-[13px] text-ink-muted pl-8">
                    <strong className="text-ink-soft">Ce que ça coûte :</strong> l’adresse de test est gratuite. Pour construire le site, BlabIA utilise votre abonnement Claude
                    (à partir de 18 €/mois) ; une fois en ligne, l’hébergement coûte environ 5 à 20 €/mois. Vous êtes guidé pas à pas et rien n’est payé sans votre accord.
                  </p>
                )}
              </section>
            )}

            <div className="border-t border-line pt-4">
              <button type="button" onClick={() => setShowSettings(v => !v)} aria-expanded={showSettings}
                className="w-full min-h-[40px] flex items-center justify-between text-left text-sm font-bold text-ink-soft">
                Réglages (facultatif)
                <ChevronDown size={18} aria-hidden="true" className={`transition-transform ${showSettings ? 'rotate-180' : ''}`} />
              </button>
              {showSettings && (
                <div className="space-y-5 mt-3" data-tour="np-work">
                  <label className="block" htmlFor="np-desc">
                    <span className="block text-sm font-bold text-ink-soft mb-1">Description courte <span className="text-ink-faint font-semibold">(affichée dans vos projets)</span></span>
                    <input id="np-desc" value={description} onChange={e => setDescription(e.target.value)} maxLength={200} className={inputCls} />
                  </label>
                  <LevelSlider label="Humour" value={humorLevel} onChange={setHumorLevel} labels={HUMOR_LABELS} icons={HUMOR_ICONS} />
                  <QuestionModePicker value={questionMode} onChange={setQuestionMode} />
                  <ChallengerToggle checked={challengerEnabled} onChange={setChallengerEnabled} />
                </div>
              )}
            </div>
          </Card>

          {error && (
            <div role="alert" className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-4">
            {!ready && <p className="text-sm text-ink-muted mr-auto">Répondez aux quatre questions pour commencer.</p>}
            <Button variant="secondary" onClick={() => navigate('/dashboard')}>Annuler</Button>
            <Button data-tour="np-submit" type="submit" variant="primary" disabled={loading || !ready} className="min-w-[180px]">
              {loading ? 'Création…' : 'Créer le projet'}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
