import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, X, Flag } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { CHAPTERS, NEEDS_DEMO_AT_START } from './chapters';

// Moteur de la visite guidée (v5.1) : bulles ancrées sur les éléments
// [data-tour="…"] des vraies pages, enchaînement de chapitres, projet exemple
// créé au besoin et supprimé en fin de visite. État conservé en sessionStorage
// pour survivre à un rechargement de page.

const TourContext = createContext(null);
export const useTour = () => useContext(TourContext);

const STORAGE_KEY = 'blabia-tour';
const readStored = () => { try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; } };
const writeStored = v => { try { v ? sessionStorage.setItem(STORAGE_KEY, JSON.stringify(v)) : sessionStorage.removeItem(STORAGE_KEY); } catch { /* stockage indisponible */ } };

// Prévient les pages (liste des projets…) que le projet exemple a changé
const notifyDemoChanged = () => window.dispatchEvent(new Event('blabia:demo-changed'));

const chapterById = id => CHAPTERS.find(c => c.id === id);

// Page d'une étape : la sienne, sinon celle de l'étape précédente qui en définit une
function stepPath(chapter, idx, ctx) {
  for (let i = idx; i >= 0; i--) if (chapter.steps[i].path) return chapter.steps[i].path(ctx);
  return null;
}

export function TourProvider({ children }) {
  const { user, patchUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [tour, setTour] = useState(readStored); // { queue, chapterIdx, stepIdx, demoId, meetingId } | null
  const [busy, setBusy] = useState(false);
  const cleaned = useRef(false);

  useEffect(() => { writeStored(tour); }, [tour]);

  // Visite interrompue (onglet fermé…) : le projet exemple orphelin est supprimé
  useEffect(() => {
    if (!user || cleaned.current) return;
    cleaned.current = true;
    if (!readStored()) api.delete('/projects/demo').then(({ data }) => { if (data?.deleted) notifyDemoChanged(); }).catch(() => {});
  }, [user]);

  const ensureDemo = useCallback(async () => {
    const { data } = await api.post('/projects/demo');
    const { data: sessions } = await api.get(`/projects/${data.id}/sessions`);
    const open = (sessions || []).find(s => s.status === 'open');
    if (data.created) notifyDemoChanged();
    return { demoId: data.id, meetingId: open?.id || null };
  }, []);

  const start = useCallback(async (chapterIds) => {
    const queue = chapterIds.filter(chapterById);
    if (!queue.length || busy) return;
    setBusy(true);
    try {
      const demo = NEEDS_DEMO_AT_START(queue[0]) ? await ensureDemo() : {};
      setTour({ queue, chapterIdx: 0, stepIdx: 0, demoId: null, meetingId: null, ...demo });
    } catch {
      window.alert('La visite guidée n’a pas pu démarrer. Réessayez dans un instant.');
    }
    setBusy(false);
  }, [busy, ensureDemo]);

  const stop = useCallback(async () => {
    const demoId = tour?.demoId;
    setTour(null);
    try {
      const { data } = await api.delete('/projects/demo');
      if (data?.deleted) notifyDemoChanged();
    } catch { /* nettoyé au prochain chargement */ }
    if (demoId && location.pathname.includes(demoId)) navigate('/dashboard');
  }, [tour, location.pathname, navigate]);

  const markDone = useCallback(chapterId => {
    api.patch('/users/me/tour', { chapter: chapterId })
      .then(({ data }) => patchUser?.({ tourProgress: data.tourProgress }))
      .catch(() => {});
  }, [patchUser]);

  const chapter = tour ? chapterById(tour.queue[tour.chapterIdx]) : null;
  const step = chapter?.steps[tour.stepIdx] || null;

  const next = useCallback(() => {
    setTour(t => t && (t.stepIdx + 1 < chapterById(t.queue[t.chapterIdx]).steps.length ? { ...t, stepIdx: t.stepIdx + 1 } : t));
  }, []);
  const prev = useCallback(() => setTour(t => t && t.stepIdx > 0 ? { ...t, stepIdx: t.stepIdx - 1 } : t), []);

  const nextChapter = useCallback(async () => {
    if (!tour) return;
    markDone(chapter.id);
    const nextIdx = tour.chapterIdx + 1;
    if (nextIdx >= tour.queue.length) return stop();
    setBusy(true);
    try {
      const demo = !tour.demoId && NEEDS_DEMO_AT_START(tour.queue[nextIdx]) ? await ensureDemo() : {};
      setTour(t => ({ ...t, ...demo, chapterIdx: nextIdx, stepIdx: 0 }));
    } catch { stop(); }
    setBusy(false);
  }, [tour, chapter, markDone, stop, ensureDemo]);

  const finish = useCallback(() => { if (chapter) markDone(chapter.id); stop(); }, [chapter, markDone, stop]);

  // Création du projet exemple depuis le formulaire « Nouveau projet » (chapitre create)
  const createDemo = useCallback(async () => {
    const demo = await ensureDemo();
    setTour(t => t && { ...t, ...demo, stepIdx: t.stepIdx + 1 });
  }, [ensureDemo]);

  // Navigation vers la page de l'étape
  const ctx = useMemo(() => ({ demoId: tour?.demoId, meetingId: tour?.meetingId }), [tour?.demoId, tour?.meetingId]);
  const targetPath = chapter ? stepPath(chapter, tour.stepIdx, ctx) : null;
  useEffect(() => {
    if (targetPath && location.pathname !== targetPath) navigate(targetPath);
  }, [targetPath]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = {
    active: !!tour, busy, start, stop,
    chapterId: chapter?.id || null, step, demoId: tour?.demoId || null,
    next, createDemo,
    isDemo: id => !!tour?.demoId && id === tour.demoId,
  };

  return (
    <TourContext.Provider value={value}>
      {children}
      {tour && step && (
        <TourBubble
          key={`${chapter.id}-${tour.stepIdx}`}
          step={step}
          chapter={chapter}
          chapterNo={tour.chapterIdx + 1}
          chapterCount={tour.queue.length}
          stepNo={tour.stepIdx + 1}
          stepCount={chapter.steps.length}
          nextChapterLabel={tour.chapterIdx + 1 < tour.queue.length ? chapterById(tour.queue[tour.chapterIdx + 1]).label : null}
          busy={busy}
          onNext={next}
          onPrev={prev}
          onQuit={stop}
          onFinish={finish}
          onNextChapter={nextChapter}
          pathname={location.pathname}
        />
      )}
    </TourContext.Provider>
  );
}

// ── Bulle + mise en évidence ─────────────────────────────────────────────────
const PAD = 6;     // marge autour de l'élément mis en évidence
const GAP = 14;    // écart entre l'élément et la bulle
const EDGE = 12;   // marge minimale avec les bords de l'écran

function TourBubble({ step, chapter, chapterNo, chapterCount, stepNo, stepCount, nextChapterLabel, busy, onNext, onPrev, onQuit, onFinish, onNextChapter, pathname }) {
  const [rect, setRect] = useState(null);
  const [pos, setPos] = useState(null);
  const bubbleRef = useRef(null);
  const last = stepNo === stepCount;

  // Recherche de l'élément (il peut apparaître après un chargement), puis suivi de sa position
  useEffect(() => {
    if (!step.target) { setRect(null); return; }
    let scrolled = false;
    const tick = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (!el) { setRect(null); return; }
      if (!scrolled) { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); scrolled = true; }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { setRect(null); return; }
      setRect(prev => prev && prev.x === r.x && prev.y === r.y && prev.w === r.width && prev.h === r.height
        ? prev : { x: r.x, y: r.y, w: r.width, h: r.height });
    };
    tick();
    const id = setInterval(tick, 120);
    return () => clearInterval(id);
  }, [step.target, pathname]);

  // Placement de la bulle autour de l'élément
  useLayoutEffect(() => {
    const b = bubbleRef.current;
    if (!b) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const bw = b.offsetWidth, bh = b.offsetHeight;
    if (vw < 640 || !rect) { setPos(null); return; } // mobile ou sans cible : bulle ancrée / centrée
    const clampX = x => Math.min(Math.max(x, EDGE), vw - bw - EDGE);
    const clampY = y => Math.min(Math.max(y, EDGE), vh - bh - EDGE);
    const fits = {
      bottom: rect.y + rect.h + PAD + GAP + bh < vh - EDGE,
      top:    rect.y - PAD - GAP - bh > EDGE,
      right:  rect.x + rect.w + PAD + GAP + bw < vw - EDGE,
      left:   rect.x - PAD - GAP - bw > EDGE,
    };
    const order = [step.placement, 'bottom', 'top', 'right', 'left'].filter(Boolean);
    const side = order.find(s => fits[s]);
    const cx = rect.x + rect.w / 2 - bw / 2, cy = rect.y + rect.h / 2 - bh / 2;
    const p = side === 'bottom' ? { left: clampX(cx), top: rect.y + rect.h + PAD + GAP }
      : side === 'top'   ? { left: clampX(cx), top: rect.y - PAD - GAP - bh }
      : side === 'right' ? { left: rect.x + rect.w + PAD + GAP, top: clampY(cy) }
      : side === 'left'  ? { left: rect.x - PAD - GAP - bw, top: clampY(cy) }
      : { left: vw - bw - EDGE * 2, top: vh - bh - EDGE * 2 }; // élément trop grand : coin bas-droit
    setPos(prevPos => prevPos && prevPos.left === p.left && prevPos.top === p.top ? prevPos : p);
  }, [rect, step.placement]);

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onQuit();
      if (e.key === 'ArrowRight' && !step.waitAction && !last) onNext();
      if (e.key === 'ArrowLeft' && stepNo > 1) onPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onQuit, onNext, onPrev, step.waitAction, last, stepNo]);

  const hole = rect && { left: rect.x - PAD, top: rect.y - PAD, width: rect.w + PAD * 2, height: rect.h + PAD * 2 };
  const block = 'fixed z-[80] bg-transparent';

  return (
    <>
      {/* Assombrissement + blocage des clics hors de l'élément */}
      {hole ? (
        <>
          <div aria-hidden="true" className="fixed z-[80] rounded-xl pointer-events-none transition-all duration-200"
            style={{ ...hole, boxShadow: '0 0 0 4px rgba(51,82,224,0.55), 0 0 0 9999px rgba(30,34,56,0.55)' }} />
          <div className={block} style={{ left: 0, top: 0, right: 0, height: Math.max(hole.top, 0) }} />
          <div className={block} style={{ left: 0, top: hole.top + hole.height, right: 0, bottom: 0 }} />
          <div className={block} style={{ left: 0, top: hole.top, width: Math.max(hole.left, 0), height: hole.height }} />
          <div className={block} style={{ left: hole.left + hole.width, top: hole.top, right: 0, height: hole.height }} />
          {!step.interactive && <div className={block} style={hole} />}
        </>
      ) : (
        <div aria-hidden="true" className="fixed inset-0 z-[80] bg-ink/55" />
      )}

      <div ref={bubbleRef} role="dialog" aria-modal="true" aria-labelledby="tour-title"
        className={`fixed z-[81] bg-white rounded-2xl shadow-2xl border border-line p-4 ${
          pos ? 'w-[360px]' : rect ? 'left-3 right-3 bottom-3' : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(400px,calc(100vw-24px))]'
        }`}
        style={pos ? { left: pos.left, top: pos.top } : undefined}>
        <div className="flex items-start gap-2">
          <p className="flex-1 text-[11px] font-extrabold uppercase tracking-wider text-ai">
            Visite guidée · {chapterCount > 1 && `${chapterNo}/${chapterCount} · `}{chapter.label}
          </p>
          <button type="button" onClick={onQuit} aria-label="Quitter la visite" title="Quitter la visite"
            className="-mt-1 -mr-1 w-8 h-8 inline-flex items-center justify-center rounded-lg text-ink-faint hover:text-ink hover:bg-canvas">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <h2 id="tour-title" className="text-base font-extrabold text-ink mt-1">{step.title}</h2>
        <p className="text-sm text-ink-soft mt-1 leading-relaxed">{step.body}</p>

        <div className="flex items-center gap-2 mt-4">
          <span className="text-xs font-bold text-ink-faint tabular-nums">{stepNo}/{stepCount}</span>
          <div className="flex-1" />
          {stepNo > 1 && (
            <button type="button" onClick={onPrev} aria-label="Étape précédente"
              className="w-9 h-9 inline-flex items-center justify-center rounded-[10px] text-ink-muted hover:bg-canvas">
              <ArrowLeft size={17} aria-hidden="true" />
            </button>
          )}
          {step.waitAction ? (
            <span className="text-xs font-bold text-action">↑ À vous de cliquer</span>
          ) : !last ? (
            <button type="button" onClick={onNext} autoFocus
              className="h-9 px-4 inline-flex items-center gap-1.5 rounded-[10px] bg-action text-white text-sm font-bold hover:bg-action-dark">
              Suivant <ArrowRight size={15} aria-hidden="true" />
            </button>
          ) : nextChapterLabel ? (
            <>
              <button type="button" onClick={onFinish} disabled={busy}
                className="h-9 px-3 rounded-[10px] text-sm font-bold text-ink-muted hover:bg-canvas">Arrêter là</button>
              <button type="button" onClick={onNextChapter} disabled={busy} autoFocus
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded-[10px] bg-action text-white text-sm font-bold hover:bg-action-dark disabled:opacity-50">
                Suivant : {nextChapterLabel} <ArrowRight size={15} aria-hidden="true" />
              </button>
            </>
          ) : (
            <button type="button" onClick={onFinish} disabled={busy} autoFocus
              className="h-9 px-4 inline-flex items-center gap-1.5 rounded-[10px] bg-ok text-white text-sm font-bold hover:bg-green-800">
              <Flag size={15} aria-hidden="true" /> Terminer la visite
            </button>
          )}
        </div>
      </div>
    </>
  );
}
