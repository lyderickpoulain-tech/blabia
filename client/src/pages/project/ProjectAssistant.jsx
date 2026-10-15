import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, CalendarClock, Inbox } from 'lucide-react';
import api from '../../utils/api';
import { useProject } from '../../components/project/ProjectShell';
import { Button, Card } from '../../components/ui';
import { notifyError } from '../../utils/notify';
import DelegateMeetingModal from '../../components/DelegateMeetingModal';
import AssistantChat, { Avatar, MeetingChoices } from '../../components/assistant/AssistantChat';
import InboxList from '../../components/assistant/InboxList';

// Bras droit en grand (v5.1) : la même conversation que le panneau toujours disponible en bas
// à droite (BrasDroitDock), avec la prochaine réunion et ce qui vous attend.
export default function ProjectAssistant() {
  const { project, inbox, refreshInbox } = useProject();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [delegating, setDelegating] = useState(null);
  const [chatKey, setChatKey] = useState(0);

  useEffect(() => {
    api.get(`/projects/${project.id}/plan`).then(({ data }) => setPlan(data)).catch(() => setPlan({ milestones: [] }));
  }, [project.id]);

  const clear = async () => {
    if (!confirm('Effacer votre conversation avec le bras droit ? Le projet (réunions, décisions, actions) n’est pas touché.')) return;
    try { await api.delete(`/projects/${project.id}/assistant`); setChatKey(k => k + 1); }
    catch (err) { notifyError(err, 'La conversation n’a pas pu être effacée.'); }
  };
  const startMeeting = (m, prepare) => navigate(`/projects/${project.id}/meeting/new`, {
    state: { milestoneId: m.milestoneId || m.id, milestoneTitle: m.title, milestoneType: m.type, autoPrepare: prepare },
  });

  const milestones = [...(plan?.milestones || [])].sort((a, b) => a.displayOrder - b.displayOrder);
  const nextIdx = milestones.findIndex(m => m.status !== 'done');
  const next = nextIdx >= 0 ? milestones[nextIdx] : null;

  return (
    <div className="flex flex-wrap gap-5 items-start">
      <section className="flex-[999_1_560px] min-w-0 flex flex-col gap-4">
        <div className="flex items-center gap-3.5">
          <Avatar size="lg" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-extrabold text-ink">Votre bras droit</h1>
            <p className="text-sm text-ink-muted mt-0.5">Il connaît tout le projet, vérifie avant de répondre, tient des réunions à votre place et revient vers vous. Il ne modifie rien sans vous.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={clear} title="Effacer la conversation"><Trash2 size={15} aria-hidden="true" /> <span className="hidden sm:inline">Effacer</span></Button>
        </div>
        <Card className="p-0 overflow-hidden flex flex-col">
          <AssistantChat key={chatKey} project={project} reloadKey={`${chatKey}-${inbox?.lastAssistant?.id || ''}`} onChanged={refreshInbox} />
        </Card>
      </section>

      <aside aria-label="Prochaine réunion et ce qui vous attend" className="flex-[1_1_300px] max-w-full lg:max-w-[380px] flex flex-col gap-3">
        <Card className="p-4">
          <h2 className="text-sm font-extrabold text-ink flex items-center gap-2"><CalendarClock size={16} className="text-action" aria-hidden="true" /> Prochaine réunion</h2>
          {next ? (
            <>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink-faint mt-2">R{nextIdx + 1}</p>
              <p className="text-[15px] font-extrabold text-ink">{next.title}</p>
              {!project.isDemo && <MeetingChoices meeting={{ ...next, ref: `R${nextIdx + 1}` }} stacked
                onDelegate={m => setDelegating(m)} onPrepare={m => startMeeting(m, true)} onHold={m => startMeeting(m, false)} />}
            </>
          ) : <p className="text-sm text-ink-muted mt-2">{milestones.length ? 'Toutes les réunions du plan sont tenues.' : 'Pas encore de plan.'} <Link to={`/projects/${project.id}`}>Tableau de bord</Link></p>}
        </Card>
        <h2 className="text-sm font-extrabold text-ink flex items-center gap-2 px-1"><Inbox size={16} className="text-await" aria-hidden="true" /> À trancher · {inbox?.count ?? '…'}</h2>
        <InboxList project={project} inbox={inbox} onChanged={refreshInbox} limit={3} compact />
      </aside>

      {delegating && (
        <DelegateMeetingModal project={project} milestone={delegating} onClose={() => setDelegating(null)}
          onLaunched={() => { setDelegating(null); refreshInbox(); }} />
      )}
    </div>
  );
}
