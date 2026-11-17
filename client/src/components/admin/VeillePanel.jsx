import { useEffect, useState } from 'react';
import { Play, Radar } from 'lucide-react';
import { Button, Card } from '../ui';
import Markdown from '../Markdown';
import api from '../../utils/api';
import { notifyError, notifySuccess } from '../../utils/notify';
import { formatUSD } from '../../utils/cost';

// v6 : veille mensuelle des outils de BlabIA (agent programmé, premier lundi du mois).
// Les rapports arrivent aussi par e-mail ; l'agent ne modifie rien, le porteur décide.
const fmt = d => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export default function VeillePanel() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/admin/veille').then(({ data: d }) => { setData(d); setOpen(o => o ?? d.reports[0]?.id ?? null); }).catch(err => notifyError(err, 'La veille n’a pas pu être chargée'));
  useEffect(() => { load(); }, []);
  if (!data) return <p className="text-sm text-ink-muted">Chargement…</p>;
  const nextFirstMonday = (data.upcoming || []).map(t => new Date(t)).find(d => d.getDate() <= 7);

  const runNow = async () => {
    setBusy(true);
    try { await api.post('/admin/veille/run'); notifySuccess('La veille est lancée : le rapport arrive ici et par e-mail d’ici une quinzaine de minutes.'); }
    catch (err) { notifyError(err, 'La veille n’a pas pu être lancée'); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <Radar size={20} className="text-ai" aria-hidden="true" />
        <p className="text-sm text-ink-soft flex-1 min-w-[240px]">
          {data.enabled
            ? <>Chaque premier lundi du mois, un agent lit les nouveautés des outils de BlabIA, les failles de sécurité et les évolutions de la loi, puis vous propose ce qui vaut la peine d’être fait. Il ne modifie rien.{nextFirstMonday ? <> Prochaine veille : <strong>{fmt(nextFirstMonday)}</strong>.</> : ''}</>
            : 'La veille ne tourne que sur le BlabIA en ligne.'}
        </p>
        {data.enabled && <Button size="sm" variant="secondary" onClick={runNow} disabled={busy}><Play size={15} aria-hidden="true" /> Lancer maintenant</Button>}
      </Card>
      {data.reports.length === 0 && <p className="text-sm text-ink-muted">Aucun rapport pour l’instant.</p>}
      {data.reports.map(r => (
        <Card key={r.id} className="p-4">
          <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full text-left flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-bold text-ink flex-1">Veille du {fmt(r.createdAt)}{r.trigger === 'manual' ? ' (lancée à la main)' : ''}</span>
            <span className="text-xs text-ink-faint">{r.costUSD != null ? formatUSD(Number(r.costUSD)) : ''}{r.emailedAt ? ' · envoyé par e-mail' : ''}</span>
          </button>
          {open === r.id && r.content && <div className="mt-3 border-t border-line pt-3 text-sm"><Markdown>{r.content}</Markdown></div>}
        </Card>
      ))}
    </div>
  );
}
