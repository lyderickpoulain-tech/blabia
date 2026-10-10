// Export Word (.docx) — v5.1 : compte-rendu d'une réunion ; registre des décisions
// et actions du projet. Le PDF est produit côté client (page d'impression).
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = require('docx');

const FONT = 'Calibri';
const INK = '1E2238', MUTED = '6A7190', AWAIT = '9A4A06';

// **gras**, [lien](url) → morceaux de texte
function inlineRuns(text, base = {}) {
  const runs = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`/g;
  let last = 0, m;
  const s = String(text);
  while ((m = re.exec(s))) {
    if (m.index > last) runs.push(new TextRun({ text: s.slice(last, m.index), font: FONT, ...base }));
    if (m[1]) runs.push(new TextRun({ text: m[1], bold: true, font: FONT, ...base }));
    else if (m[2]) runs.push(new TextRun({ text: `${m[2]} (${m[3]})`, font: FONT, ...base }));
    else if (m[4]) runs.push(new TextRun({ text: m[4], font: 'Consolas', ...base }));
    last = re.lastIndex;
  }
  if (last < s.length) runs.push(new TextRun({ text: s.slice(last), font: FONT, ...base }));
  return runs;
}

const p = (text, opts = {}) => new Paragraph({ children: inlineRuns(text, opts.run), spacing: { after: 120 }, ...opts.para });

// Markdown simple (titres, listes, numérotation, tableaux, paragraphes) → paragraphes Word
function markdownToDocx(md) {
  const out = [];
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][h[1].length - 1];
      out.push(new Paragraph({ heading: level, children: inlineRuns(h[2]), spacing: { before: 240, after: 120 } }));
      continue;
    }
    // Tableau : lignes | a | b |, ligne de séparation ignorée
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
        i++;
      }
      i--;
      const cols = Math.max(...rows.map(r => r.length));
      out.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: rows.map((r, ri) => new TableRow({
          children: Array.from({ length: cols }, (_, ci) => new TableCell({
            children: [new Paragraph({ children: inlineRuns(r[ci] || '', ri === 0 ? { bold: true } : {}) })],
          })),
        })),
      }));
      out.push(new Paragraph({ text: '' }));
      continue;
    }
    const bullet = line.match(/^(\s*)[-*•]\s+(.*)$/);
    if (bullet) { out.push(new Paragraph({ children: inlineRuns(bullet[2]), bullet: { level: Math.min(2, Math.floor(bullet[1].length / 2)) }, spacing: { after: 60 } })); continue; }
    const num = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (num) { out.push(p(`${num[1]}. ${num[2]}`, { para: { indent: { left: 360 }, spacing: { after: 60 } } })); continue; }
    out.push(p(line.trim()));
  }
  return out;
}

const title = (text, sub) => [
  new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text, font: FONT, color: INK })], spacing: { after: 80 } }),
  ...(sub ? [new Paragraph({ children: [new TextRun({ text: sub, font: FONT, color: MUTED, size: 20 })], spacing: { after: 280 } })] : []),
];
const fmtDate = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const TYPE_LABEL = { decision: 'Relevé de décisions', claude_code: 'Prompt Claude Code', stack: 'Revue des outils' };

async function sessionDocx({ project, session }) {
  const intention = Array.isArray(session.intention) ? session.intention[0] : (() => { try { return JSON.parse(session.intention || '[]')[0]; } catch { return null; } })();
  const children = [
    ...title(session.task, `${project.name} · réunion du ${fmtDate(session.createdAt)} · ${TYPE_LABEL[intention] || 'Réunion'}`),
    ...markdownToDocx(session.summary || '_Pas de compte-rendu._'),
  ];
  if (session.deliverable && intention === 'claude_code') {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: inlineRuns('Prompt Claude Code'), spacing: { before: 320, after: 120 } }));
    for (const line of session.deliverable.split('\n')) children.push(new Paragraph({ children: [new TextRun({ text: line, font: 'Consolas', size: 18 })] }));
  }
  return Packer.toBuffer(new Document({ creator: 'BlabIA', title: session.task, sections: [{ children }] }));
}

async function registryDocx({ project, decisions, actions }) {
  const section = text => new Paragraph({ heading: HeadingLevel.HEADING_1, children: inlineRuns(text), spacing: { before: 320, after: 160 } });
  const sub = text => new Paragraph({ heading: HeadingLevel.HEADING_3, children: inlineRuns(text), spacing: { before: 200, after: 80 } });
  const decisionBlock = d => [
    new Paragraph({ children: [new TextRun({ text: d.statement, bold: true, font: FONT })], bullet: { level: 0 }, spacing: { after: 40 } }),
    ...(d.rationale ? [p(d.rationale, { para: { indent: { left: 720 }, spacing: { after: 40 } } })] : []),
    ...(d.rejectedOptions?.length ? [p(`Écarté : ${d.rejectedOptions.join(', ')}`, { run: { color: MUTED, size: 20 }, para: { indent: { left: 720 }, spacing: { after: 40 } } })] : []),
    ...(d.status === 'reopened' && d.reopenNote ? [p(`Remise en question : ${d.reopenNote}`, { run: { color: AWAIT, size: 20 }, para: { indent: { left: 720 }, spacing: { after: 40 } } })] : []),
    p(`${d.origin === 'human' ? 'Votre arbitrage' : 'Hypothèse des agents'} · ${fmtDate(d.createdAt)}${d.sessionTask ? ` · ${d.sessionTask}` : ''}`, { run: { color: MUTED, size: 18 }, para: { indent: { left: 720 }, spacing: { after: 160 } } }),
  ];
  const byStatus = s => decisions.filter(d => d.status === s);
  const open = actions.filter(a => a.status !== 'done');
  const done = actions.filter(a => a.status === 'done');
  const today = new Date().toISOString().slice(0, 10);
  const children = [
    ...title(`Décisions et actions — ${project.name}`, `Export du ${fmtDate(new Date())}`),
    section('Registre des décisions'),
    ...(decisions.length === 0 ? [p('Aucune décision pour l’instant.', { run: { color: MUTED } })] : []),
    ...(byStatus('reopened').length ? [sub('Remises en question'), ...byStatus('reopened').flatMap(decisionBlock)] : []),
    ...(byStatus('active').length ? [sub('En vigueur'), ...byStatus('active').flatMap(decisionBlock)] : []),
    ...(byStatus('superseded').length ? [sub('Remplacées'), ...byStatus('superseded').flatMap(decisionBlock)] : []),
    section('Actions entre les réunions'),
    ...(actions.length === 0 ? [p('Aucune action pour l’instant.', { run: { color: MUTED } })] : []),
    ...(open.length ? [sub('À faire, dans l’ordre'), ...open.map((a, i) => {
      const late = a.dueDate && new Date(a.dueDate).toISOString().slice(0, 10) < today;
      return new Paragraph({
        children: [
          new TextRun({ text: `${i + 1}. ${a.title}`, font: FONT }),
          ...(a.dueDate ? [new TextRun({ text: ` — ${late ? 'en retard, ' : ''}${fmtDate(a.dueDate)}`, font: FONT, color: late ? AWAIT : MUTED, bold: late })] : []),
        ],
        spacing: { after: 60 },
      });
    })] : []),
    ...(done.length ? [sub('Faites'), ...done.map(a => new Paragraph({ children: [new TextRun({ text: `✓ ${a.title}`, font: FONT, color: MUTED })], spacing: { after: 40 } }))] : []),
  ];
  return Packer.toBuffer(new Document({ creator: 'BlabIA', title: `Décisions et actions — ${project.name}`, sections: [{ children }] }));
}

// Nom de fichier sûr + en-tête Content-Disposition (UTF-8)
function attachment(res, name, buffer) {
  const safe = String(name).replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 120) || 'export';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${safe.replace(/[^\x20-\x7e]/g, '_')}.docx"; filename*=UTF-8''${encodeURIComponent(safe)}.docx`);
  res.send(buffer);
}

module.exports = { markdownToDocx, sessionDocx, registryDocx, attachment };
