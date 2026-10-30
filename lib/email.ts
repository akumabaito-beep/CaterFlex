import nodemailer from 'nodemailer'

function transport() {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) throw new Error('Email is not configured (SMTP_USER / SMTP_PASS).')
  const port = Number(process.env.SMTP_PORT ?? 465)
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user, pass },
  })
}

export async function sendVerificationEmail(to: string, name: string, link: string) {
  const from = process.env.MAIL_FROM ?? `CaterFlex <${process.env.SMTP_USER}>`
  await transport().sendMail({
    from,
    to,
    subject: 'Confirm your CaterFlex email',
    text: `Hi ${name},\n\nWelcome to CaterFlex! Confirm your email to finish creating your account:\n${link}\n\nThis link expires in 24 hours. If you did not create an account, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#2A1B1F">
  <h2 style="color:#8E1F2C">Confirm your email</h2>
  <p>Hi ${escapeHtml(name)},</p>
  <p>Welcome to CaterFlex! Confirm your email to finish creating your account.</p>
  <p><a href="${link}" style="display:inline-block;background:#9B1C2C;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Confirm email</a></p>
  <p style="font-size:13px;color:#6b5a5e">Or paste this link into your browser:<br>${link}</p>
  <p style="font-size:13px;color:#6b5a5e">This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>
</div>`,
  })
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}