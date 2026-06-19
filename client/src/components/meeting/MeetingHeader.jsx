import { Link } from 'react-router-dom';
import AgentScopeSelector from './AgentScopeSelector';

export default function MeetingHeader({
  projectId,
  session,
  isClosed,
  badge,
  // Task editing
  editingTask, setEditingTask, taskDraft, setTaskDraft, savingTask, handleSaveTask,
  // Intention
  intentionMeta, currentIntention, deliverableTypes,
  showIntentionDropdown, setShowIntentionDropdown, savingIntention, handleSaveIntention,
  intentionDropdownRef,
  // Decisions panel toggle
  showDecisions, setShowDecisions, decisions, pendingDecisionCount,
  // Tokens
  tokensUsed,
  // Menu dots
  showMenuDots, setShowMenuDots, setShowResetModal, menuDotsRef,
  // Agents
  activeAgents, agentColors,
  showAgentDropdown, setShowAgentDropdown, dropdownRef,
  loadingAvailable, availableForAdd, addingAgentId, handleAddAgent,
  dropdownCreateForm, setDropdownCreateForm, handleDropdownCreateAgent,
}) {
  return (
    <div className="shrink-0 border-b border-gray-100 px-4 py-3 space-y-2">
      {/* Ligne 1 : retour + titre éditable + badges */}
      <div className="flex items-center gap-2">
        <Link
          to={`/projects/${projectId}`}
          className="text-gray-400 hover:text-gray-600 transition text-sm shrink-0"
        >
          ←
        </Link>

        {/* Titre / objectif — éditable si réunion ouverte */}
        {editingTask ? (
          <input
            autoFocus
            value={taskDraft}
            onChange={e => setTaskDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  { e.preventDefault(); handleSaveTask(); }
              if (e.key === 'Escape') setEditingTask(false);
            }}
            disabled={savingTask}
            className="flex-1 text-sm font-semibold text-gray-800 bg-gray-50 border border-blue-300 rounded-lg px-2 py-0.5 outline-none focus:ring-2 focus:ring-blue-400 min-w-0"
          />
        ) : (
          <p
            className={`text-sm font-semibold text-gray-800 truncate flex-1 min-w-0 ${!isClosed ? 'cursor-pointer hover:text-blabia-blue transition' : ''}`}
            title={isClosed ? session.task : `${session.task} — cliquer pour modifier`}
            onClick={() => { if (!isClosed) { setTaskDraft(session.task); setEditingTask(true); } }}
          >
            🎯 {session.task}
          </p>
        )}

        {/* Badge livrable — dropdown si réunion ouverte */}
        <div className="relative shrink-0" ref={intentionDropdownRef}>
          <button
            onClick={() => { if (!isClosed) setShowIntentionDropdown(v => !v); }}
            disabled={savingIntention}
            className={`text-xs font-medium px-2.5 py-1 rounded-full border transition flex items-center gap-1 ${
              isClosed
                ? 'bg-gray-50 border-gray-200 text-gray-500 cursor-default'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 cursor-pointer'
            }`}
          >
            {intentionMeta.icon} {intentionMeta.label}
          </button>
          {showIntentionDropdown && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
              {deliverableTypes.map(d => (
                <button
                  key={d.id}
                  onClick={() => handleSaveIntention(d.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 transition ${d.id === currentIntention ? 'font-semibold text-blabia-blue' : 'text-gray-700'}`}
                >
                  <span>{d.icon}</span>
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Badge 📌 Décisions */}
        <button
          onClick={() => setShowDecisions(v => !v)}
          className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border transition flex items-center gap-1.5 ${
            showDecisions
              ? 'bg-amber-200 border-amber-300 text-amber-800'
              : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
          }`}
        >
          📌 {decisions.length > 0 ? `(${decisions.length})` : ''}
          {pendingDecisionCount > 0 && (
            <span className="text-[10px] bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full font-semibold leading-none">
              ⏸ {pendingDecisionCount}
            </span>
          )}
        </button>

        {/* Badge tokens consommés */}
        {tokensUsed && (
          <span
            className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border bg-gray-50 border-gray-200 text-gray-500 cursor-default"
            title={`Input : ${tokensUsed.input.toLocaleString('fr-FR')} tokens · Output : ${tokensUsed.output.toLocaleString('fr-FR')} tokens`}
          >
            🔢 {tokensUsed.total.toLocaleString('fr-FR')}
          </span>
        )}

        {/* Badge statut */}
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${badge.cls}`}>
          {badge.label}
        </span>

        {/* Menu ⋮ */}
        <div className="relative shrink-0 ml-auto" ref={menuDotsRef}>
          <button
            onClick={() => setShowMenuDots(v => !v)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
            title="Actions"
          >
            ⋮
          </button>
          {showMenuDots && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-30 py-1 overflow-hidden">
              <button
                onClick={() => { setShowMenuDots(false); setShowResetModal(true); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-amber-700 hover:bg-amber-50 transition"
              >
                🔄 Réinitialiser cette réunion
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Ligne 2 : chips agents */}
      <div className="flex items-center gap-2 flex-wrap">
        {activeAgents.map((agent, i) => {
          const color = agentColors[i % agentColors.length];
          return (
            <span
              key={agent.id || agent.name}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${color.bg} ${color.text}`}
            >
              <span>{agent.emoji || '🤖'}</span>
              {agent.name}
            </span>
          );
        })}

        {/* Dropdown + Agent */}
        {!isClosed && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowAgentDropdown(v => !v)}
              className="inline-flex items-center gap-1 text-xs text-blabia-blue border border-blue-200 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-full transition"
            >
              + Agent
            </button>

            {showAgentDropdown && (
              <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                {loadingAvailable ? (
                  <div className="flex justify-center py-4">
                    <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : availableForAdd.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4 px-3">
                    Tous les agents du projet sont déjà dans la réunion.
                  </p>
                ) : (
                  <>
                    <ul className="py-1 max-h-40 overflow-y-auto">
                      {availableForAdd.map(a => {
                        const id = a.agentId || a.id;
                        return (
                          <li key={id}>
                            <button
                              onClick={() => handleAddAgent(id)}
                              disabled={addingAgentId === id}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 text-left transition disabled:opacity-50"
                            >
                              <span className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-sm shrink-0">
                                {a.emoji || a.name?.[0] || '?'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{a.name}</p>
                                <p className="text-xs text-gray-400 truncate">{a.role}</p>
                              </div>
                              {addingAgentId === id && (
                                <span className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {/* Formulaire création inline */}
                    <div className="border-t border-gray-100">
                      {dropdownCreateForm.open ? (
                        <div className="p-2 space-y-1.5">
                          <input
                            autoFocus
                            type="text" placeholder="Nom de l'agent"
                            value={dropdownCreateForm.name}
                            onChange={e => setDropdownCreateForm(p => ({ ...p, name: e.target.value }))}
                            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-400"
                          />
                          <input
                            type="text" placeholder="Rôle"
                            value={dropdownCreateForm.role}
                            onChange={e => setDropdownCreateForm(p => ({ ...p, role: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') handleDropdownCreateAgent(); }}
                            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-400"
                          />
                          {dropdownCreateForm.error && (
                            <p className="text-[10px] text-red-500">{dropdownCreateForm.error}</p>
                          )}
                          <AgentScopeSelector
                            scope={dropdownCreateForm.scope}
                            onChange={scope => setDropdownCreateForm(p => ({ ...p, scope }))}
                            size="xs"
                          />
                          <div className="flex gap-1.5">
                            <button
                              onClick={handleDropdownCreateAgent}
                              disabled={!dropdownCreateForm.name.trim() || !dropdownCreateForm.role.trim() || dropdownCreateForm.creating}
                              className="flex-1 bg-blabia-blue hover:bg-blabia-blue text-white text-xs font-medium py-1.5 rounded-lg disabled:opacity-50"
                            >
                              {dropdownCreateForm.creating ? '…' : 'Créer et inviter'}
                            </button>
                            <button
                              onClick={() => setDropdownCreateForm({ open: false, name: '', role: '', creating: false, error: '', scope: 'project' })}
                              className="text-xs text-gray-400 hover:text-gray-600 px-2"
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDropdownCreateForm(p => ({ ...p, open: true }))}
                          className="w-full text-xs text-gray-400 hover:text-blabia-blue hover:bg-gray-50 py-2 px-3 text-left transition"
                        >
                          + Créer un agent…
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
