import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { job_id, json } = await req.json();
    if (!job_id || !json) {
      return new Response(JSON.stringify({ error: 'Missing job_id or json' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Caller auth (for basic gating: must be an approved client or admin)
    const rawAuthHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!rawAuthHeader) {
      return new Response(JSON.stringify({ error: 'Authorization header required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const token = rawAuthHeader.startsWith('Bearer ') ? rawAuthHeader.slice(7) : rawAuthHeader;
    const anonClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });

    // Validate caller is approved (admin or client)
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const callerId = userData.user.id;
    const { data: roleRows } = await anonClient.from('user_roles').select('role').eq('user_id', callerId);
    const isAdmin = Array.isArray(roleRows) && roleRows.some(r => r.role === 'admin');

    // Load the resume job (bypass RLS with service role client to fetch owner id, shared flag and existing json_url)
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: job, error: jobErr } = await serviceClient.from('resume_jobs').select('id, user_id, shared, json_url').eq('id', job_id).single();
    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: 'Resume job not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!job.shared && !isAdmin && callerId !== job.user_id) {
      // Only admins or owners can edit non-shared resumes
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Upload JSON to owner's storage path to satisfy RLS patterns <owner>/<job>/json.json
    const jsonStr = typeof json === 'string' ? json : JSON.stringify(json, null, 2);
    const fileName = `${job_id}.json`;
    const storagePath = `${job.user_id}/${job_id}/json.json`;
    // Upload using service role via Storage API (public bucket)
    // Note: Supabase storage JS client in edge runtime doesn't support service role directly for upload; use public URL to write via service client RPC
    // Simpler: use the service client storage API (supported in v2 SDK)
    // @ts-ignore
    const { error: uploadErr } = await (serviceClient.storage as any).from('resumes').upload(storagePath, new Blob([jsonStr], { type: 'application/json' }), { upsert: true, contentType: 'application/json', cacheControl: '0' });
    if (uploadErr) {
      return new Response(JSON.stringify({ error: uploadErr.message || 'Upload failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: pub } = (serviceClient.storage as any).from('resumes').getPublicUrl(storagePath);
    const newJsonUrl = pub?.publicUrl ? `${pub.publicUrl}?ts=${Date.now()}` : null;
    const { error: updErr } = await serviceClient.from('resume_jobs').update({ json_url: newJsonUrl }).eq('id', job_id);
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message || 'DB update failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, json_url: newJsonUrl }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('update-shared-resume error', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
