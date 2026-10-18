import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import ExportModal from './ExportModal';
import SummaryDisplayModal from './SummaryDisplayModal';
import QuickExportModal from './QuickExportModal';
import { SessionDrawer } from './meeting/MilestoneDrawers';
import { notifyError } from '../utils/notify';
import PlanBoard from './project/PlanBoard';
import { Code2, Zap, Users, X } from 'lucide-react';

// ── Page Plan (refonte UX v5.1) : données du plan et fenêtres liées ────────────
// (l'ancienne colonne latérale « Réunions » a été retirée ; affichage : project/PlanBoard)
export default function ProjectTimelinePanel({ projectId, refreshKey = 0 }) {
  const navigate = useNavigate();

  const [milestones, setMilestones]             = useState([]);
  const [milestoneSessions, setMilestoneSessions] = useState({});
  const [loading, setLoading]                   = useState(true);
  const [promptViewSession,  setPromptViewSession]  = useState(null); // prompt (deliverable) → ExportModal
  const [summaryViewSession, setSummaryViewSession] = useState(null); // compte-rendu → SummaryDisplayModal
  const [sessionDrawer, setSessionDrawer]             = useState(null); // { milestone, linked }
  const [techChoiceMilestone, setTechChoiceMilestone] = useState(null);
  const [quickExportMilestone, setQuickExportMilestone] = useState(null);

  const loadMilestones = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/projects/${projectId}/plan`);
      setMilestones(data.milestones || []);
      setMilestoneSessions(data.milestoneSessions || {});
    } catch (err) { notifyError(err, 'Impossible de charger le plan des réunions.'); }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadMilestones(); }, [loadMilestones, refreshKey]);

  const handleAdd = async ({ title, type }) => {
    try {
      await api.post(`/projects/${projectId}/milestones`, { title, type });
      loadMilestones();
    } catch (err) { notifyError(err, 'La réunion n’a pas pu être ajoutée au plan.'); }
  };

  const handleDeleteMilestone = useCallback(async (milestoneId) => {
    if (!window.confirm('Supprimer cette réunion ? Cette action est irréversible.')) return false;
    try {
      await api.delete(`/projects/${projectId}/milestones/${milestoneId}`);
      loadMilestones();
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Erreur inconnue';
      alert(`Erreur lors de la suppression : ${msg}`);
    }
  }, [projectId, loadMilestones]);

  // Page Plan : bouton principal d'une réunion (préparer, reprendre ; réunion abandonnée → détail)
  const handleStart = (m, linked) => {
    if (linked?.status === 'abandoned') { setSessionDrawer({ milestone: m, linked }); return; }
    if (linked) { navigate(`/projects/${projectId}/meeting/${linked.id}`); return; }
    if (m.type === 'claude_code') { setTechChoiceMilestone(m); return; }
    navigate(`/projects/${projectId}/meeting/new`, { state: { milestoneId: m.id, milestoneTitle: m.title, milestoneType: m.type } });
  };

  const handleShowDeliverable = (session, type) => {
    if (type === 'claude_code') setPromptViewSession(session);
    else setSummaryViewSession(session);
  };

  return (
    <>
        <PlanBoard projectId={projectId} milestones={milestones} milestoneSessions={milestoneSessions} loading={loading}
          onOpen={(m, linked) => setSessionDrawer({ milestone: m, linked: linked || null })}
          onStart={handleStart} onShowDeliverable={handleShowDeliverable} onAdd={handleAdd} onRefresh={loadMilestones} />
        {/* Détail d'une réunion : panneau latéral */}
        {sessionDrawer && (
          <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Détail de la réunion">
            <div className="flex-1 bg-black/30" onClick={() => setSessionDrawer(null)} />
            <div className="relative w-full max-w-md h-full shadow-2xl">
              <SessionDrawer
                milestone={sessionDrawer.milestone}
                linkedSession={sessionDrawer.linked}
                projectId={projectId}
                navigate={navigate}
                onClose={() => setSessionDrawer(null)}
                onRefresh={loadMilestones}
                onShowDeliverable={handleShowDeliverable}
                onDeleteMilestone={async id => { if (await handleDeleteMilestone(id)) setSessionDrawer(null); }}
                onStart={m => handleStart(m, null)}
              />
            </div>
          </div>
        )}

      {/* ── ExportModal lecture seule (prompt déjà stocké dans session.deliverable) ── */}
      {promptViewSession && (
        <ExportModal
          directContent={promptViewSession.deliverable || promptViewSession.summary}
          projectId={projectId}
          onClose={() => setPromptViewSession(null)}
        />
      )}

      {/* ── SummaryDisplayModal (compte-rendu) ────────────────────────────── */}
      {summaryViewSession && (
        <SummaryDisplayModal
          title={summaryViewSession.task}
          date={summaryViewSession.createdAt
            ? new Date(summaryViewSession.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
            : ''}
          content={summaryViewSession.summary}
          onClose={() => setSummaryViewSession(null)}
        />
      )}

      {/* ── Choix : mode rapide vs réunion (type claude_code sans session) ── */}
      {techChoiceMilestone && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full sm:max-w-md p-5 space-y-3">
            <div className="flex items-start gap-3 mb-1">
              <span className="w-10 h-10 shrink-0 rounded-xl bg-action-light text-action inline-flex items-center justify-center">
                <Code2 size={20} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <h2 className="text-base font-bold text-ink flex-1 leading-snug">
                {techChoiceMilestone.title}
              </h2>
              <button onClick={() => setTechChoiceMilestone(null)} aria-label="Fermer"
                className="w-9 h-9 inline-flex items-center justify-center rounded-[10px] text-ink-muted hover:bg-muted-light hover:text-ink transition shrink-0">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-ink-soft">Comment voulez-vous avancer sur cette tâche technique ?</p>

            <button
              onClick={() => { setQuickExportMilestone(techChoiceMilestone); setTechChoiceMilestone(null); }}
              className="w-full flex items-start gap-3 p-4 border-2 border-ai-border bg-ai-bg hover:border-ai hover:bg-ai-light rounded-xl transition text-left"
            >
              <Zap size={22} strokeWidth={1.75} aria-hidden="true" className="shrink-0 mt-0.5 text-ai" />
              <div>
                <p className="text-sm font-bold text-ai">Générer directement un prompt</p>
                <p className="text-sm text-ink-soft mt-0.5 leading-snug">
                  Créer un prompt Claude Code à partir du titre de la réunion — rapide, sans réunion
                </p>
              </div>
            </button>

            <button
              onClick={() => {
                navigate(`/projects/${projectId}/meeting/new`, {
                  state: {
                    milestoneId:    techChoiceMilestone.id,
                    milestoneTitle: `Implémenter : ${techChoiceMilestone.title}`,
                    milestoneType:  techChoiceMilestone.type
                  }
                });
                setTechChoiceMilestone(null);
              }}
              className="w-full flex items-start gap-3 p-4 border-2 border-action-border bg-action-light hover:border-action hover:bg-action-light rounded-xl transition text-left"
            >
              <Users size={22} strokeWidth={1.75} aria-hidden="true" className="shrink-0 mt-0.5 text-action" />
              <div>
                <p className="text-sm font-bold text-action-dark">Démarrer une réunion</p>
                <p className="text-sm text-ink-soft mt-0.5 leading-snug">
                  Lancer une réunion d'assistants pour explorer la tâche et préparer l'implémentation
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ── QuickExportModal (mode rapide sans session) ──────────────────── */}
      {quickExportMilestone && (
        <QuickExportModal
          milestone={quickExportMilestone}
          projectId={projectId}
          onClose={() => setQuickExportMilestone(null)}
          onRefresh={loadMilestones}
        />
      )}
    </>
  );
}
