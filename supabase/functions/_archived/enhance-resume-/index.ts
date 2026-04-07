// @ts-nocheck
// Edge Function: enhance-resume (archived copy)
// Receives { job_id, prompt, extracted_text } and applies a free, rule-based enhancement.
// This copy is archived to preserve history while the repo migrates to sending resumes directly to the AI agent.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface Payload { job_id: string; prompt?: string; extracted_text: string; }

function enhanceTextRule(raw: string, prompt?: string): { enhanced: string; tokenCount: number; json: any } {
  const clean = raw.replace(/\r/g,'');
  const words = clean.split(/\s+/);
  const summary = words.slice(0, 80).join(' ');
  const lines = clean.split(/\n+/).map(l => l.trim()).filter(l => l.length > 25 && /[a-zA-Z]/.test(l)).slice(0, 6);
  const responsibilities = lines.map(l => l.replace(/^[-B*]\s*/,'')).map(l => l.charAt(0).toUpperCase()+l.slice(1));
  const json = {
    personal_information: { full_name: '', job_title: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
    summary: summary,
    professional_experience: responsibilities.length ? [{ company: 'Company', job_title: 'Role', location: '', start_date: '', end_date: 'Present', responsibilities }] : [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    languages: [],
    awards_activities: []
  };
  const enhanced = JSON.stringify(json, null, 2);
  const tokenCount = enhanced.split(/\s+/).length;
  return { enhanced, tokenCount, json };
}

async function enhanceWithModel(raw: string, prompt?: string) {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');
  // Truncate overly large input to keep request small
  const MAX_CHARS = 20000;
  const truncated = raw.length > MAX_CHARS ? raw.slice(0, MAX_CHARS) + '\n...[TRUNCATED]...' : raw;
  const userContent = `You are given the RAW TEXT of a resume. Improve and normalize it into a structured JSON object.\n\nREQUIREMENTS:\n1. Return ONLY valid JSON (no markdown, no backticks).\n2. Use this exact schema with these keys and only these keys:\n{\n  "personal_information": {\n    "full_name": "", "job_title": "", "email": "", "phone": "", "location": "", "linkedin": "", "github": "", "portfolio": ""\n  },\n  "summary": "",\n  "professional_experience": [ { "company": "", "job_title": "", "location": "", "start_date": "", "end_date": "", "responsibilities": ["..."] } ],\n  "education": [ { "school": "", "degree": "", "start_date": "", "end_date": "", "details": "" } ],\n  "skills": ["..."],\n  "projects": [ { "title": "", "description": "" } ],\n  "certifications": ["..."],\n  "languages": ["..."],\n  "awards_activities": ["..."]\n}\n3. Improve wording for clarity, impact & quantification but DO NOT invent achievements.\n4. Bullet responsibilities should start with strong verbs and be concise.\n5. If data is missing leave fields empty ("" or []).\n6. Maintain date formats as they appear or normalize to Mon YYYY if obvious.\n\nUSER PROMPT / TARGET: ${prompt || 'General improvement'}\n\nRAW RESUME TEXT:\n${truncated}`;
  const body = {
    model: 'deepseek/deepseek-r1-0528:free',
    messages: [
      { role: 'system', content: 'You are an expert resume optimization assistant that outputs ONLY valid JSON matching an exact schema.' },
      { role: 'user', content: userContent }
    ],
    temperature: 0.4,
    max_tokens: 1600
  };
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': Deno.env.get('OPENROUTER_REF') || 'http://localhost',
      'X-Title': 'quill-and-craft'
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Model request failed (${resp.status}): ${txt}`);
  }
  const data = await resp.json();
  let content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('No content returned from model');
  // Strip markdown fences if model added them
  content = content.replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  // Attempt to isolate first JSON object
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace > 0 || lastBrace > 0) {
    content = content.slice(firstBrace, lastBrace + 1);
  }
  let parsed: any;
  try { parsed = JSON.parse(content); } catch (e) {
    throw new Error('Model did not return valid JSON');
  }
  const tokenCount = data.usage?.total_tokens || content.split(/\s+/).length;
  return { enhanced: JSON.stringify(parsed, null, 2), tokenCount, json: parsed };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

Deno.serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    const body: Payload = await req.json();
    if (!body.job_id || !body.extracted_text) {
      return new Response(JSON.stringify({ error: 'job_id and extracted_text required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!; // user JWT will provide auth context
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    // Ownership check
    const { data: job, error: jobErr } = await supabase
      .from('resume_jobs')
      .select('id,user_id,enhanced_text')
      .eq('id', body.job_id)
      .single();
    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    let enhanced: string; let tokenCount: number; let modelUsed = 'rule-based-v1'; let enhancementError: string | null = null; let resumeJson: any = null;
    try {
      const r = await enhanceWithModel(body.extracted_text, body.prompt);
      enhanced = r.enhanced; tokenCount = r.tokenCount; modelUsed = 'openrouter:deepseek-r1-0528:free'; resumeJson = r.json;
    } catch (modelErr) {
      enhancementError = (modelErr as Error).message;
      const fallback = enhanceTextRule(body.extracted_text, body.prompt);
      enhanced = fallback.enhanced; tokenCount = fallback.tokenCount; modelUsed = 'rule-based-fallback'; resumeJson = fallback.json;
    }

    const { error: updateErr } = await supabase
      .from('resume_jobs')
      .update({
  original_text: body.extracted_text,
  raw_text: body.extracted_text,
  enhanced_text: enhanced,
  enhancement_model: modelUsed,
  enhancement_tokens: tokenCount,
  enhancement_error: enhancementError,
  resume_json: resumeJson
      })
      .eq('id', body.job_id);

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

  return new Response(JSON.stringify({ enhanced_text: enhanced, tokens: tokenCount, model: modelUsed, resume_json: resumeJson }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Unexpected error' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
});
