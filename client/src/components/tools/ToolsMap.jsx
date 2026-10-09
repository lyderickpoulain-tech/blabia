import { useState } from 'react';

// v5.0 phase 4.2 : carte des outils. Layout fixe par couches (positions dans le
// catalogue serveur, repère 1000 × 780) : Utilisateur → Interface → Serveur → Données,
// services autour du serveur, chaîne de livraison, outils transverses.
// items : [{ key, name, category, dashed, detail: { role, cost, status } }]
const W = 1000, H = 780;
const BOX = { main: { w: 200, h: 150 }, services: { w: 180, h: 150 }, delivery: { w: 200, h: 150 }, around: { w: 200, h: 140 } };
const USER_NODE = { x: 20, y: 75, w: 130, h: 60 };
const MAX_CHIPS = 3;

function boxOf(cat) {
  const size = BOX[cat.zone] || BOX.around;
  return { x: cat.map.x, y: cat.map.y, ...size };
}

const center = b => ({ cx: b.x + b.w / 2, cy: b.y + b.h / 2 });
const pct = (v, total) => `${(v / total) * 100}%`;

export default function ToolsMap({ catalog, items, emptyLabel = "rien ici pour l'instant" }) {
  const [selected, setSelected] = useState(null);
  if (!catalog) return null;

  const boxes = Object.fromEntries(catalog.categories.map(c => [c.id, boxOf(c)]));
  boxes.user = USER_NODE;
  const byCat = {};
  for (const it of items) (byCat[it.category] ||= []).push(it);

  return (
    <div>
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="relative" style={{ aspectRatio: `${W} / ${H}`, minWidth: 860 }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" aria-hidden="true">
            {catalog.links.map(([a, b]) => {
              if (!boxes[a] || !boxes[b]) return null;
              const p = center(boxes[a]), q = center(boxes[b]);
              return <line key={`${a}-${b}`} x1={p.cx} y1={p.cy} x2={q.cx} y2={q.cy} stroke="#cbd5e1" strokeWidth="2" />;
            })}
          </svg>

          <div
            className="absolute flex items-center justify-center rounded-full bg-blabia-blue text-white text-xs font-semibold shadow"
            style={{ left: pct(USER_NODE.x, W), top: pct(USER_NODE.y, H), width: pct(USER_NODE.w, W), height: pct(USER_NODE.h, H) }}
          >
            👤 Utilisateur
          </div>

          {catalog.categories.map(cat => {
            const b = boxes[cat.id];
            const list = byCat[cat.id] || [];
            const empty = list.length === 0;
            return (
              <div
                key={cat.id}
                className={`absolute rounded-xl p-2 flex flex-col gap-1 overflow-hidden ${
                  empty ? 'border-2 border-dashed border-gray-200 bg-gray-50/90' : 'border border-gray-200 bg-white shadow-sm'
                }`}
                style={{ left: pct(b.x, W), top: pct(b.y, H), width: pct(b.w, W), height: pct(b.h, H) }}
                title={cat.explanation}
              >
                <div className="flex items-start gap-1">
                  <span className="text-sm leading-none">{cat.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-gray-800 leading-tight">{cat.label}</p>
                    <p className="text-[9px] text-gray-400 leading-tight">{cat.technical}</p>
                  </div>
                </div>
                {empty ? (
                  <p className="text-[10px] text-gray-400 italic mt-auto">{emptyLabel}</p>
                ) : (
                  <div className="flex flex-wrap gap-1 mt-auto">
                    {list.slice(0, MAX_CHIPS).map(it => (
                      <button
                        key={it.key}
                        type="button"
                        onClick={() => setSelected(it)}
                        className={`text-[10px] px-1.5 py-0.5 rounded-md truncate max-w-full transition ${
                          it.dashed
                            ? 'border border-dashed border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100'
                            : 'border border-blue-200 text-blue-800 bg-blue-50 hover:bg-blue-100'
                        } ${selected?.key === it.key ? 'ring-2 ring-blue-400' : ''}`}
                      >
                        {it.name}
                      </button>
                    ))}
                    {list.length > MAX_CHIPS && (
                      <span className="text-[10px] text-gray-400 px-1">+{list.length - MAX_CHIPS}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="mt-3 border border-gray-200 rounded-xl p-3 bg-white flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="text-sm font-semibold text-gray-900">
              {selected.name}
              {selected.dashed && <span className="ml-2 text-[10px] font-medium text-amber-600">suggéré</span>}
            </p>
            {selected.detail?.role && <p className="text-xs text-gray-600">{selected.detail.role}</p>}
            {selected.detail?.cost && <p className="text-xs text-gray-500">💶 {selected.detail.cost}</p>}
            {selected.detail?.status && <p className="text-xs text-gray-500">📌 {selected.detail.status}</p>}
          </div>
          <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none" aria-label="Fermer">×</button>
        </div>
      )}
    </div>
  );
}
