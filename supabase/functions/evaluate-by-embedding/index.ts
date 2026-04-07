// Deno Edge Function: evaluate-by-embedding
// Generates embeddings for each formation row using OpenAI text-embedding-3-small,
// compares to resume embeddings stored in DB (or generates them on-demand),
// and returns top-3 resume matches per formation.
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

function makeCorsHeaders(origin) {
  const allowOrigin = origin || '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Authorization, authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
  };
}

const OPENAI_BASE = 'https://api.openai.com/v1';

async function createEmbedding(apiKey, text) {
  const resp = await fetch(`${OPENAI_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text })
  });
  if (!resp.ok) {
    const raw = await resp.text().catch(()=>'');
    throw new Error(`OpenAI embeddings error ${resp.status} ${raw}`);
  }
  const j = await resp.json();
  const emb = j?.data?.[0]?.embedding ?? null;
  if (!emb) throw new Error('No embedding returned');
  return emb;
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Build a simple text representation of resume JSON to embed
function resumeToText(resume) {
  if (!resume || typeof resume !== 'object') return '';
  const parts = [];
  try {
    const p = resume.personal_information || {};
    if (p.full_name) parts.push(p.full_name);
    if (p.job_title) parts.push(p.job_title);
    if (resume.summary) parts.push(resume.summary);
    if (resume.skills && Array.isArray(resume.skills)) parts.push((resume.skills||[]).join(', '));
    if (resume.professional_experience && Array.isArray(resume.professional_experience)) {
      for (const e of resume.professional_experience.slice(0,5)) {
        parts.push([e.job_title, e.company, e.responsibilities && e.responsibilities.slice(0,3).join('; ')].filter(Boolean).join(' - '));
      }
    }
    if (resume.education && Array.isArray(resume.education)) parts.push(resume.education.map(e=>e.degree+' '+(e.school||'')).join('; '));
  } catch(e) {}
  return parts.filter(Boolean).join('\n');
}

// Try to extract a concise formation name from the provided row.
function extractFormationName(row) {
  try {
    // Prefer explicit fields
    if (row.formation && String(row.formation).trim()) return String(row.formation).trim();
    if (row.data && typeof row.data === 'object') {
      const keys = Object.keys(row.data);
      // common key names that might contain formation name
      const candidates = ['formation', 'Formation', 'niche', 'Niche', 'title', 'Title', 'name', 'Name'];
      for (const k of candidates) {
        if (k in row.data && String(row.data[k] || '').trim()) return String(row.data[k]).trim();
      }
      // otherwise, try first non-empty value
      for (const k of keys) {
        const v = String(row.data[k] || '').trim();
        if (v) return v;
      }
    }
    // If raw_text includes a line like "Formation: ..." or "Formation - ..." or "Formation\n..."
    if (row.raw_text && String(row.raw_text).trim()) {
      const rt = String(row.raw_text);
      const m = rt.match(/Formation[:\-\s]+([^\n\r]*)/i) || rt.match(/^(.*?)\s+Description[:\-\s]/i);
      if (m && m[1]) return m[1].trim();
      // fallback to first line
      const firstLine = rt.split(/\r?\n/)[0].trim();
      if (firstLine) return firstLine;
    }
  } catch (e) {}
  return '';
}

function normalizeText(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/\p{Diacritic}/gu, '').trim();
}

// On-demand: generate and store embeddings on resume_jobs.resume_embedding for resumes
async function ensureResumeEmbeddings(adminClient, openaiKey) {
  try {
    // Select resumes which have json_url and do not yet have resume_embedding
    const { data: resumes, error: rErr } = await adminClient.from('resume_jobs').select('id,json_url,original_filename,resume_embedding').not('json_url','is',null).limit(500);
    if (rErr) {
      console.warn('Failed to query resume_jobs for embeddings', rErr.message || rErr);
      return;
    }
    for (const r of (resumes||[])) {
      try {
        if (r.resume_embedding) continue; // already has embedding
        if (!r.json_url) continue;
        const res = await fetch(r.json_url);
        if (!res.ok) continue;
        const j = await res.json().catch(()=>null);
        if (!j) continue;
        const text = resumeToText(j) || JSON.stringify(j).slice(0,2000);
        const emb = await createEmbedding(openaiKey, text);
        // update resume_jobs row with resume_embedding
        try {
          await adminClient.from('resume_jobs').update({ resume_embedding: emb }).eq('id', r.id);
        } catch (updErr) {
          console.warn('Failed to update resume_jobs with embedding', updErr?.message || updErr);
        }
      } catch(e) {
        console.warn('Failed to create embedding for resume', r.id, e?.message || e);
      }
    }
  } catch (e) { console.warn('ensureResumeEmbeddings error', e); }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || req.headers.get('Origin') || undefined;
  const corsHeaders = makeCorsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    const body = await req.json().catch(()=>null) || {};
    const rows = body.rows || [];
    if (!rows.length) return new Response(JSON.stringify({ error: 'rows[] required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!OPENAI_API_KEY) return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not set' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return new Response(JSON.stringify({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Ensure resume_embeddings table has entries for resume_jobs with json_url (best-effort)
    await ensureResumeEmbeddings(supabase, OPENAI_API_KEY);

    // Fetch available resume embeddings and metadata from resume_jobs.resume_embedding
    const { data: rowsWithEmb, error: embErr } = await supabase.from('resume_jobs').select('id,resume_embedding,original_filename,json_url,owner_display_name,niche').not('resume_embedding','is',null).limit(1000);
    if (embErr) {
      console.warn('Failed to read resume_jobs.resume_embedding', embErr.message || embErr);
    }
    const embeddingsIndex = (rowsWithEmb || []).map((r:any)=>({ job_id: r.id, embedding: r.resume_embedding, job_meta: r }));

    const results = [];
    for (const row of rows) {
      // Build text for formation: prefer row.raw_text then join of row.data
      let formationText = '';
      try {
        if (row.raw_text && String(row.raw_text).trim()) formationText = String(row.raw_text);
        else if (row.data && typeof row.data === 'object') formationText = Object.values(row.data).map(v=>String(v||'')).join('\n');
        else formationText = JSON.stringify(row).slice(0,2000);
      } catch(e) { formationText = String(row.raw_text || JSON.stringify(row)); }

      let formationEmbedding = null;
      try {
        formationEmbedding = await createEmbedding(OPENAI_API_KEY, formationText);
      } catch (e) {
        console.error('Embedding creation failed for formation', e?.message || e);
        return new Response(JSON.stringify({ error: 'Failed to create formation embedding', detail: String(e?.message || e) }), { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }

        // Determine formation name to use for filtering resumes
        const formationName = extractFormationName(row) || '';
        const normalizedFormation = normalizeText(formationName);

        // Filter candidates by niche field if we can determine a formation name
        let candidateIndex = embeddingsIndex;
        if (normalizedFormation) {
          candidateIndex = embeddingsIndex.filter(e => {
            const niche = e.job_meta && e.job_meta.niche ? normalizeText(e.job_meta.niche) : '';
            // match if niche includes formation or formation includes niche (loose match)
            if (!niche) return false;
            return niche.includes(normalizedFormation) || normalizedFormation.includes(niche);
          });
        }

        // Score against the filtered resume embeddings
        const scored = [];
        for (const e of candidateIndex) {
          try {
            const sim = cosineSimilarity(formationEmbedding, e.embedding);
            if (sim !== -1) scored.push({ job_id: e.job_id, score: sim });
          } catch (ee) { /* ignore per-row errors */ }
        }
        // If no candidates after filtering, return helpful message
        if (!scored.length) {
          const msg = normalizedFormation
            ? `No resumes found for formation \"${formationName}\" (niche filter applied)`
            : 'No resume embeddings available to compare';
          results.push({ formation: formationName || formationText, top: [], message: msg });
          continue;
        }
      scored.sort((a,b)=>b.score - a.score);
      const top = scored.slice(0,3);
      // Enrich with job metadata; prefer metadata included in embeddingsIndex rows
      const jobsById = {};
      for (const e of embeddingsIndex) {
        if (e.job_meta) jobsById[e.job_id] = e.job_meta;
      }
      // For any missing job metadata, fetch from resume_jobs
      const missingIds = top.map(t=>t.job_id).filter(id => !jobsById[id]);
      if (missingIds.length) {
        try {
          const { data: jobs, error: jobsErr } = await supabase.from('resume_jobs').select('id,original_filename,json_url,owner_display_name,niche').in('id', missingIds);
          for (const j of (jobs||[])) jobsById[j.id] = j;
        } catch (e) { /* ignore */ }
      }
      const topEnriched = top.map(t=>({ job_id: t.job_id, score: t.score, job: jobsById[t.job_id] || null }));
      results.push({ formation: formationText, top: topEnriched });
    }

    return new Response(JSON.stringify({ results }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e) {
    const origin = req.headers.get('origin') || req.headers.get('Origin') || undefined;
    const corsHeaders = makeCorsHeaders(origin);
    console.error('evaluate-by-embedding error', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
});
