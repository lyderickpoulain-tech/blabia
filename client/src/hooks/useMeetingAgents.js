import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../utils/api';
import { notifyError } from '../utils/notify';
import useClickOutside from './useClickOutside';

// Agents en cours de réunion : menu « + Agent » (ajout d'un agent du projet, création),
// suggestions d'agents émises par les agents ([SUGGEST_AGENT]) : invitation ou création.
// Extrait de pages/MeetingRoom.jsx.

const EMPTY_FORM = { open: false, name: '', role: '', creating: false, error: '', scope: 'project' };

export default function useMeetingAgents({ projectId, sessionId, activeAgents, setActiveAgents, setMessages }) {
  const dropdownRef = useRef(null);
  const [showAgentDropdown,  setShowAgentDropdown]  = useState(false);
  const [availableForAdd,    setAvailableForAdd]    = useState([]);
  const [loadingAvailable,   setLoadingAvailable]   = useState(false);
  const [addingAgentId,      setAddingAgentId]      = useState(null);
  const [dropdownCreateForm, setDropdownCreateForm] = useState(EMPTY_FORM);

  // Suggestions d'agents reçues pendant la réunion (alimentées par le flux SSE)
  const [agentSuggestions, setAgentSuggestions] = useState([]);
  const agentSuggestionsRef = useRef([]);
  agentSuggestionsRef.current = agentSuggestions; // évite les closures périmées
  const markSuggestion = (idx, patch) => setAgentSuggestions(prev => prev.map((x, i) => i === idx ? { ...x, ...patch } : x));

  // Agents du projet pas encore présents, chargés à l'ouverture du menu
  const loadAvailableForAdd = useCallback(async (currentActive) => {
    setLoadingAvailable(true);
    try {
      const { data } = await api.get(`/projects/${projectId}/agents`);
      const enabled   = data.filter(a => a.enabled !== false);
      const activeIds = new Set((currentActive || activeAgents).map(a => a.id));
      setAvailableForAdd(enabled.filter(a => !activeIds.has(a.agentId || a.id)));
    } catch (err) { notifyError(err, 'Impossible de charger les agents disponibles.'); }
    setLoadingAvailable(false);
  }, [projectId, activeAgents]);

  useEffect(() => {
    if (showAgentDropdown) loadAvailableForAdd();
  }, [showAgentDropdown]); // eslint-disable-line react-hooks/exhaustive-deps
  useClickOutside(dropdownRef, showAgentDropdown, () => setShowAgentDropdown(false));

  // Ajouter un agent à la réunion (menu + cartes de suggestion)
  const handleAddAgent = useCallback(async (agentId) => {
    if (addingAgentId) return null;
    setAddingAgentId(agentId);
    try {
      const { data } = await api.post(`/projects/${projectId}/sessions/${sessionId}/add-agent`, { agentId });
      setActiveAgents(prev => [...prev, data.agent]);
      setMessages(prev => [...prev, {
        id: `sys-${Date.now()}`, role: 'system', agentName: null,
        content: `${data.agent.name} a rejoint la réunion.`,
        timestamp: new Date().toISOString(), type: 'message', pinned: false,
      }]);
      setShowAgentDropdown(false);
      return data.agent;
    } catch (err) {
      notifyError(err, 'L’agent n’a pas pu rejoindre la réunion.');
      return null;
    } finally {
      setAddingAgentId(null);
    }
  }, [addingAgentId, projectId, sessionId, setActiveAgents, setMessages]);

  // Créer un agent depuis le menu « + Agent » et l'ajouter à la réunion
  const handleDropdownCreateAgent = useCallback(async () => {
    const { name, role } = dropdownCreateForm;
    if (!name.trim() || !role.trim()) return;
    setDropdownCreateForm(p => ({ ...p, creating: true, error: '' }));
    try {
      const { data: agent } = await api.post('/agents', { name: name.trim(), role: role.trim() });
      await api.post(`/projects/${projectId}/agents`, { agentId: agent.id, source: 'manual' });
      await handleAddAgent(agent.id);
      setDropdownCreateForm(EMPTY_FORM);
    } catch (err) {
      setDropdownCreateForm(p => ({ ...p, creating: false, error: err.response?.data?.error || err.message || 'Erreur' }));
    }
  }, [dropdownCreateForm, projectId, handleAddAgent]);

  // Inviter un agent suggéré : présent dans la bibliothèque du projet → ajouté ; sinon formulaire
  const handleInviteSuggested = useCallback(async (idx) => {
    const s = agentSuggestionsRef.current[idx];
    if (!s || s.inviting) return;
    markSuggestion(idx, { inviting: true });
    try {
      const { data } = await api.get(`/projects/${projectId}/agents`);
      const match = data.find(a => a.name.toLowerCase() === s.name.toLowerCase() && a.enabled !== false);
      if (match) {
        await handleAddAgent(match.agentId || match.id);
        markSuggestion(idx, { invited: true, inviting: false });
      } else {
        markSuggestion(idx, { showCreate: true, inviting: false });
      }
    } catch (err) {
      notifyError(err, 'L’invitation de l’agent a échoué.');
      markSuggestion(idx, { inviting: false });
    }
  }, [projectId, handleAddAgent]);

  const handleDismissSuggestion = useCallback((idx) => markSuggestion(idx, { dismissed: true }), []);

  // Créer l'agent suggéré puis l'inviter
  const handleCreateAndInvite = useCallback(async (idx, form, scope = 'project') => {
    const s = agentSuggestionsRef.current[idx];
    if (!s || s.inviting) return;
    markSuggestion(idx, { inviting: true });
    try {
      const { data: agent } = await api.post('/agents', { name: form.name.trim(), role: form.role.trim(), systemPrompt: form.systemPrompt.trim() });
      await api.post(`/projects/${projectId}/agents`, { agentId: agent.id, source: scope === 'global' ? 'global' : 'suggestion' });
      await handleAddAgent(agent.id);
      markSuggestion(idx, { invited: true, inviting: false, showCreate: false });
    } catch (err) {
      notifyError(err, 'L’agent n’a pas pu être créé.');
      markSuggestion(idx, { inviting: false });
    }
  }, [projectId, handleAddAgent]);

  return {
    dropdownRef, showAgentDropdown, setShowAgentDropdown, availableForAdd, loadingAvailable, addingAgentId,
    dropdownCreateForm, setDropdownCreateForm, agentSuggestions, setAgentSuggestions, agentSuggestionsRef,
    loadAvailableForAdd, handleAddAgent, handleDropdownCreateAgent, handleInviteSuggested, handleDismissSuggestion, handleCreateAndInvite,
  };
}
