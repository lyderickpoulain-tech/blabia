// Rappels hebdomadaires par e-mail (v5.1) : actions entre les réunions en retard, à
// échéance proche et prochaines dans l'ordre, pour chaque projet dont les rappels
// sont activés (Project.remindersEnabled, désactivés par défaut). Un e-mail par
// utilisateur, le jour choisi dans son profil (User.reminderDay, lundi par défaut),
// à partir de SEND_HOUR (heure de Paris), une seule fois par semaine.
//
// Déclenchement : vérification horaire dans le serveur (startReminderScheduler) ;
// POST /api/reminders/run (en-tête x-cron-secret = CRON_SECRET) permet aussi un
// déclenchement externe si le serveur est mis en veille.
const db = require('../utils/db');
const { sendActionsDigest } = require('./email');

const SEND_HOUR = 8;
const TZ = 'Europe/Paris';
const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const OPEN = ['todo', 'in_progress'];

// Jour ISO (1 = lundi), heure et date (AAAA-MM-JJ) à Paris
function parisParts(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, weekday: 'short', hour: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).map(x => [x.type, x.value]));
  const isoDay = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1;
  return { isoDay, hour: Number(p.hour), dateKey: `${p.year}-${p.month}-${p.day}` };
}

// Ce rappel doit-il partir maintenant pour cet utilisateur ?
function isDue(user, now = new Date()) {
  const { isoDay, hour, dateKey } = parisParts(now);
  if (isoDay !== (user.reminderDay || 1) || hour < SEND_HOUR) return false;
  return !user.remindersLastSentAt || parisParts(new Date(user.remindersLastSentAt)).dateKey !== dateKey;
}

// Actions à rappeler, projet par projet (projets dont l'utilisateur est propriétaire ou membre)
async function collectDigest(userId, now = new Date()) {
  const today = parisParts(now).dateKey;
  const in7 = parisParts(new Date(now.getTime() + 7 * 86400000)).dateKey;
  const projects = await db('Project')
    .where({ remindersEnabled: true, status: 'active', isDemo: false })
    .where(q => q.where('userId', userId).orWhereExists(
      db.select(db.raw('1')).from('ProjectMember').whereRaw('"ProjectMember"."projectId" = "Project"."id"').where('ProjectMember.userId', userId)))
    .select('id', 'name');
  const digest = [];
  for (const p of projects) {
    const open = await db('TodoItem').where({ projectId: p.id }).whereIn('status', OPEN)
      .orderBy('displayOrder', 'asc').select('id', 'title', 'dueDate');
    if (open.length === 0) continue;
    const day = a => a.dueDate ? new Date(a.dueDate).toISOString().slice(0, 10) : null;
    const overdue  = open.filter(a => day(a) && day(a) < today);
    const upcoming = open.filter(a => day(a) && day(a) >= today && day(a) <= in7);
    const next     = open.filter(a => !overdue.includes(a) && !upcoming.includes(a)).slice(0, 3);
    digest.push({ project: p, overdue, upcoming, next, openCount: open.length });
  }
  return digest;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDay = d => new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });

function buildDigestHtml(digest, baseUrl) {
  const list = (items, color, withDate) => items.map(a =>
    `<li style="margin:0 0 6px;color:#363C57;font-size:14px;">${esc(a.title)}${withDate && a.dueDate ? ` <span style="color:${color};font-weight:700;">· ${fmtDay(a.dueDate)}</span>` : ''}</li>`).join('');
  const block = (title, items, color, withDate) => items.length
    ? `<p style="margin:12px 0 6px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:${color};">${title}</p><ul style="margin:0;padding-left:18px;">${list(items, color, withDate)}</ul>` : '';
  return digest.map(({ project, overdue, upcoming, next, openCount }) => `
    <div style="margin:0 0 24px;padding:16px;border:1px solid #E1E5F0;border-radius:12px;">
      <p style="margin:0;font-size:16px;font-weight:800;color:#1E2238;">${esc(project.name)}</p>
      <p style="margin:2px 0 0;font-size:12px;color:#6A7190;">${openCount} action${openCount > 1 ? 's' : ''} à faire</p>
      ${block('En retard', overdue, '#9A4A06', true)}
      ${block('Cette semaine', upcoming, '#3352E0', true)}
      ${block('Ensuite, dans l’ordre', next, '#565D78', false)}
      <p style="margin:14px 0 0;font-size:13px;">
        <a href="${baseUrl}/projects/${project.id}/actions" style="color:#3352E0;font-weight:700;text-decoration:none;">Ouvrir les actions →</a>
        <span style="color:#9ca3af;"> · </span>
        <a href="${baseUrl}/projects/${project.id}/parametres" style="color:#6A7190;font-size:12px;">Désactiver les rappels de ce projet</a>
      </p>
    </div>`).join('');
}

async function sendDigestTo(user, now = new Date()) {
  const digest = await collectDigest(user.id, now);
  if (digest.length === 0) return { sent: false, reason: 'rien à rappeler' };
  const late = digest.reduce((n, d) => n + d.overdue.length, 0);
  const subject = late
    ? `BlabIA · ${late} action${late > 1 ? 's' : ''} en retard`
    : 'BlabIA · vos actions de la semaine';
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  await sendActionsDigest(user.email, subject, buildDigestHtml(digest, baseUrl));
  return { sent: true, projects: digest.length, late };
}

// Passe de vérification : envoie les rappels dus (idempotent dans la journée)
async function runReminders(now = new Date()) {
  const { isoDay, hour } = parisParts(now);
  if (hour < SEND_HOUR) return { checked: 0, sent: 0 };
  const users = await db('User').where({ reminderDay: isoDay }).select('id', 'email', 'reminderDay', 'remindersLastSentAt');
  let sent = 0;
  for (const u of users.filter(x => isDue(x, now))) {
    try {
      const r = await sendDigestTo(u, now);
      // Marqué même sans envoi : on ne revérifie pas cet utilisateur avant la semaine suivante
      await db('User').where({ id: u.id }).update({ remindersLastSentAt: now });
      if (r.sent) sent++;
    } catch (err) {
      console.error(`[reminders] envoi impossible (${u.id}) :`, err.message);
    }
  }
  return { checked: users.length, sent };
}

let timer = null;
function startReminderScheduler() {
  if (timer || process.env.NODE_ENV === 'test' || process.env.REMINDERS_DISABLED === '1') return;
  const tick = () => runReminders().then(r => { if (r.sent) console.log(`[reminders] ${r.sent} rappel(s) envoyé(s)`); })
    .catch(err => console.error('[reminders]', err.message));
  setTimeout(tick, 60 * 1000);          // peu après le démarrage
  timer = setInterval(tick, 60 * 60 * 1000); // puis toutes les heures
  timer.unref?.();
}

module.exports = { SEND_HOUR, DAY_NAMES, parisParts, isDue, collectDigest, buildDigestHtml, sendDigestTo, runReminders, startReminderScheduler };
