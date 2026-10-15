import { Megaphone, UserRound } from 'lucide-react';
import { AgentAvatar } from '../ui/icons';

// Vue « salle » (v5.1, 16/10/2026, bras droit étape 3) : une vignette par participant, comme
// en visio — l'animation (ou le bras droit quand il tient la réunion), les agents, et vous.
// Celui qui parle est entouré : l'agent en train d'écrire (flux direct) ou l'auteur du
// dernier message s'il est récent (réunion suivie en retrait, mise à jour périodique).
const RECENT_MS = 45000;

function Tile({ active, label, sub, children, dashed = false }) {
  return (
    <div className={`relative min-w-[132px] flex-1 rounded-2xl px-3 py-3 flex flex-col items-center gap-2 transition
      ${dashed ? 'border-2 border-dashed border-action-border bg-white' : 'bg-canvas-deep border border-line'}
      ${active ? 'ring-2 ring-ai ring-offset-2 ring-offset-canvas' : ''}`}>
      {active && <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-ai"><span className="w-2 h-2 rounded-full bg-ai animate-pulse" aria-hidden="true" />parle</span>}
      {children}
      <p className="text-[13px] font-bold text-ink text-center leading-tight">{label}</p>
      {sub && <p className="text-[11px] text-ink-muted text-center leading-tight -mt-1.5">{sub}</p>}
    </div>
  );
}

export default function VisioStrip({ agents, agentColors, messages, streamingAgent, delegateRunning = false }) {
  const last = [...messages].reverse().find(m => m.role === 'agent' || m.type === 'animator');
  const recent = last && (!last.timestamp || Date.now() - new Date(last.timestamp).getTime() < RECENT_MS);
  const speaker = streamingAgent || (recent ? (last.type === 'animator' ? '__animator__' : last.agentName) : null);
  const animatorActive = speaker === '__animator__' || speaker === 'BlabIA';

  return (
    <section aria-label="Participants de la réunion" className="shrink-0 px-3 sm:px-4 pt-3">
      <div className="max-w-[1100px] mx-auto flex gap-2.5 overflow-x-auto pb-1">
        <Tile active={animatorActive} label={delegateRunning ? 'Bras droit' : 'Animation'} sub={delegateRunning ? 'anime à votre place' : 'cadre la réunion'}>
          <span aria-hidden="true" className="w-12 h-12 rounded-full bg-ai text-white inline-flex items-center justify-center">
            {delegateRunning ? <span className="text-base font-extrabold">BD</span> : <Megaphone size={20} />}
          </span>
        </Tile>
        {agents.map((a, i) => {
          const c = agentColors[i % agentColors.length];
          return (
            <Tile key={a.id || a.name} active={speaker === a.name} label={a.name} sub={a.role}>
              <AgentAvatar agent={a} size="lg" className={`${c.avatar} text-white !w-12 !h-12`} />
            </Tile>
          );
        })}
        <Tile dashed label="Vous" sub={delegateRunning ? 'en retrait' : 'participant'}>
          <span aria-hidden="true" className="w-12 h-12 rounded-full bg-action-light text-action inline-flex items-center justify-center"><UserRound size={20} /></span>
        </Tile>
      </div>
    </section>
  );
}
