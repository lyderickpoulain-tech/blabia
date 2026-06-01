const nodemailer = require('nodemailer');

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function sendInvitation(email, token) {
  const link = `${process.env.FRONTEND_URL}/login?token=${token}`;
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`[email] Invitation (pas de SMTP configuré) → ${link}`);
    return;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'BlabIA <no-reply@blabIa.fr>',
    to: email,
    subject: 'Votre invitation BlabIA',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>Vous avez été invité sur BlabIA</h2>
        <p>Cliquez sur le bouton ci-dessous pour créer votre compte :</p>
        <p><a href="${link}" style="background:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block">Activer mon compte</a></p>
        <p style="color:#6b7280;font-size:0.875rem">Ce lien est à usage unique et expire dans 7 jours.</p>
      </div>
    `
  });
}

module.exports = { sendInvitation };
