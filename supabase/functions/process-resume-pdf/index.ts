// @ts-nocheck
// Edge Function: process-resume-pdf
// Downloads file from Supabase storage (service role) or fetches public URL,
// uploads to OpenAI Files (purpose=assistants), calls Responses API (gpt-4o-mini) with file_search,
// parses strict JSON, and persists resume_json into resume_jobs.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
// Accept multiple environment variable names to match your config
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SUPABASE_DB_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || Deno.env.get('OPEN_AI_API_KEY');
const OPENAI_BASE = 'https://api.openai.com/v1';
const SYSTEM_PROMPT = `Vous êtes un expert en analyse et structuration de CV avec une expertise approfondie en extraction de données. Votre mission est de transformer le CV fourni en un objet JSON parfaitement structuré.

ANALYSEZ MINUTIEUSEMENT le CV joint et extrayez TOUTES les informations disponibles pour remplir le schéma JSON ci-dessous. Votre réponse doit être EXCLUSIVEMENT un objet JSON valide, sans texte d'introduction, sans balises Markdown, sans commentaires.

Règles d'extraction critiques:
1. EXHAUSTIVITÉ: N'omettez aucune information présente dans le CV
2. INTELLIGENCE CONTEXTUELLE: Si une information peut correspondre à plusieurs champs, choisissez le plus pertinent selon le contexte professionnel
3. DÉDUCTION LOGIQUE: Calculez les durées d'expérience, déduisez les secteurs d'activité, inférez les niveaux de compétence
4. STANDARDISATION: Uniformisez les formats de dates, normalisez les intitulés de poste similaires
5. PRÉCISION: Respectez exactement la structure JSON fournie, toutes les clés en français

Techniques d'extraction avancées:

Schéma JSON à remplir:
{
  "personal_info": {
    "nom": "",
    "prenom": "",
    "date_naissance": "",
    "lieu_naissance": "",
    "nationalite": "",
    "situation_familiale": "",
    "profession_title": "",
    "motto": "",
    "objectif": "",
    "contact": {
      "telephone": "",
      "gsm": "",
      "email": "",
      "adresse": "",
      "ville": "",
      "pays": "",
      "linkedin": "",
      "website": "",
      "permis_conduire": ""
    }
  },
  "profil": {
    "resume": ""
  },
  "competences": {
    "domaines_competences": [],
    "competences_techniques": [],
    "competences_humaines": [],
    "soft_skills": [],
    "certifications": [],
    "qualifications_autres": []
  },
  "formation": [
    {
      "periode": "",
      "diplome": "",
      "specialite": "",
      "etablissement": "",
      "lieu": "",
      "mention": "",
      "details": ""
    }
  ],
  "formations_complementaires": [
    {
      "annee": "",
      "theme": "",
      "duree": "",
      "etablissement": "",
      "lieu": "",
      "type": ""
    }
  ],
  "experience_professionnelle": [
    {
      "periode_debut": "",
      "periode_fin": "",
      "duree": "",
      "entreprise": "",
      "lieu": "",
      "fonction": "",
      "poste": "",
      "secteur": "",
      "description": [],
      "missions_principales": [],
      "realisations": [],
      "encadrement": ""
    }
  ],
  "domaines_experience": [
    {
      "titre": "",
      "missions": []
    }
  ]
  "experience_formation": [
    {
      "periode": "",
      "theme": "",
      "etablissement": "",
      "lieu": "",
      "secteur": "",
      "description": []
    }
  ],
  "entreprises_formees": [
    {
      "entreprise": "",
      "themes": [],
      "annee": "",
      "lieu": "",
      "secteur": "",
      "details": ""
    }
  ],
  "missions_pertinentes": [
    {
      "entreprise": "",
      "fonction": "",
      "periode": "",
      "lieu": "",
      "description": [],
      "resultats": []
    }
  ],
  "langues": [
    {
      "langue": "",
      "niveau_lu": "",
      "niveau_parle": "",
      "niveau_ecrit": "",
      "niveau_general": "",
      "certification": ""
    }
  ],
  "informatique": {
    "logiciels": [],
    "technologies": [],
    "systemes": [],
    "applications_metier": [],
    "niveau_general": ""
  },
  "references": [
    {
      "nom_prenom": "",
      "fonction": "",
      "entreprise": "",
      "telephone": "",
      "email": "",
      "relation": ""
    }
  ],
  "realisations_principales": [],
  "travaux_recherche": [
    {
      "annee": "",
      "titre": "",
      "type": "",
      "etablissement": "",
      "statut": ""
    }
  ],
  "activites_para_professionnelles": {
    "associations": [],
    "travail_associatif": [],
    "networking": [],
    "engagements": []
  },
  "centres_interet": [],
  "distinctions_prix": [],
  "autres_informations": {
    "visa_status": "",
    "passport_info": "",
    "physical_info": "",
    "disponibilite": "",
    "mobilite": "",
    "notes_supplementaires": []
  }
}

Consignes de qualité:

IMPORTANT: En plus du schéma JSON ci-dessus, le modèle DOIT inclure une clé top-level nommée "rapport".
Le champ "rapport" doit contenir une synthèse et des recommandations dérivées du CV. Exemple de structure attendue pour "rapport" :
"rapport": {
  "resume": "Résumé synthétique en français",
  "forces": ["liste des forces / points forts en français"],
  "lacunes": ["liste des lacunes / manques pertinents"],
  "roles_recommandes": [
     { "titre": "Titre recommandé", "seniorite": "Niveau (ex: Senior)", "score_de_compatibilite": 0, "pourquoi": "raison brève" }
  ]
}

Consigne additionnelle: REMPLISSEZ le champ "rapport" avec les observations extraites, recommandations et une synthèse. Ne créez AUCUNE autre clé top-level nouvelle que "rapport".

SORTIE ATTENDUE: JSON brut uniquement, prêt à être parsé par un système automatisé.`;
// Embedding helper: create embedding for text using OpenAI embeddings API
async function createEmbedding(apiKey, text) {
  try {
    const resp = await fetch(`${OPENAI_BASE}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text
      })
    });
    if (!resp.ok) {
      const raw = await resp.text().catch(()=>'');
      throw new Error(`OpenAI embeddings error ${resp.status} ${raw}`);
    }
    const j = await resp.json();
    const emb = j?.data?.[0]?.embedding ?? null;
    if (!emb) throw new Error('No embedding returned');
    return emb;
  } catch (e) {
    console.error('createEmbedding error', e);
    throw e;
  }
}
// Minimal text serialization of the structured resume JSON for embedding
function resumeToTextForEmbedding(resume) {
  if (!resume || typeof resume !== 'object') return '';
  const parts = [];
  try {
    // Prefer new French consultant schema keys but fall back to older keys for compatibility
    const p = resume.personal_info || resume.informations_personnelles || resume.personal_information || {};
    const name = p.prenom && p.nom ? `${p.prenom} ${p.nom}` : p.nom_complet || p.full_name || `${p.nom || ''} ${p.prenom || ''}`.trim();
    const title = p.profession_title || p.poste || p.job_title || null;
    if (name) parts.push(name);
    if (title) parts.push(title);
  const summary = resume.profil?.resume || resume.profil?.summary || resume.resume || resume.summary || null;
    if (summary) parts.push(summary);
    // Competencies
    const domaines = resume.competences?.domaines_competences || resume.competences || resume.skills || [];
    const tech = resume.competences?.competences_techniques || resume.informatique?.technologies || [];
    const soft = resume.competences?.competences_humaines || resume.competences?.soft_skills || [];
    if (Array.isArray(domaines) && domaines.length) parts.push('Domaines: ' + domaines.slice(0, 40).join(', '));
    if (Array.isArray(tech) && tech.length) parts.push('Techniques: ' + tech.slice(0, 40).join(', '));
    if (Array.isArray(soft) && soft.length) parts.push('Soft: ' + soft.slice(0, 40).join(', '));
    const experiences = resume.experience_professionnelle || resume.experiences_professionnelles || resume.professional_experience || [];
    if (Array.isArray(experiences)) {
      for (const e of experiences.slice(0, 5)){
        const jobTitle = e.poste || e.fonction || e.intitule_poste || e.job_title || '';
        const company = e.entreprise || e.company || '';
        const missions = (e.missions_principales || e.missions || e.responsabilites || []).slice(0, 3).join('; ');
        const results = (e.realisations || e.resultats || e.results || []).slice(0, 3).join('; ');
        parts.push([
          jobTitle,
          company,
          missions,
          results
        ].filter(Boolean).join(' - '));
      }
    }
    const educ = resume.formation || resume.formations || resume.education || [];
    if (Array.isArray(educ)) parts.push((educ || []).map((e)=>`${e.diplome || e.degree || ''} ${e.etablissement || e.ecole || e.school || ''}`).join('; '));
  } catch (e) {
  // ignore
  }
  return parts.filter(Boolean).join('\n').slice(0, 1900);
}
async function uploadJSONToStorage(adminClient, userId, jobId, data) {
  // Store JSON under a path owned by the user to satisfy Storage RLS (first segment = auth.uid())
  const path = `${userId}/${jobId}/json.json`;
  const body = new Blob([
    JSON.stringify(data, null, 2)
  ], {
    type: 'application/json'
  });
  const { error: uploadErr } = await adminClient.storage.from('resumes').upload(path, body, {
    contentType: 'application/json',
    upsert: true,
    cacheControl: '0'
  });
  if (uploadErr) throw uploadErr;
  const { data: pub } = adminClient.storage.from('resumes').getPublicUrl(path);
  // Append ts to avoid stale CDN cache on immediate reads
  const publicUrl = pub?.publicUrl ? `${pub.publicUrl}?ts=${Date.now()}` : null;
  return publicUrl || null;
}
async function uploadToOpenAI(fileBytes, filename = 'resume.pdf', mime = 'application/pdf') {
  const form = new FormData();
  form.append('purpose', 'assistants');
  let filePart;
  try {
    filePart = new File([
      fileBytes
    ], filename, {
      type: mime
    });
  } catch  {
    filePart = new Blob([
      fileBytes
    ], {
      type: mime
    });
  }
  form.append('file', filePart, filename);
  const resp = await fetch(`${OPENAI_BASE}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: form
  });
  const raw = await resp.text().catch(()=>'');
  if (!resp.ok) {
    console.error('OpenAI /files error', resp.status, raw.slice(0, 2000));
    throw new Error(`OpenAI file upload failed: ${resp.status} ${raw}`);
  }
  try {
    return JSON.parse(raw).id;
  } catch  {
    throw new Error('OpenAI file upload returned non-JSON response');
  }
}
async function callOpenAIWithFile(fileId, prompt) {
  const instruction = [
    SYSTEM_PROMPT,
    prompt ? `User intent: ${prompt}` : '',
    'Return ONLY the JSON object.'
  ].filter(Boolean).join('\n\n');
  // Use input_file in content (no attachments, no vector stores, no tools)
  const payload = {
    model: 'gpt-4o-mini',
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: instruction
          },
          {
            type: 'input_file',
            file_id: fileId
          }
        ]
      }
    ],
    max_output_tokens: 4096,
    temperature: 0.0 // Lower temperature for more consistent JSON
  };
  const parsed = await callOpenAI(payload);
  return parsed;
}
async function callOpenAI(payload) {
  const resp = await fetch(`${OPENAI_BASE}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const raw = await resp.text().catch(()=>'');
  if (!resp.ok) {
    console.error('OpenAI /responses error', resp.status, raw.slice(0, 2000));
    throw new Error(`OpenAI responses failed: ${resp.status} ${raw}`);
  }
  let j = null;
  try {
    j = raw ? JSON.parse(raw) : null;
  } catch (e) {}
  const text = extractTextFromOpenAIResponse(j ?? raw);
  if (!text) {
    console.error('No text extracted from OpenAI response', raw.slice(0, 2000));
    throw new Error('No text in model response');
  }
  const clean = stripFences(String(text)).trim();
  const first = clean.indexOf('{');
  const last = clean.lastIndexOf('}');
  const jsonStr = first >= 0 && last >= first ? clean.slice(first, last + 1) : clean;
  try {
    console.log(jsonStr);
    return JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Model did not return valid JSON: ${String(err)} :: ${jsonStr.slice(0, 1000)}`);
  }
}
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: corsHeaders
  });
  if (req.method !== 'POST') return new Response('Method Not Allowed', {
    status: 405,
    headers: corsHeaders
  });
  try {
    let body = null;
    try {
      body = await req.json();
    } catch  {
      body = null;
    }
    const missing = [];
    if (!OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
    if (!SUPABASE_URL) missing.push('SUPABASE_URL or SUPABASE_DB_URL');
    if (!SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
    if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (missing.length) {
      const msg = `Missing environment variables: ${missing.join(', ')}`;
      console.error(msg);
      return jsonResponse({
        error: msg
      }, 500);
    }
    // From here on, require auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response('Unauthorized', {
      status: 401,
      headers: corsHeaders
    });
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { job_id, object_path, file_url, prompt } = body || {};
    // Normal path: require job_id and source (object_path or file_url)
    // Normal path: require job_id and source (object_path or file_url)
    if (!job_id) return jsonResponse({
      error: 'job_id required'
    }, 400);
    if (!object_path && !file_url) return jsonResponse({
      error: 'object_path or file_url required'
    }, 400);
    const { data: job, error: jobErr } = await userClient.from('resume_jobs').select('id,user_id').eq('id', job_id).single();
    if (jobErr || !job) return jsonResponse({
      error: 'Job not found or unauthorized'
    }, 404);
    let bytes;
    let filename = 'resume.pdf';
    let mime = 'application/pdf';
    if (object_path) {
      const { data: file, error: dlErr } = await adminClient.storage.from('resumes').download(object_path);
      if (dlErr) return jsonResponse({
        error: `download failed: ${dlErr.message || dlErr}`
      }, 400);
      const buf = await file.arrayBuffer();
      bytes = new Uint8Array(buf);
      const lower = object_path.toLowerCase();
      if (lower.endsWith('.docx')) {
        filename = 'resume.docx';
        mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      } else if (lower.endsWith('.txt')) {
        filename = 'resume.txt';
        mime = 'text/plain';
      }
    } else {
      const resp = await fetch(file_url);
      if (!resp.ok) return jsonResponse({
        error: `fetch file_url failed: ${resp.status}`
      }, 400);
      const buf = await resp.arrayBuffer();
      bytes = new Uint8Array(buf);
      const ct = (resp.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('docx')) {
        filename = 'resume.docx';
        mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      } else if (ct.includes('text/plain') || ct.includes('txt')) {
        filename = 'resume.txt';
        mime = 'text/plain';
      }
    }
    const MAX_BYTES = 15 * 1024 * 1024;
    if (bytes.byteLength > MAX_BYTES) return jsonResponse({
      error: 'File too large'
    }, 400);
    let fileId;
    try {
      fileId = await uploadToOpenAI(bytes, filename, mime);
    } catch (e) {
      console.error('OpenAI file upload error:', e?.message || e);
      return jsonResponse({
        error: `OpenAI file upload failed: ${e?.message || String(e)}`
      }, 502);
    }
    let parsed;
    try {
      parsed = await callOpenAIWithFile(fileId, prompt);
    } catch (e) {
      console.error('OpenAI responses error:', e?.message || e);
      return jsonResponse({
        error: `OpenAI responses failed: ${e?.message || String(e)}`
      }, 502);
    }
    // Accept either French-keyed or English-keyed parsed JSON (backwards-compatible)
    // and accept the new consultant-focused schema keys (personal_info, profil, competences, experience_professionnelle, formation, informatique, langues, references)
    const hasFrenchTop = parsed && typeof parsed === 'object' && (parsed.informations_personnelles || // older FR name
    parsed.personal_info || // new schema (EN-ish key used by the new prompt)
    parsed.personnal_info || // common misspelling/variant
    parsed.profil || parsed.resume || parsed.competences || parsed.experience_professionnelle || parsed.formation || parsed.informatique || parsed.langues || parsed.references);
    const hasEnglishTop = parsed && typeof parsed === 'object' && (parsed.personal_information || // older EN name
    parsed.personal_info || // new schema key
    parsed.profile || parsed.summary || parsed.skills || parsed.experience || parsed.education || parsed.languages || parsed.references);
    if (!hasFrenchTop && !hasEnglishTop) {
      console.error('Invalid parsed JSON shape', JSON.stringify(parsed).slice(0, 2000));
      return jsonResponse({
        error: 'Réponse JSON invalide du modèle / Model returned invalid JSON'
      }, 400);
    }
    // Before storing results, verify the job still exists and is in 'processing' state.
    // This allows clients to cancel (delete or update the job) and ensures the edge
    // function will not persist results for cancelled jobs.
    try {
      const { data: latestJob, error: latestErr } = await adminClient.from('resume_jobs').select('id,status').eq('id', job_id).single();
      if (latestErr || !latestJob) {
        console.warn('Job no longer exists (likely cancelled), aborting persistence');
        return jsonResponse({
          cancelled: true,
          message: 'Job cancelled or removed'
        }, 200);
      }
      if (latestJob.status !== 'processing') {
        console.warn('Job status is not processing, aborting persistence', latestJob.status);
        return jsonResponse({
          cancelled: true,
          message: 'Job no longer processing'
        }, 200);
      }
    } catch (e) {
      console.warn('Failed to verify job status before persisting; proceeding cautiously', e);
    // fallthrough - attempt to persist
    }
    // Store parsed JSON in Storage and reference it in DB
    // Important: do NOT add or modify any top-level keys except adding `rapport` if missing.
    let jsonUrl = null;
    let finalParsed = parsed;
    try {
      try {
        // Clone original parse output to avoid mutating the model's original object
        const original = (parsed && typeof parsed === 'object') ? JSON.parse(JSON.stringify(parsed)) : parsed;

        // Compute rapport from existing fields but do not modify original beyond adding rapport key
        const existingRapport = (original && typeof original === 'object') ? (original.rapport ?? null) : null;
        let rapportToAttach = existingRapport;
        if (!rapportToAttach && original && typeof original === 'object' && original.report) {
          const r = original.report || {};
          rapportToAttach = {
            resume: r.summary || r.resume || '',
            forces: Array.isArray(r.strengths) ? r.strengths : Array.isArray(r.forces) ? r.forces : [],
            lacunes: Array.isArray(r.gaps) ? r.gaps : Array.isArray(r.lacunes) ? r.lacunes : [],
            roles_recommandes: Array.isArray(r.recommended_roles) ? r.recommended_roles : (Array.isArray(r.roles_recommandes) ? r.roles_recommandes : [])
          };
          // Map nested role fields to predictable keys without modifying other original keys
          rapportToAttach = rapportToAttach && rapportToAttach.roles_recommandes ? rapportToAttach : (rapportToAttach || { resume: '', forces: [], lacunes: [], roles_recommandes: [] });
        }

        // Ensure rapport exists (default empty) but attach only this new key to the cloned object
        finalParsed = (original && typeof original === 'object') ? JSON.parse(JSON.stringify(original)) : original;
        if (finalParsed && typeof finalParsed === 'object') {
          if (!finalParsed.rapport) {
            finalParsed.rapport = rapportToAttach || { resume: '', forces: [], lacunes: [], roles_recommandes: [] };
          }
        }
      } catch (normErr) {
        console.warn('Normalization of report failed', normErr);
        // fallback: keep parsed as-is but ensure rapport exists
        finalParsed = (parsed && typeof parsed === 'object') ? JSON.parse(JSON.stringify(parsed)) : parsed;
        if (finalParsed && typeof finalParsed === 'object' && !finalParsed.rapport) finalParsed.rapport = { resume: '', forces: [], lacunes: [], roles_recommandes: [] };
      }

      jsonUrl = await uploadJSONToStorage(adminClient, job.user_id, job_id, finalParsed);
    } catch (e) {
      console.error('Upload JSON to storage failed:', e);
    }
    // Generate embedding for the parsed resume JSON and persist to resume_embeddings table (best-effort)
    try {
      if (OPENAI_API_KEY) {
        try {
          const textForEmbedding = resumeToTextForEmbedding(parsed) || JSON.stringify(parsed).slice(0, 1900);
          const emb = await createEmbedding(OPENAI_API_KEY, textForEmbedding);
          // upsert into resume_embeddings on job_id
          try {
            // update resume_jobs row with resume_embedding
            await adminClient.from('resume_jobs').update({
              resume_embedding: emb
            }).eq('id', job_id);
          } catch (dbErr) {
            console.warn('Failed to persist resume embedding on resume_jobs', dbErr?.message || dbErr);
          }
        } catch (embErr) {
          console.warn('Embedding generation failed for resume', embErr?.message || embErr);
        }
      }
    } catch (e) {
      console.warn('Unexpected error while generating/storing embedding', e?.message || e);
    }
    // Extract top-level job title and owner name from parsed JSON and persist for search/indexing
  const jobTitle = finalParsed?.informations_personnelles?.poste || finalParsed?.personal_information?.job_title || finalParsed?.resume || finalParsed?.summary || null;
  const ownerName = finalParsed?.informations_personnelles?.nom_complet || finalParsed?.personal_information?.full_name || null;
    // Try to read the enhancer display name from the profiles table (admin client) so we persist who initiated the enhancement
    let enhancerDisplayName = null;
    try {
      const { data: prof } = await adminClient.from('profiles').select('display_name').eq('user_id', job.user_id).single();
      enhancerDisplayName = prof?.display_name || null;
    } catch (e) {
    // ignore - enhancerDisplayName stays null
    }
    const { error: upErr } = await adminClient.from('resume_jobs').update({
      json_url: jsonUrl,
      status: 'completed',
      job_title: jobTitle,
      owner_display_name: ownerName,
      // Only set enhancer_display_name if we found one; avoid overwriting an explicit value
      ...enhancerDisplayName ? {
        enhancer_display_name: enhancerDisplayName
      } : {}
    }).eq('id', job_id);
    if (upErr) {
      console.error('DB update error:', upErr);
      return jsonResponse({
        error: upErr.message || String(upErr)
      }, 500);
    }
    return jsonResponse({
      resume_json: finalParsed,
      json_url: jsonUrl
    }, 200);
  } catch (e) {
    console.error('process-resume-pdf unhandled error:', e);
    return jsonResponse({
      error: e?.message || 'Unexpected error',
      stack: e?.stack?.split('\n').slice(0, 5).join('\n')
    }, 500);
  }
});
function stripFences(s) {
  return String(s).replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
}
function extractTextFromOpenAIResponse(j) {
  try {
    if (!j) return null;
    if (typeof j === 'string') return j;
    // Preferred fields
    if (typeof j.output_text === 'string') return j.output_text;
    // Flatten all possible text leaves, but choose wisely
    const candidates = [];
    const stack = [
      j.output ?? j.result ?? j
    ];
    while(stack.length){
      const node = stack.pop();
      if (!node) continue;
      if (typeof node === 'string') {
        const s = String(node).trim();
        // ignore common role strings
        if (s && s !== 'assistant' && s !== 'user' && s !== 'system') candidates.push(s);
        continue;
      }
      if (Array.isArray(node)) {
        for (const x of node)stack.push(x);
        continue;
      }
      if (typeof node === 'object') {
        if (typeof node.text === 'string') candidates.push(String(node.text));
        if (typeof node.content === 'string') candidates.push(String(node.content));
        if (Array.isArray(node.output)) stack.push(...node.output);
        if (Array.isArray(node.messages)) stack.push(...node.messages);
        for (const key of Object.keys(node))stack.push(node[key]);
      }
    }
    // Prefer JSON-looking strings
    const jsonLike = candidates.filter((s)=>s.includes('{') && s.includes('}'));
    if (jsonLike.length) {
      // pick the longest json-like candidate
      jsonLike.sort((a, b)=>b.length - a.length);
      return jsonLike[0];
    }
    // Fallback to the longest candidate
    if (candidates.length) {
      candidates.sort((a, b)=>b.length - a.length);
      return candidates[0];
    }
  } catch (e) {
    console.error('extractTextFromOpenAIResponse error', e);
  }
  return null;
}
function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}
