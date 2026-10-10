import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }

    api.get('/auth/me')
      .then(({ data }) => setUser(data))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  // Ouvre la session (connexion ou inscription par invitation)
  const signIn = (token, nextUser) => {
    localStorage.setItem('token', token);
    setUser(nextUser);
  };

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    signIn(data.token, data.user);
    return data.user;
  };

  // Guide de prise en main : vu (terminé ou fermé) — mémorisé côté serveur, tous appareils
  const markTutorialSeen = async () => {
    setUser(u => u && { ...u, tutorialSeenAt: u.tutorialSeenAt || new Date().toISOString() });
    try { await api.post('/users/me/tutorial-seen'); } catch { /* sans gravité : reproposé à la prochaine connexion */ }
  };

  // Mise à jour locale du profil (ex. progression de la visite guidée)
  const patchUser = patch => setUser(u => u && { ...u, ...patch });

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signIn, logout, markTutorialSeen, patchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
