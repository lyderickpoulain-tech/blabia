import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../utils/api';
import { getPricing, PRICING_CONFIG } from '../utils/techStack';

const CATEGORIES = [
  {
    id: 'hebergement',
    label: 'Hébergement',
    icon: '🖥️',
    options: ['Railway', 'Vercel', 'Netlify', 'OVH mutualisé', 'OVH VPS', 'AWS'],
    hasAutre: true,
    autrePlaceholder: 'Ex : DigitalOcean, Hetzner…'
  },
  {
    id: 'bdd',
    label: 'Base de données',
    icon: '🗄️',
    options: ['PostgreSQL', 'MySQL', 'MongoDB', 'SQLite', 'Supabase', 'PlanetScale'],
    hasAutre: true,
    autrePlaceholder: 'Ex : Redis, CockroachDB…'
  },
  {
    id: 'frontend',
    label: 'Framework frontend',
    icon: '🎨',
    options: ['React', 'Vue.js', 'Next.js', 'Nuxt', 'Svelte', 'HTML/CSS vanilla'],
    hasAutre: true,
    autrePlaceholder: 'Ex : Angular, Astro…'
  },
  {
    id: 'backend',
    label: 'Framework backend',
    icon: '⚙️',
    options: ['Node.js/Express', 'Python/FastAPI', 'Python/Django', 'PHP/Laravel'],
    hasAutre: true,
    autrePlaceholder: 'Ex : Ruby on Rails, Go/Gin…'
  },
  {
    id: 'auth',
    label: 'Authentification',
    icon: '🔐',
    options: ['JWT maison', 'Auth0', 'Clerk', 'Supabase Auth'],
    hasAutre: true,
    autrePlaceholder: 'Ex : Keycloak, Firebase Auth…'
  },
  {
    id: 'emails',
    label: "Envoi d'emails",
    icon: '📧',
    options: ['Nodemailer/SMTP', 'Resend', 'SendGrid', 'Mailgun'],
    hasAutre: true,
    autrePlaceholder: 'Ex : Postmark, Amazon SES…'
  },
  {
    id: 'devtools',
    label: 'Outils de développement',
    icon: '🛠️',
    options: ['VS Code', 'Claude Code', 'GitHub', 'GitLab', 'Docker'],
    hasAutre: true,
    autrePlaceholder: 'Ex : Cursor, Bitbucket…'
  },
  {
    id: 'domaine',
    label: 'Domaine',
    icon: '🌐',
    options: ['OVH', 'Namecheap', 'Cloudflare'],
    hasAutre: true,
    autrePlaceholder: 'Ex : GoDaddy, Google Domains…'
  }
];

