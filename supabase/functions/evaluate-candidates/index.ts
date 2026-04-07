// Deno Edge Function: evaluate-candidates
// @ts-nocheck
// Input: { rows: any[], prompt: string, source_filename?: string }
// Output: best candidate structured resume + comparison report stored in candidate_evaluations
// Uses OpenAI gpt-4o-mini (chat completions)
// NOTE: minimal defensive coding; adapt schema as needed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
function makeCorsHeaders(origin) {
  const allowOrigin = origin || '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Authorization, authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400'
  };
}
function buildSystemPrompt() {
  return `You are an expert technical recruiter.
Given a list of candidate row objects parsed from a spreadsheet (JSON array) and a role prompt:
1. Select the single best candidate.
2. Produce a STRICT JSON with keys: {
  "best_candidate_resume": { {

"personal_information": { "full_name": "", "job_title": "", "email": "", "phone": "", "location": "", "linkedin": "", "portfolio": "" },

"summary": "",

"skills": [""],

"professional_experience": [ { "job_title": "", "company": "", "location": "", "start_date": "", "end_date": "", "responsibilities": [""] } ],

"education": [ { "degree": "", "school": "", "start_date": "", "end_date": "", "details": "" } ],

"projects": [ { "title": "", "description": "" } ],

"certifications": [""],

"languages": [""],

"awards_activities": [""],

"additional_information": {
  "volunteer_experience": [""],
  "publications": [""],
  "conferences_attended": [""],
  "technical_skills": [""],
  "soft_skills": [""],
  "interests": [""]
},

"report": {
  "summary": "",
  "strengths": [""],
  "gaps": [""],
  "recommended_roles": [
    { "title": "", "seniority": "", "match_score": 0, "why": "" }
  ]
}

} },
  "comparison_report": {
     "summary": string,
     "why_best": string[],
     "close_alternatives": [ { "index": number, "reason": string } ]
  }
}
Rules:
- Return ONLY valid JSON.
- Avoid extra commentary.
- Limit each reason to <= 160 characters.
- Provide at most 3 close_alternatives.
`;
}
function buildUserPrompt(rows, prompt) {
  const trimmedRows = rows.slice(0, 100); // safety limit
  return `ROLE / USER PROMPT:\n${prompt}\n\nCANDIDATE ROWS JSON (array):\n${JSON.stringify(trimmedRows, null, 2)}\n\nReturn JSON now.`;
}
async function callOpenAI(apiKey, rows, prompt) {
  const body = {
    model: 'gpt-4o-mini',
    temperature: 0.3,
    max_tokens: 1600,
    messages: [
      {
        role: 'system',
        content: buildSystemPrompt()
      },
      {
        role: 'user',
        content: buildUserPrompt(rows, prompt)
      }
    ]
  };
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error(`OpenAI error ${resp.status}`);
  const data = await resp.json();
  const raw = String(data.choices?.[0]?.message?.content || '').trim();
  if (!raw) throw new Error('No content from model');

  function extractJsonText(text) {
    if (!text) return { jsonText: null, error: 'empty' };
    // remove BOM, smart quotes
    text = text.replace(/^\uFEFF/, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    // remove fenced code blocks and surrounding backticks
    text = text.replace(/```(?:json)?\s*/ig, '').replace(/```$/g, '').trim();
    text = text.replace(/^`+/, '').replace(/`+$/, '').trim();

    const firstBrace = text.indexOf('{');
    if (firstBrace === -1) return { jsonText: null, error: 'no_open_brace' };

    let depth = 0;
    let endIndex = -1;
    for (let i = firstBrace; i < text.length; i++) {
      const ch = text[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { endIndex = i; break; }
      }
    }
    if (endIndex === -1) return { jsonText: null, error: 'unbalanced_braces' };

    const candidate = text.slice(firstBrace, endIndex + 1).trim();
    // replace literal string "[object Object]" which appears when non-serializable values were passed
    const cleaned = candidate.replace(/"\[object Object\]"/g, 'null');
    return { jsonText: cleaned, error: null };
  }

  let parseError = null;
  let parsed = null;
  const { jsonText, error: extractErr } = extractJsonText(raw);
  if (!jsonText) {
    parseError = `extract_error:${extractErr}`;
  } else {
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      parseError = `parse_error:${String(e.message || e)}`;
      // relaxed attempt: remove trailing commas
      try {
        const relaxed = jsonText.replace(/,\s*(\}|\])/g, '$1');
        parsed = JSON.parse(relaxed);
        parseError += '; relaxed_parse_succeeded';
      } catch (e2) {
        // still failing
      }
    }
  }

  return { json: parsed, parseError, usage: data.usage, model: body.model, raw_content: raw };
}
Deno.serve(async (req)=>{
  try {
    const origin = req.headers.get('origin') || req.headers.get('Origin') || undefined;
    const corsHeaders = makeCorsHeaders(origin);
    if (req.method === 'OPTIONS') return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
    if (req.method !== 'POST') return new Response('Method Not Allowed', {
      status: 405,
      headers: corsHeaders
    });
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response('Unauthorized', {
      status: 401,
      headers: corsHeaders
    });
    const payload = await req.json();
    if (!payload.rows?.length || !payload.prompt) return new Response(JSON.stringify({
      error: 'rows[] and prompt required'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) return new Response(JSON.stringify({
      error: 'OPENAI_API_KEY not set'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    // Get user id from auth context
    const { data: userInfo } = await supabase.auth.getUser();
    const userId = userInfo?.user?.id;
    if (!userId) return new Response(JSON.stringify({
      error: 'Auth user missing'
    }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
    const { json, parseError, usage, model, raw_content } = await callOpenAI(OPENAI_API_KEY, payload.rows, payload.prompt);
    // If model returned nothing or could not be parsed, return early and do not save to DB
    if (!json) {
      console.warn('[evaluate-candidates] no JSON returned from model', { parseError, raw_content });
      return new Response(JSON.stringify({ message: 'No result found from model', parseError, raw_model_content: raw_content }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
    // Normalize possible key names returned by the model
    let best = null;
    let comparison = null;
    if (json) {
      best = json.best_candidate_resume || json.best_candidate || json.best || null;
      comparison = json.comparison_report || json.comparison || null;
    }
    // If parsing succeeded but no best candidate was provided, return no result and skip DB
    if (!best) {
      console.warn('[evaluate-candidates] parsed JSON but no best candidate found', { json, parseError, raw_content });
      return new Response(JSON.stringify({ message: 'No best candidate found in model response', parseError, raw_model_content: raw_content }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
    console.log('[evaluate-candidates] best_candidate_resume', best);
    console.log('[evaluate-candidates] comparison_report', comparison);
    let evaluation_id = null;
    let db_warning = null;
    try {
      const { data: inserted, error: insErr } = await supabase.from('candidate_evaluations').insert({
        user_id: userId,
        source_filename: payload.source_filename || null,
        raw_rows: payload.rows,
        best_candidate: best,
        comparison_report: comparison ? JSON.stringify(comparison) : null,
        model,
        prompt: payload.prompt
      }).select('id').single();
      if (insErr) {
        db_warning = insErr.message;
      } else {
        evaluation_id = inserted.id;
      }
    } catch (dbErr) {
      db_warning = dbErr.message || 'DB insert exception';
    }
    return new Response(JSON.stringify({
      evaluation_id,
      best_candidate: best,
      comparison_report: comparison,
      model,
      usage,
      raw_model_content: raw_content,
      parseError,
      db_warning
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch (e) {
    const origin = req.headers.get('origin') || req.headers.get('Origin') || undefined;
    const corsHeaders = makeCorsHeaders(origin);
    return new Response(JSON.stringify({
      error: e.message || 'Unexpected error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
});
