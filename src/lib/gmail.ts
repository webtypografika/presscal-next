import { prisma } from '@/lib/db';

/**
 * Get a valid Gmail access token for a user.
 * Refreshes automatically if expired.
 */
export async function getGmailToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: 'google' },
  });

  if (!account?.access_token) return null;

  // Check if token expired
  const now = Math.floor(Date.now() / 1000);
  if (account.expires_at && account.expires_at < now && account.refresh_token) {
    // Refresh the token
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: account.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (res.ok) {
      const data = await res.json();
      await prisma.account.update({
        where: { id: account.id },
        data: {
          access_token: data.access_token,
          expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
        },
      });
      return data.access_token;
    }
    return null;
  }

  return account.access_token;
}

/**
 * Send email via Gmail API using user's OAuth token.
 */
export async function sendGmail(
  accessToken: string,
  from: string,
  to: string,
  subject: string,
  htmlBody: string,
): Promise<{ ok: boolean; error?: string }> {
  // Build MIME message
  const boundary = 'presscal_boundary_' + Date.now();
  const mimeMessage = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(htmlBody).toString('base64'),
    `--${boundary}--`,
  ].join('\r\n');

  const raw = Buffer.from(mimeMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (res.ok) return { ok: true };
  const err = await res.text();
  return { ok: false, error: err };
}
