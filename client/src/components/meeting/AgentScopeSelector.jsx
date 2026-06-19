export default function AgentScopeSelector({ scope, onChange, size = 'sm' }) {
  return (
    <div className="space-y-1">
      <p className={`${size === 'xs' ? 'text-[10px]' : 'text-xs'} font-medium text-gray-500`}>Disponibilité :</p>
      <div className="flex flex-col gap-1">
        {[
          { value: 'project', label: 'Pour ce projet uniquement', desc: null },
          { value: 'global',  label: 'Enregistrer dans BlabIA',   desc: 'Disponible dans tous vos projets' },
        ].map(opt => (
          <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              value={opt.value}
              checked={scope === opt.value}
              onChange={() => onChange(opt.value)}
              className="mt-0.5 shrink-0 accent-blabia-blue"
            />
            <div>
              <span className={`${size === 'xs' ? 'text-[11px]' : 'text-xs'} font-medium text-gray-700`}>{opt.label}</span>
              {opt.desc && <p className="text-[10px] text-gray-400 leading-tight">{opt.desc}</p>}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
