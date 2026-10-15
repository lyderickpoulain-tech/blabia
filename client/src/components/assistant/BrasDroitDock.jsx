import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Maximize2, Inbox } from 'lucide-react';
import AssistantChat, { Avatar } from './AssistantChat';

// Le bras droit, toujours à portée de main (v5.1, 16/10/2026) : un bouton en bas à droite de
// chaque page du projet (et de la salle de réunion), avec la pastille de ce qui attend
// l'humain ; un clic ouvre la conversation. Quand il a du nouveau (réunion qu'il a tenue,
// réponse…), c'est LUI qui revient vers vous : une bulle s'ouvre au-dessus du bouton.

const seenKey = projectId => `blabia:bd-seen:${projectId}`;
const readSeen = projectId => { try { return localStorage.getItem(seenKey(projectId)); } catch { return null; } };
const writeSeen = (projectId, id) => { try { localStorage.setItem(seenKey(projectId), id); } catch { /* stockage indisponible : la bulle reviendra */ } };

function nudgeText(last) {
  const r = last.report;
  if (r) {
    const parts = [`J’ai terminé la réunion « ${r.meetingTitle} ».`];
    if (r.decided?.length) parts.push(`${r.decided.length} décision${r.decided.length > 1 ? 's' : ''} prise${r.decided.length > 1 ? 's' : ''} dans votre cadre`);
    if (r.waiting?.length) parts.push(`${r.waiting.length} question${r.waiting.length > 1 ? 's' : ''} pour vous`);
    return parts.length > 1 ? `${parts[0]} ${parts.slice(1).join(', ')}.` : parts[0];
  }
  const t = String(last.content || '').replace(/\s+/g, ' ');
  return t.length > 160 ? `${t.slice(0, 160)}…` : t;
}

export default function BrasDroitDock({ project, inbox, onChanged, liftForInput = false }) {
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(null);
  const last = inbox?.lastAssistant || null;
  const count = inbox?.count || 0;

  // Retour proactif : un message du bras droit que vous n'avez pas encore vu
  useEffect(() => {
    if (!inbox) return;
    const seen = readSeen(project.id);
    // Première visite : rien à rappeler du passé (« none » : il n'a encore jamais écrit)
    if (!seen) { writeSeen(project.id, last?.id || 'none'); return; }
    if (last && seen !== last.id && !open) setNudge(last);
  }, [inbox, last?.id, project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openChat = () => {
    setOpen(true);
    setNudge(null);
    if (last) writeSeen(project.id, last.id);
  };
  const dismiss = () => { setNudge(null); if (last) writeSeen(project.id, last.id); };

  const bottom = liftForInput ? 'bottom-24' : 'bottom-5';
  return (
    <>
      {nudge && !open && (
        <div role="status" className={`fixed right-5 ${liftForInput ? 'bottom-[168px]' : 'bottom-[100px]'} z-50 w-[340px] max-w-[calc(100vw-40px)] bg-white border border-ai-border rounded-2xl shadow-xl p-4 space-y-3`}>
          <div className="flex gap-2.5">
            <Avatar size="sm" />
            <p className="flex-1 text-sm text-ink-soft leading-snug">{nudgeText(nudge)}</p>
            <button type="button" onClick={dismiss} aria-label="Plus tard" className="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-md text-ink-faint hover:bg-muted-light"><X size={15} /></button>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={dismiss} className="h-9 px-3 rounded-[10px] text-[13px] font-bold text-ink-muted hover:bg-muted-light">Plus tard</button>
            <button type="button" onClick={openChat} className="h-9 px-3 rounded-[10px] bg-ai text-white text-[13px] font-bold hover:opacity-90">Voir</button>
          </div>
        </div>
      )}

      {open && (
        <section aria-label="Votre bras droit" className={`fixed right-4 ${liftForInput ? 'bottom-[168px]' : 'bottom-[100px]'} z-50 w-[420px] max-w-[calc(100vw-32px)] h-[min(640px,calc(100vh-140px))] bg-white border border-line rounded-2xl shadow-2xl flex flex-col overflow-hidden`}>
          <header className="shrink-0 flex items-center gap-2.5 px-4 py-3 border-b border-line">
            <Avatar />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold text-ink">Votre bras droit</p>
              <p className="text-[11px] text-ink-muted truncate">Il connaît tout « {project.name} »</p>
            </div>
            <Link to={`/projects/${project.id}/bras-droit`} onClick={() => setOpen(false)} aria-label="Ouvrir en grand" title="Ouvrir en grand"
              className="w-9 h-9 inline-flex items-center justify-center rounded-[10px] text-ink-muted hover:bg-muted-light"><Maximize2 size={16} /></Link>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="w-9 h-9 inline-flex items-center justify-center rounded-[10px] text-ink-muted hover:bg-muted-light"><X size={18} /></button>
          </header>
          {(count > 0 || inbox?.running?.length > 0) && (
            <Link to={`/projects/${project.id}/a-trancher`} onClick={() => setOpen(false)}
              className="shrink-0 flex items-center gap-2 px-4 py-2 bg-await-bg border-b border-await-border text-[13px] font-bold text-await hover:underline">
              <Inbox size={15} aria-hidden="true" />
              {count > 0 ? `${count} élément${count > 1 ? 's' : ''} à trancher` : ''}
              {inbox?.running?.length > 0 && <span className="text-ai font-semibold">{count > 0 ? ' · ' : ''}{inbox.running.length > 1 ? `${inbox.running.length} réunions en cours sans vous` : `« ${inbox.running[0].task} » en cours sans vous`}</span>}
            </Link>
          )}
          <AssistantChat project={project} compact reloadKey={last?.id} onChanged={onChanged} />
        </section>
      )}

      <button type="button" onClick={() => (open ? setOpen(false) : openChat())} aria-expanded={open}
        aria-label={`Votre bras droit${count ? ` — ${count} élément${count > 1 ? 's' : ''} à trancher` : ''}`}
        className={`fixed right-5 ${bottom} z-50 w-16 h-16 rounded-full bg-ai text-white shadow-xl inline-flex items-center justify-center font-extrabold text-lg hover:scale-105 transition ${nudge ? 'ring-4 ring-ai-border animate-pulse' : ''}`}>
        {open ? <X size={22} aria-hidden="true" /> : 'BD'}
        {!open && count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[24px] h-6 px-1.5 rounded-full bg-await text-white text-xs font-extrabold inline-flex items-center justify-center border-2 border-white">{count}</span>
        )}
        {!open && inbox?.running?.length > 0 && <span className="absolute -bottom-0.5 -left-0.5 w-4 h-4 rounded-full bg-ok border-2 border-white" title="Une réunion tourne sans vous" />}
      </button>
    </>
  );
}
