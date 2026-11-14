import { NextRequest, NextResponse } from 'next/server';

const QBANK_BASE = 'https://qbank-api.collegeboard.org/msreportingquestionbank-prod';
const SAIC_BASE = 'https://saic.collegeboard.org/disclosed';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, payload } = body;

    if (action === 'lookup') {
      const res = await fetch(`${QBANK_BASE}/questionbank/lookup`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Upstream lookup returned ${res.status}` },
          { status: res.status }
        );
      }
      const data = await res.json();
      return NextResponse.json(data);
    }

    if (action === 'get-questions') {
      const res = await fetch(`${QBANK_BASE}/questionbank/digital/get-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Upstream get-questions returned ${res.status}` },
          { status: res.status }
        );
      }
      const data = await res.json();
      return NextResponse.json(data);
    }

    if (action === 'get-question') {
      const res = await fetch(`${QBANK_BASE}/questionbank/digital/get-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Upstream get-question returned ${res.status}` },
          { status: res.status }
        );
      }
      const data = await res.json();
      return NextResponse.json(data);
    }

    if (action === 'get-disclosed') {
      const ibn = String(payload?.ibn || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!ibn) {
        return NextResponse.json({ error: 'Invalid ibn' }, { status: 400 });
      }
      const res = await fetch(`${SAIC_BASE}/${ibn}.json`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Upstream disclosed returned ${res.status}` },
          { status: res.status }
        );
      }
      const data = await res.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal proxy error' },
      { status: 500 }
    );
  }
}