function CategoryCard({ category, stack, onToggle, onAutreChange }) {
  const selected = stack[category.id] || [];
  const autreText = stack[`${category.id}_autre`] || '';
  const autreChecked = selected.includes('Autre');

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{category.icon}</span>
        <h2 className="font-semibold text-gray-900 text-sm">{category.label}</h2>
        {selected.length > 0 && (
          <span className="ml-auto text-xs font-medium bg-blue-100 text-blabia-blue px-2 py-0.5 rounded-full">
            {selected.filter(x => x !== 'Autre').length + (autreChecked && autreText ? 1 : 0)} sélectionné{selected.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {category.options.map(option => (
          <label
            key={option}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition select-none ${
              selected.includes(option)
                ? 'bg-blue-50 border-blue-300 text-blue-800'
                : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => onToggle(category.id, option)}
              className="w-3.5 h-3.5 accent-blabia-blue shrink-0"
            />
            <span className="text-xs font-medium leading-snug flex-1">{option}</span>
            {(() => {
              const p = getPricing(option);
              const cfg = p && PRICING_CONFIG[p];
              return cfg ? (
                <span className={`text-xs px-1 py-0.5 rounded font-medium shrink-0 ${cfg.color}`}>{cfg.dot}</span>
              ) : null;
            })()}
          </label>
        ))}

        {category.hasAutre && (
          <label
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition select-none ${
              autreChecked
                ? 'bg-blue-50 border-blue-300 text-blue-800'
                : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
            }`}
          >
            <input
              type="checkbox"
              checked={autreChecked}
              onChange={() => onToggle(category.id, 'Autre')}
              className="w-3.5 h-3.5 accent-blabia-blue shrink-0"
            />
            <span className="text-xs font-medium">Autre</span>
          </label>
        )}
      </div>

      {category.hasAutre && autreChecked && (
        <input
          type="text"
          value={autreText}
          onChange={e => onAutreChange(category.id, e.target.value)}
          placeholder={category.autrePlaceholder}
          className="mt-2 w-full px-3 py-2 text-sm border border-blue-200 bg-blue-50 rounded-xl focus:ring-2 focus:ring-blabia-blue outline-none transition"
        />
      )}
    </div>
  );
}

export default function EnvironmentPage() {
  const [stack, setStack]     = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');
  const saveTimerRef          = useRef(null);
  const isFirstLoad           = useRef(true);

  // Charger l'environnement au montage
  useEffect(() => {
    api.get('/users/me/tech-stack')
      .then(({ data }) => setStack(data || {}))
      .catch(() => setStack({}))
      .finally(() => setLoading(false));
  }, []);

  // Auto-save après chaque modification (debounce 1s)
  useEffect(() => {
    if (loading) return;
    if (isFirstLoad.current) { isFirstLoad.current = false; return; }

    setSaved(false);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      setError('');
      try {
        await api.patch('/users/me/tech-stack', { techStack: stack });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch {
        setError('Erreur lors de la sauvegarde — réessayez.');
      } finally {
        setSaving(false);
      }
    }, 1000);

    return () => clearTimeout(saveTimerRef.current);
  }, [stack, loading]);

  const toggleOption = (categoryId, option) => {
    setStack(prev => {
      const current = prev[categoryId] || [];
      const updated = current.includes(option)
        ? current.filter(x => x !== option)
        : [...current, option];
      return { ...prev, [categoryId]: updated };
    });
  };

  const setAutre = (categoryId, value) => {
    setStack(prev => ({ ...prev, [`${categoryId}_autre`]: value }));
  };

  const totalSelected = CATEGORIES.reduce((acc, cat) => {
    const sel = stack[cat.id] || [];
    const hasCustomAutre = sel.includes('Autre') && stack[`${cat.id}_autre`];
    return acc + sel.filter(x => x !== 'Autre').length + (hasCustomAutre ? 1 : 0);
  }, 0);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-blabia-blue border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <Link
          to="/dashboard"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-5"
        >
          ← Tableau de bord
        </Link>

        {/* En-tête */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Mon environnement technique</h1>
              <p className="text-sm text-gray-500 mt-1">
                Cochez les outils que vous utilisez — ils seront injectés automatiquement dans vos exports Claude Code.
              </p>
            </div>
            <div className="shrink-0 text-right">
              {saving && (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">
                  <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                  Sauvegarde…
                </span>
              )}
              {saved && !saving && (
                <span className="inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                  Environnement sauvegardé
                </span>
              )}
            </div>
          </div>

          {totalSelected > 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs text-blabia-blue">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
              </svg>
              <span>{totalSelected} outil{totalSelected > 1 ? 's' : ''} sélectionné{totalSelected > 1 ? 's' : ''} — injecté{totalSelected > 1 ? 's' : ''} dans vos prompts Claude Code</span>
            </div>
          )}

          {error && (
            <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Catégories */}
        <div className="space-y-4">
          {CATEGORIES.map(cat => (
            <CategoryCard
              key={cat.id}
              category={cat}
              stack={stack}
              onToggle={toggleOption}
              onAutreChange={setAutre}
            />
          ))}
        </div>

        <p className="text-xs text-gray-400 text-center mt-6 pb-4">
          Les modifications sont sauvegardées automatiquement.
        </p>
      </div>
    </Layout>
  );
}
