import { useState } from 'react';
import api from '../utils/api';
import { notifyError } from '../utils/notify';

// Ordre des réunions du plan : insertion entre deux réunions et glisser-déposer.
// Les réunions terminées sont verrouillées (ni déplacées, ni cible d'un dépôt).
export const isLockedMilestone = m => m.status === 'done';

export default function usePlanOrdering(projectId, milestones, onRefresh) {
  const [dragId, setDragId]         = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  // Réécrit tous les displayOrder en multiples de 10 pour créer de l'espace avant insertion
  const normalizeOrder = sorted => Promise.all(
    sorted.map((m, i) => api.patch(`/projects/${projectId}/milestones/${m.id}`, { displayOrder: i * 10 }))
  );

  const insertBetween = async ({ title, type }, prevM, nextM) => {
    const sorted = [...milestones].sort((a, b) => a.displayOrder - b.displayOrder);
    let prevOrder = prevM?.displayOrder ?? (nextM ? nextM.displayOrder - 10 : 0);
    let nextOrder = nextM?.displayOrder ?? prevOrder + 100;
    if (nextOrder - prevOrder < 2) {
      await normalizeOrder(sorted);
      const prevIdx = prevM ? sorted.findIndex(m => m.id === prevM.id) : -1;
      const nextIdx = nextM ? sorted.findIndex(m => m.id === nextM.id) : sorted.length;
      prevOrder = prevIdx >= 0 ? prevIdx * 10 : (nextIdx * 10 - 10);
      nextOrder = nextIdx < sorted.length ? nextIdx * 10 : prevOrder + 100;
    }
    try {
      await api.post(`/projects/${projectId}/milestones`, { title, type, displayOrder: Math.round((prevOrder + nextOrder) / 2) });
      onRefresh();
      return true;
    } catch (err) { notifyError(err, 'La réunion n’a pas pu être insérée.'); return false; }
  };

  const endDrag = () => { setDragId(null); setDragOverId(null); };
  const startDrag = (e, id) => { e.stopPropagation(); setDragId(id); };
  const overDrag = (e, m) => { e.preventDefault(); if (!isLockedMilestone(m)) setDragOverId(m.id); };

  const drop = async targetId => {
    if (!dragId || dragId === targetId) { endDrag(); return; }
    const target = milestones.find(m => m.id === targetId);
    const source = milestones.find(m => m.id === dragId);
    if (!target || !source || isLockedMilestone(target) || isLockedMilestone(source)) { endDrag(); return; }
    const toIdx = milestones.findIndex(m => m.id === targetId); // position de la cible avant retrait
    const reordered = [...milestones];
    const [moved] = reordered.splice(reordered.findIndex(m => m.id === dragId), 1);
    reordered.splice(toIdx, 0, moved);
    endDrag();
    try {
      await api.patch(`/projects/${projectId}/milestones/reorder`, { order: reordered.map(m => m.id) });
      onRefresh();
    } catch (err) { notifyError(err, 'Le nouvel ordre n’a pas pu être enregistré.'); }
  };

  return { dragId, dragOverId, startDrag, overDrag, endDrag, drop, insertBetween };
}
