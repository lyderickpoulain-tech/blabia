import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../utils/api';

export default function NewProject() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [objectif, setObjectif] = useState('');
  const [contexte, setContexte] = useState('');
  const [notes, setNotes] = useState('');
  const [hasTechnicalStack, setHasTechnicalStack] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/projects', { name, description, objectif, contexte, notes, hasTechnicalStack });
      navigate(`/projects/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la création');
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-lg mx-auto">
        <Link to="/dashboard" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6">
          ← Retour au tableau de bord
        </Link>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Nouveau projet</h1>
          <p className="text-gray-500 text-sm mb-6">Définissez le contexte de votre projet IA</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom du projet <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex : Stratégie de communication Q3"
                maxLength={100}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blabia-blue focus:border-transparent outline-none transition"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description <span className="text-gray-400 font-normal">(optionnel)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Quelques mots sur le contexte de ce projet…"
                rows={2}
                maxLength={500}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blabia-blue focus:border-transparent outline-none transition resize-none"
              />
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Brief projet</p>
              <p className="text-xs text-gray-400 mb-3 leading-relaxed">
                Ce brief est transmis aux agents dès la première réunion — ils arrivent avec ce contexte dès le départ.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Objectif principal <span className="text-gray-400 font-normal">(optionnel)</span>
                  </label>
                  <textarea
                    value={objectif}
                    onChange={e => setObjectif(e.target.value)}
                    placeholder="Quel est l'objectif de ce projet ? Que cherchez-vous à accomplir ?"
                    rows={3}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blabia-blue focus:border-transparent outline-none transition resize-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contexte <span className="text-gray-400 font-normal">(optionnel)</span>
                  </label>
                  <textarea
                    value={contexte}
                    onChange={e => setContexte(e.target.value)}
                    placeholder="Quel est le contexte ? Qui sont les utilisateurs ? Quelles contraintes ?"
                    rows={3}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blabia-blue focus:border-transparent outline-none transition resize-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes initiales <span className="text-gray-400 font-normal">(optionnel)</span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Idées, inspirations, références, contraintes techniques…"
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blabia-blue focus:border-transparent outline-none transition resize-none text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <button
                  type="button"
                  role="switch"
                  aria-checked={hasTechnicalStack}
                  onClick={() => setHasTechnicalStack(v => !v)}
                  className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${hasTechnicalStack ? 'bg-blabia-blue' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${hasTechnicalStack ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <span className="text-sm text-gray-700">Ce projet implique du développement technique</span>
              </label>
              {hasTechnicalStack && (
                <p className="text-xs text-gray-400 mt-1.5 ml-[3.25rem]">
                  Le panneau Stack sera disponible dans le projet pour configurer et suggérer les outils techniques.
                </p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Link
                to="/dashboard"
                className="flex-1 text-center border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
              >
                Annuler
              </Link>
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="flex-1 bg-blabia-blue hover:bg-blabia-blue text-white py-2.5 rounded-lg transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Création…' : 'Créer le projet'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
