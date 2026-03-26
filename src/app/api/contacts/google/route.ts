import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGmailToken } from '@/lib/gmail';

const PEOPLE_API = 'https://people.googleapis.com/v1/people/me/connections';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as Record<string, unknown>)?.id as string;
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const token = await getGmailToken(userId);
    if (!token) return NextResponse.json({ error: 'No Google token — re-login may be required' }, { status: 401 });

    // Fetch all contacts (paginated)
    const allContacts: any[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        personFields: 'names,emailAddresses,phoneNumbers,organizations,addresses',
        pageSize: '1000',
        sortOrder: 'FIRST_NAME_ASCENDING',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const res = await fetch(`${PEOPLE_API}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`Google People API ${res.status}:`, errText);

        // Parse the error to give a useful message
        let parsed: any = {};
        try { parsed = JSON.parse(errText); } catch {}
        const reason = parsed?.error?.errors?.[0]?.reason || '';
        const message = parsed?.error?.message || errText;

        // API not enabled in Google Cloud Console
        if (res.status === 403 && (message.includes('not been used') || message.includes('not enabled') || reason === 'forbidden')) {
          return NextResponse.json({
            error: 'Το People API δεν είναι ενεργοποιημένο στο Google Cloud Console. Ενεργοποιήστε το "People API" στο console.cloud.google.com → APIs & Services → Enable APIs.',
            apiNotEnabled: true,
          }, { status: 403 });
        }

        // Insufficient scopes
        if (res.status === 403 && (message.includes('insufficient') || reason === 'insufficientPermissions')) {
          return NextResponse.json({
            error: 'Δεν έχει δοθεί πρόσβαση στις επαφές. Κάντε αποσύνδεση και ξανασυνδεθείτε για να δώσετε πρόσβαση.',
            needsReauth: true,
          }, { status: 403 });
        }

        return NextResponse.json({ error: `Google API: ${message}` }, { status: res.status });
      }

      const data = await res.json();
      if (data.connections) allContacts.push(...data.connections);
      pageToken = data.nextPageToken;
    } while (pageToken);

    // Transform to our format
    const contacts = allContacts
      .map((p: any) => {
        const name = p.names?.[0]?.displayName || '';
        const email = p.emailAddresses?.[0]?.value || '';
        const phone = p.phoneNumbers?.find((ph: any) => ph.type !== 'mobile')?.value
          || p.phoneNumbers?.[0]?.value || '';
        const mobile = p.phoneNumbers?.find((ph: any) => ph.type === 'mobile')?.value || '';
        const company = p.organizations?.[0]?.name || '';
        const address = p.addresses?.[0]?.formattedValue || '';
        const city = p.addresses?.[0]?.city || '';
        const zip = p.addresses?.[0]?.postalCode || '';

        return { name, email, phone, mobile, company, address, city, zip };
      })
      .filter((c: any) => c.name || c.email); // skip empty

    return NextResponse.json({ contacts, total: contacts.length });
  } catch (e) {
    console.error('Google Contacts error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
