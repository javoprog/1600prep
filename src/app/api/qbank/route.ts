import { NextRequest, NextResponse } from 'next/server';

const QBANK_BASE = 'https://qbank-api.collegeboard.org/msreportingquestionbank-prod';
const SAIC_BASE = 'https://saic.collegeboard.org/disclosed';
const UPSTREAM_TIMEOUT_MS = 12000;
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
};

async function fetchUpstream(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function handleProxyAction(
  action: string | null,
  payload: Record<string, unknown> | undefined,
  cacheable: boolean
): Promise<NextResponse> {
  const headers = cacheable ? CACHE_HEADERS : undefined;

  if (action === 'lookup') {
    const res = await fetchUpstream(`${QBANK_BASE}/questionbank/lookup`, {
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
    return NextResponse.json(data, { headers });
  }

  if (action === 'get-questions') {
    const asmtEventId = Number(payload?.asmtEventId);
    const test = Number(payload?.test);
    const domain = String(payload?.domain || '').replace(/[^a-zA-Z0-9,_.-]/g, '');
    if (
      !Number.isInteger(asmtEventId) ||
      (test !== 1 && test !== 2) ||
      !domain
    ) {
      return NextResponse.json(
        { error: 'Invalid get-questions parameters' },
        { status: 400 }
      );
    }

    const res = await fetchUpstream(`${QBANK_BASE}/questionbank/digital/get-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ asmtEventId, test, domain }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream get-questions returned ${res.status}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json(data, { headers });
  }

  if (action === 'get-question') {
    const externalId = String(payload?.external_id || '').trim();
    if (!externalId || !/^[a-zA-Z0-9_-]{1,128}$/.test(externalId)) {
      return NextResponse.json({ error: 'Invalid external_id' }, { status: 400 });
    }

    const res = await fetchUpstream(`${QBANK_BASE}/questionbank/digital/get-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ external_id: externalId }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream get-question returned ${res.status}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json(data, { headers });
  }

  if (action === 'get-disclosed') {
    const ibn = String(payload?.ibn || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!ibn) {
      return NextResponse.json({ error: 'Invalid ibn' }, { status: 400 });
    }

    const res = await fetchUpstream(`${SAIC_BASE}/${ibn}.json`, {
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
    return NextResponse.json(data, { headers });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const payload: Record<string, unknown> = {
      asmtEventId: searchParams.get('asmtEventId'),
      test: searchParams.get('test'),
      domain: searchParams.get('domain'),
      external_id: searchParams.get('external_id'),
      ibn: searchParams.get('ibn'),
    };
    return await handleProxyAction(action, payload, true);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal proxy error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, payload } = body || {};
    return await handleProxyAction(
      typeof action === 'string' ? action : null,
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined,
      false
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal proxy error' },
      { status: 500 }
    );
  }
}
