// Deno Edge Function: get-openai-costs
// Proxy to OpenAI Organization Costs endpoint. Returns { total_cost, raw }
// @ts-nocheck

const OPENAI_BASE = 'https://api.openai.com/v1';

function makeCorsHeaders(origin: string | undefined) {
  const allowOrigin = origin || '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,OpenAI-Organization,OpenAI-Project,x-client-info',
    'Access-Control-Max-Age': '600'
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || req.headers.get('Origin') || undefined;
  const corsHeaders = makeCorsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Missing authorization header' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  const OPENAI_API_KEY = Deno.env.get('ADMIN_OPENAI_API_KEY');
  if (!OPENAI_API_KEY) return new Response(JSON.stringify({ error: 'ADMIN_OPENAI_API_KEY or OPENAI_API_KEY not set on the server' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    const body = await req.json().catch(() => ({}));
    const start_time = body?.start_time || Math.floor(Date.now()/1000) - 30*24*60*60;
    const end_time = body?.end_time || undefined;
    const limit = body?.limit || 180;
    const page = body?.page || undefined;

    // Allow optional organization/project via env or forwarded header (if present)
    const envOrg = Deno.env.get('OPENAI_ORG_ID') || Deno.env.get('OPENAI_ORGANIZATION');
    const envProject = Deno.env.get('OPENAI_PROJECT_ID');
    const hdrOrg = req.headers.get('openai-organization') || req.headers.get('OpenAI-Organization') || undefined;
    const hdrProj = req.headers.get('openai-project') || req.headers.get('OpenAI-Project') || undefined;

    const url = new URL(`${OPENAI_BASE}/organization/costs`);
    url.searchParams.set('start_time', String(start_time));
    url.searchParams.set('limit', String(limit));
    if (end_time) url.searchParams.set('end_time', String(end_time));
    if (page) url.searchParams.set('page', String(page));

    const headers: Record<string,string> = {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    };
    const orgVal = envOrg || hdrOrg;
    const projVal = envProject || hdrProj;
    if (orgVal) headers['OpenAI-Organization'] = orgVal;
    if (projVal) headers['OpenAI-Project'] = projVal;

    const resp = await fetch(url.toString(), { method: 'GET', headers });
    const text = await resp.text().catch(()=>'');
    let j: any = null;
    try { j = text ? JSON.parse(text) : null; } catch (e) { j = text; }

    if (!resp.ok) {
      return new Response(JSON.stringify({ status: resp.status, raw: j || text }), { status: resp.status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // Aggregate cost from known shapes: total_cost or nested data[].results[].amount.value
    let total = 0;
    if (j && typeof j === 'object') {
      if (typeof j.total_cost === 'number') {
        total = j.total_cost;
      } else if (typeof j.total === 'number') {
        total = j.total;
      } else if (Array.isArray(j.data)) {
        for (const pageObj of j.data) {
          if (Array.isArray(pageObj.results)) {
            for (const r of pageObj.results) {
              total += Number(r?.amount?.value || 0);
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ total_cost: total, raw: j }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e) {
    const origin = (e && (e as any).origin) || undefined;
    const corsHeaders2 = makeCorsHeaders(origin);
    console.error('get-openai-costs error', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders2 } });
  }
});
