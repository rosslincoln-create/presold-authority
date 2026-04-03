import { Resend } from 'resend'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SendActivationEmailParams = {
  to: string
  activationUrl: string
  resendApiKey: string
}

export type SendPasswordResetEmailParams = {
  to: string
  resetUrl: string
  resendApiKey: string
}

// ─── E1: Purchase Confirmation + Activation Email ─────────────────────────────
//
// Sent immediately after Stripe checkout.session.completed webhook fires.
// Contains the activation link with a 48-hour KV token.

export async function sendActivationEmail({
  to,
  activationUrl,
  resendApiKey
}: SendActivationEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = new Resend(resendApiKey)

    const { error } = await resend.emails.send({
      from: 'Pre-Sold Authority System <access@presoldauthority.com>',
      to,
      subject: 'Your Pre-Sold Authority System — Set Your Password & Get Access',
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Activate Your Account</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Logo / Brand -->
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <p style="margin:0;font-size:1rem;font-weight:700;color:#f4f4f5;">
                The <span style="color:#fbbf24;">Pre-Sold Authority</span> System
              </p>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#18181b;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:40px 36px;">

              <h1 style="margin:0 0 8px;font-size:1.5rem;font-weight:800;color:#f4f4f5;">
                You're in. Set your password to get access.
              </h1>

              <p style="margin:0 0 24px;font-size:0.95rem;color:#a1a1aa;line-height:1.6;">
                Thank you for purchasing the Pre-Sold Authority System. Click the button below to set your password and activate your account.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${activationUrl}"
                       style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#fbbf24,#fcd34d);color:#09090b;text-decoration:none;font-weight:700;font-size:1rem;border-radius:9999px;">
                      Activate My Account
                    </a>
                  </td>
                </tr>
              </table>

              <!-- What they get -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.2);border-radius:10px;padding:16px 20px;margin-bottom:24px;">
                <tr>
                  <td>
                    <p style="margin:0 0 10px;font-size:0.85rem;font-weight:700;color:#fbbf24;text-transform:uppercase;letter-spacing:0.05em;">
                      What's included
                    </p>
                    <ul style="margin:0;padding-left:16px;color:#a1a1aa;font-size:0.875rem;line-height:1.8;">
                      <li>Full Pre-Sold Authority System course (video + PDF playbook)</li>
                      <li>Context Card + Prompt Pack + 48-hour install checklist</li>
                      <li>Bonus: Authority Positioning Blueprint (Agent Edition)</li>
                      <li>Bonus: 10 Authority Content Angles That Attract Serious Clients</li>
                      <li>Lifetime access</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <!-- Link fallback -->
              <p style="margin:0 0 8px;font-size:0.8rem;color:#71717a;">
                Button not working? Copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px;font-size:0.78rem;color:#a1a1aa;word-break:break-all;">
                <a href="${activationUrl}" style="color:#fbbf24;">${activationUrl}</a>
              </p>

              <!-- Expiry warning -->
              <p style="margin:0;font-size:0.8rem;color:#71717a;line-height:1.5;">
                This activation link expires in <strong style="color:#f4f4f5;">48 hours</strong>. 
                If it has expired, please contact 
                <a href="mailto:support@presoldauthority.com" style="color:#fbbf24;">support@presoldauthority.com</a>.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:20px;text-align:center;">
              <p style="margin:0;font-size:0.75rem;color:#52525b;line-height:1.5;">
                You received this email because you purchased the Pre-Sold Authority System.<br>
                If you did not make this purchase, please contact 
                <a href="mailto:support@presoldauthority.com" style="color:#71717a;">support@presoldauthority.com</a> immediately.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim()
    })

    if (error) {
      console.error('[email] sendActivationEmail error:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email error'
    console.error('[email] sendActivationEmail exception:', message)
    return { success: false, error: message }
  }
}

// ─── Password Reset Email ─────────────────────────────────────────────────────
//
// Sent when a user requests a password reset via /api/auth/forgot-password.

export async function sendPasswordResetEmail({
  to,
  resetUrl,
  resendApiKey
}: SendPasswordResetEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = new Resend(resendApiKey)

    const { error } = await resend.emails.send({
      from: 'Pre-Sold Authority System <access@presoldauthority.com>',
      to,
      subject: 'Reset your Pre-Sold Authority System password',
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <p style="margin:0;font-size:1rem;font-weight:700;color:#f4f4f5;">
                The <span style="color:#fbbf24;">Pre-Sold Authority</span> System
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#18181b;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:40px 36px;">

              <h1 style="margin:0 0 8px;font-size:1.5rem;font-weight:800;color:#f4f4f5;">
                Reset your password
              </h1>

              <p style="margin:0 0 24px;font-size:0.95rem;color:#a1a1aa;line-height:1.6;">
                We received a request to reset your password. Click the button below to choose a new one.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}"
                       style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#fbbf24,#fcd34d);color:#09090b;text-decoration:none;font-weight:700;font-size:1rem;border-radius:9999px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:0.8rem;color:#71717a;">
                Button not working? Copy and paste this link:
              </p>
              <p style="margin:0 0 24px;font-size:0.78rem;color:#a1a1aa;word-break:break-all;">
                <a href="${resetUrl}" style="color:#fbbf24;">${resetUrl}</a>
              </p>

              <p style="margin:0;font-size:0.8rem;color:#71717a;line-height:1.5;">
                This link expires in <strong style="color:#f4f4f5;">1 hour</strong>. 
                If you did not request a password reset, you can safely ignore this email.
              </p>

            </td>
          </tr>

          <tr>
            <td style="padding-top:20px;text-align:center;">
              <p style="margin:0;font-size:0.75rem;color:#52525b;line-height:1.5;">
                Pre-Sold Authority System ·
                <a href="mailto:support@presoldauthority.com" style="color:#71717a;">support@presoldauthority.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim()
    })

    if (error) {
      console.error('[email] sendPasswordResetEmail error:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email error'
    console.error('[email] sendPasswordResetEmail exception:', message)
    return { success: false, error: message }
  }
}
