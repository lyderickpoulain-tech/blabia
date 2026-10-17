import { COST_TYPES } from '../../utils/toolsCatalog';

// Édition du coût d'un outil : type, fourchette €/mois, limite gratuite.
export default function ToolCostEditor({ cost, onChange }) {
  const c = cost || { type: 'free', monthlyMin: 0, monthlyMax: 0, freeTier: null };
  const set = (patch) => onChange({ ...c, ...patch });
  const num = (v) => (v === '' ? null : Math.max(0, Number(v)));

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <select
        value={c.type}
        onChange={e => set({ type: e.target.value, ...(e.target.value === 'free' ? { monthlyMin: 0, monthlyMax: 0 } : {}) })}
        className="border border-line rounded-lg px-2 py-1 bg-white outline-none"
      >
        {Object.entries(COST_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {c.type !== 'free' && (
        <>
          <label className="flex items-center gap-1 text-ink-muted">
            de
            <input type="number" min="0" value={c.monthlyMin ?? ''} onChange={e => set({ monthlyMin: num(e.target.value) })}
              className="w-16 border border-line rounded-lg px-1.5 py-1 outline-none" />
          </label>
          <label className="flex items-center gap-1 text-ink-muted">
            à
            <input type="number" min="0" value={c.monthlyMax ?? ''} onChange={e => set({ monthlyMax: num(e.target.value) })}
              className="w-16 border border-line rounded-lg px-1.5 py-1 outline-none" />
            €/mois
          </label>
        </>
      )}
      {c.type === 'freemium' && (
        <input
          value={c.freeTier || ''}
          onChange={e => set({ freeTier: e.target.value || null })}
          placeholder="Limite gratuite (ex. 3 000 emails/mois)"
          className="flex-1 min-w-[180px] border border-line rounded-lg px-2 py-1 outline-none"
        />
      )}
    </div>
  );
}
