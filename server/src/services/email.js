const { Resend } = require('resend');

const FROM_ADDRESS = 'BlabIA <contact@rasia-editions.fr>';
const SUPPORT = 'contact@rasia-editions.fr';

function getClient() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

// ── Template commun ───────────────────────────────────────────────────────────

function baseLayout(content) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">

        <!-- En-tête -->
        <tr>
          <td style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:32px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">BlabIA</h1>
            <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px;">Multi-agents IA pour vos projets</p>
          </td>
        </tr>

        <!-- Contenu -->
        <tr><td style="padding:32px;">
          ${content}
        </td></tr>

        <!-- Pied de page -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #f3f4f6;background:#f9fafb;">
            <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
              Une question ? Contactez-nous à
              <a href="mailto:${SUPPORT}" style="color:#6b7280;text-decoration:none;">${SUPPORT}</a>
              <br/>BlabIA — Rasia Éditions
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── sendInvitation ────────────────────────────────────────────────────────────

async function sendInvitation(toEmail, token, senderEmail = '', projectName = '') {
  const link = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/register?token=${token}`;
  const client = getClient();

  if (!client) {
    console.log(`[email] Invitation (RESEND_API_KEY absent) — lien d'activation : ${link}`);
    return;
  }

  const senderLine = senderEmail
    ? `<p style="margin:0 0 20px;color:#374151;font-size:15px;"><strong>${senderEmail}</strong> vous invite à rejoindre <strong>BlabIA</strong>, la plateforme de sessions multi-agents IA.</p>`
    : `<p style="margin:0 0 20px;color:#374151;font-size:15px;">Vous avez été invité à rejoindre <strong>BlabIA</strong>, la plateforme de sessions multi-agents IA.</p>`;

  const projectLine = projectName
    ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
        <p style="margin:0;color:#1e40af;font-size:13px;">
          📁 Vous serez automatiquement ajouté au projet <strong>"${projectName}"</strong> après votre inscription.
        </p>
      </div>`
    : '';

  const content = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:700;">Vous êtes invité !</h2>
    ${senderLine}
    ${projectLine}
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Cliquez sur le bouton ci-dessous pour créer votre compte et commencer à utiliser BlabIA :</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td align="center">
        <a href="${link}"
           style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:10px;text-decoration:none;">
          Activer mon compte →
        </a>
      </td></tr>
    </table>

    <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <p style="margin:0;color:#92400e;font-size:13px;">
        ⏱ Ce lien est à usage unique et expire dans <strong>72 heures</strong>.
      </p>
    </div>

    <p style="margin:0;color:#9ca3af;font-size:12px;">
      Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/>
      <a href="${link}" style="color:#6b7280;word-break:break-all;">${link}</a>
    </p>`;

  const { error } = await client.emails.send({
    from: FROM_ADDRESS,
    to: toEmail,
    subject: 'Vous êtes invité à rejoindre BlabIA',
    html: baseLayout(content)
  });

  if (error) throw new Error(error.message);
}

// ── sendTestEmail ─────────────────────────────────────────────────────────────

async function sendTestEmail(toEmail) {
  const client = getClient();

  if (!client) {
    throw new Error('RESEND_API_KEY absent — ajoutez la clé dans les variables d\'environnement Railway.');
  }

  const content = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:700;">Test de configuration email</h2>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;">
      Si vous recevez cet email, la configuration Resend de BlabIA fonctionne correctement.
    </p>

    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <p style="margin:0;color:#065f46;font-size:13px;">
        ✓ Expéditeur : <strong>${FROM_ADDRESS}</strong>
      </p>
    </div>

    <p style="margin:0;color:#9ca3af;font-size:12px;">
      Envoyé à ${new Date().toLocaleString('fr-FR')}
    </p>`;

  const { error } = await client.emails.send({
    from: FROM_ADDRESS,
    to: toEmail,
    subject: '[BlabIA] Test de configuration email',
    html: baseLayout(content)
  });

  if (error) throw new Error(error.message);
}

module.exports = { sendInvitation, sendTestEmail };
