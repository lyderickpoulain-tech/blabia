import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui';
import ThemeToggle from '../components/ThemeToggle';
import api from '../utils/api';

const inputCls = 'w-full h-11 px-3.5 border border-line rounded-[10px] text-sm text-ink bg-white outline-none focus:ring-2 focus:ring-action focus:border-transparent transition';
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-bold text-ink-soft mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-ink-faint mt-1">{hint}</span>}
    </label>
  );
}

export default function Login() {
  const { login, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invitationToken = searchParams.get('token');
  const mode = invitationToken ? 'register' : 'login';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Le mot de passe doit faire au moins 8 caractères.');
    if (password !== passwordConfirm) return setError('Les mots de passe ne correspondent pas.');
    if (username.trim() && !USERNAME_RE.test(username.trim())) return setError('Pseudo invalide : 3 à 20 caractères, lettres, chiffres, - ou _.');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', { token: invitationToken, password, username: username.trim() || undefined });
      signIn(data.token, data.user); // session ouverte : pas de reconnexion à faire
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || "Erreur lors de l'inscription");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4 relative">
      <div className="absolute top-3 right-3"><ThemeToggle /></div>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <span className="logo-chip"><img src="/logo.png" alt="BlabIA" className="h-16 mx-auto" /></span>
          <p className="text-sm text-ink-muted mt-2">Une équipe d'agents IA pour faire avancer vos projets. Vous tranchez.</p>
        </div>

        <div className="bg-white border border-line rounded-2xl shadow-sm p-6 sm:p-8">
          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <h1 className="text-xl font-extrabold text-ink">Connexion</h1>
              <Field label="E-mail">
                <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="vous@email.com" className={inputCls} autoFocus />
              </Field>
              <Field label="Mot de passe">
                <input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" className={inputCls} />
              </Field>
              {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-[10px] text-sm">{error}</div>}
              <Button type="submit" variant="primary" disabled={loading} className="w-full">
                <LogIn size={17} aria-hidden="true" /> {loading ? 'Connexion…' : 'Se connecter'}
              </Button>
              <p className="text-xs text-ink-faint text-center">BlabIA fonctionne sur invitation. Pas encore de compte ? Demandez une invitation à un administrateur.</p>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <h1 className="text-xl font-extrabold text-ink">Activer votre compte</h1>
              <p className="text-sm text-ink-soft bg-action-light/60 border border-action-border rounded-[10px] px-3.5 py-2.5">
                Vous avez été invité à rejoindre BlabIA. Choisissez votre mot de passe pour activer votre compte.
              </p>
              <Field label="Mot de passe" hint="8 caractères minimum">
                <input type="password" required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" className={inputCls} autoFocus />
              </Field>
              <Field label="Confirmer le mot de passe">
                <input type="password" required autoComplete="new-password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)}
                  placeholder="••••••••" className={inputCls} />
              </Field>
              <Field label="Pseudo (optionnel)" hint="3 à 20 caractères : lettres, chiffres, - ou _. Permet d'être invité sur un projet par pseudo.">
                <div className="flex items-center gap-1.5">
                  <span className="text-ink-faint text-sm font-bold">@</span>
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="monpseudo" maxLength={20} className={inputCls} />
                </div>
              </Field>
              {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-[10px] text-sm">{error}</div>}
              <Button type="submit" variant="primary" disabled={loading} className="w-full">
                <UserPlus size={17} aria-hidden="true" /> {loading ? 'Création du compte…' : 'Activer mon compte'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
