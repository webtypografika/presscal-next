import { prisma } from '@/lib/db';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

/**
 * Get a valid Gmail access token for a user.
 * Refreshes automatically if expired.
 */
export async function getGmailToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: 'google' },
  });

  if (!account?.access_token) return null;

  const now = Math.floor(Date.now() / 1000);
  if (account.expires_at && account.expires_at < now && account.refresh_token) {
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

// ─── GMAIL API HELPERS ───

async function gmailFetch(token: string, path: string) {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── LIST MESSAGES ───

export interface GmailMessageMeta {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  labelIds: string[];
  hasAttachments: boolean;
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function hasAttachmentParts(payload: Record<string, unknown>): boolean {
  const parts = payload.parts as Array<Record<string, unknown>> | undefined;
  if (!parts) return false;
  return parts.some(p => {
    if (p.filename && (p.filename as string).length > 0) return true;
    if (p.parts) return hasAttachmentParts(p);
    return false;
  });
}

export async function listMessages(
  token: string,
  opts: { maxResults?: number; q?: string; pageToken?: string; labelIds?: string[] } = {}
): Promise<{ messages: GmailMessageMeta[]; nextPageToken?: string }> {
  const params = new URLSearchParams();
  params.set('maxResults', String(opts.maxResults || 20));
  if (opts.q) params.set('q', opts.q);
  if (opts.pageToken) params.set('pageToken', opts.pageToken);
  if (opts.labelIds) opts.labelIds.forEach(l => params.append('labelIds', l));

  const list = await gmailFetch(token, `/messages?${params}`);
  if (!list.messages) return { messages: [], nextPageToken: undefined };

  const ids = (list.messages as Array<{ id: string }>).map(m => m.id);

  // Use Gmail batch API — single HTTP request for all metadata
  const boundary = 'batch_presscal';
  const batchBody = ids.map(id =>
    `--${boundary}\r\nContent-Type: application/http\r\n\r\nGET /gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date\r\n`
  ).join('') + `--${boundary}--`;

  const batchRes = await fetch('https://www.googleapis.com/batch/gmail/v1', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/mixed; boundary=${boundary}`,
    },
    body: batchBody,
  });

  const messages: GmailMessageMeta[] = [];

  if (batchRes.ok) {
    const responseText = await batchRes.text();
    // Parse multipart response — extract JSON bodies
    const parts = responseText.split(/--batch_[^\r\n]+/).filter(p => p.includes('{'));
    for (const part of parts) {
      const jsonMatch = part.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;
      try {
        const msg = JSON.parse(jsonMatch[0]);
        if (!msg.id) continue;
        const headers = msg.payload?.headers || [];
        messages.push({
          id: msg.id,
          threadId: msg.threadId,
          snippet: msg.snippet || '',
          from: getHeader(headers, 'From'),
          to: getHeader(headers, 'To'),
          subject: getHeader(headers, 'Subject'),
          date: getHeader(headers, 'Date'),
          labelIds: msg.labelIds || [],
          hasAttachments: hasAttachmentParts(msg.payload || {}),
        });
      } catch { /* skip malformed */ }
    }
  } else {
    // Fallback: parallel individual requests
    const results = await Promise.all(
      ids.map(id => gmailFetch(token, `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`))
    );
    for (const msg of results) {
      const headers = msg.payload?.headers || [];
      messages.push({
        id: msg.id,
        threadId: msg.threadId,
        snippet: msg.snippet || '',
        from: getHeader(headers, 'From'),
        to: getHeader(headers, 'To'),
        subject: getHeader(headers, 'Subject'),
        date: getHeader(headers, 'Date'),
        labelIds: msg.labelIds || [],
        hasAttachments: hasAttachmentParts(msg.payload || {}),
      });
    }
  }

  return { messages, nextPageToken: list.nextPageToken };
}

// ─── GET FULL MESSAGE ───

export interface GmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface GmailFullMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  labelIds: string[];
  htmlBody: string;
  textBody: string;
  attachments: GmailAttachment[];
}

function extractBody(payload: Record<string, unknown>, mimeType: string): string {
  if (payload.mimeType === mimeType && payload.body) {
    const body = payload.body as { data?: string };
    if (body.data) return Buffer.from(body.data, 'base64url').toString('utf-8');
  }
  const parts = payload.parts as Array<Record<string, unknown>> | undefined;
  if (parts) {
    for (const part of parts) {
      const result = extractBody(part, mimeType);
      if (result) return result;
    }
  }
  return '';
}

function extractAttachments(payload: Record<string, unknown>): GmailAttachment[] {
  const atts: GmailAttachment[] = [];
  const parts = payload.parts as Array<Record<string, unknown>> | undefined;
  if (!parts) return atts;
  for (const part of parts) {
    const filename = part.filename as string;
    if (filename && filename.length > 0) {
      const body = part.body as { attachmentId?: string; size?: number } | undefined;
      atts.push({
        id: body?.attachmentId || '',
        filename,
        mimeType: (part.mimeType as string) || 'application/octet-stream',
        size: body?.size || 0,
      });
    }
    if (part.parts) atts.push(...extractAttachments(part));
  }
  return atts;
}

export async function getMessage(token: string, messageId: string): Promise<GmailFullMessage> {
  const msg = await gmailFetch(token, `/messages/${messageId}?format=full`);
  const headers = msg.payload?.headers || [];

  const htmlBody = extractBody(msg.payload, 'text/html');
  const textBody = extractBody(msg.payload, 'text/plain');

  // CID images are resolved lazily via /api/email/messages/[id]/attachments/[attId]
  // No blocking fetch here — keeps getMessage fast

  return {
    id: msg.id,
    threadId: msg.threadId,
    from: getHeader(headers, 'From'),
    to: getHeader(headers, 'To'),
    cc: getHeader(headers, 'Cc'),
    subject: getHeader(headers, 'Subject'),
    date: getHeader(headers, 'Date'),
    labelIds: msg.labelIds || [],
    htmlBody,
    textBody,
    attachments: extractAttachments(msg.payload),
  };
}

function extractCidMap(payload: Record<string, unknown>): Record<string, string> {
  const map: Record<string, string> = {};
  const parts = payload.parts as Array<Record<string, unknown>> | undefined;
  if (!parts) return map;
  for (const part of parts) {
    const headers = part.headers as Array<{ name: string; value: string }> | undefined;
    const contentId = headers?.find(h => h.name.toLowerCase() === 'content-id')?.value;
    const body = part.body as { attachmentId?: string } | undefined;
    if (contentId && body?.attachmentId) {
      const cid = contentId.replace(/^<|>$/g, '');
      map[cid] = body.attachmentId;
    }
    if (part.parts) Object.assign(map, extractCidMap(part));
  }
  return map;
}

// ─── GET THREAD (all messages in a conversation) ───

export async function getThread(token: string, threadId: string): Promise<string[]> {
  const data = await gmailFetch(token, `/threads/${threadId}?format=minimal`);
  const messages = data.messages as Array<{ id: string }> | undefined;
  return messages?.map(m => m.id) || [];
}

// ─── GET ATTACHMENT ───

export async function getAttachment(token: string, messageId: string, attachmentId: string): Promise<string> {
  const data = await gmailFetch(token, `/messages/${messageId}/attachments/${attachmentId}`);
  return (data.data as string).replace(/-/g, '+').replace(/_/g, '/');
}

// ─── LIST LABELS ───

export interface GmailLabel {
  id: string;
  name: string;
  type: string;
  messagesTotal?: number;
  messagesUnread?: number;
}

export async function listLabels(token: string): Promise<GmailLabel[]> {
  const data = await gmailFetch(token, '/labels');
  return (data.labels || []).map((l: Record<string, unknown>) => ({
    id: l.id as string,
    name: l.name as string,
    type: l.type as string,
    messagesTotal: l.messagesTotal as number | undefined,
    messagesUnread: l.messagesUnread as number | undefined,
  }));
}

// ─── SEND EMAIL ───

export async function sendGmail(
  accessToken: string,
  from: string,
  to: string,
  subject: string,
  htmlBody: string,
  opts?: { inReplyTo?: string; references?: string; threadId?: string; cc?: string; attachments?: Array<{ filename: string; mimeType: string; data: string }> }
): Promise<{ ok: boolean; error?: string }> {
  const boundary = 'presscal_boundary_' + Date.now();
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    opts?.cc ? `Cc: ${opts.cc}` : '',
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    opts?.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : '',
    opts?.references ? `References: ${opts.references}` : '',
  ].filter(Boolean);

  let mimeMessage: string;

  if (opts?.attachments && opts.attachments.length > 0) {
    // Multipart/mixed with attachments
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    const parts = [
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(htmlBody).toString('base64'),
    ];
    for (const att of opts.attachments) {
      parts.push(
        `--${boundary}`,
        `Content-Type: ${att.mimeType}; name="${att.filename}"`,
        `Content-Disposition: attachment; filename="${att.filename}"`,
        'Content-Transfer-Encoding: base64',
        '',
        att.data,
      );
    }
    parts.push(`--${boundary}--`);
    mimeMessage = headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n');
  } else {
    headers.push(`Content-Type: text/html; charset=UTF-8`);
    headers.push('Content-Transfer-Encoding: base64');
    mimeMessage = headers.join('\r\n') + '\r\n\r\n' + Buffer.from(htmlBody).toString('base64');
  }

  const raw = Buffer.from(mimeMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const body: Record<string, string> = { raw };
  if (opts?.threadId) body.threadId = opts.threadId;

  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.ok) return { ok: true };
  const err = await res.text();
  return { ok: false, error: err };
}
