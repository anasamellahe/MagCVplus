import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Body = { id: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const { id } = await req.json() as Body
    if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const rawAuthHeader = req.headers.get('Authorization') || req.headers.get('authorization')
    if (!rawAuthHeader) return new Response(JSON.stringify({ error: 'Authorization header required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const token = rawAuthHeader.startsWith('Bearer ') ? rawAuthHeader.slice(7) : rawAuthHeader
    const anonClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: caller, error: callerErr } = await anonClient.auth.getUser(token)
    if (callerErr || !caller?.user) return new Response(JSON.stringify({ error: 'Invalid authentication' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data: roleData } = await anonClient.from('user_roles').select('role').eq('user_id', caller.user.id).single()
    if (roleData?.role !== 'admin') return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // Fetch the resume row so we can remove any storage objects it references
    const { data: row, error: rowErr } = await serviceClient
      .from('resume_jobs')
      .select('json_url, image_url, pdf_url, docx_url, text_url, source_file_url')
      .eq('id', id)
      .single()
    if (rowErr) return new Response(JSON.stringify({ error: rowErr.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const urlFields = ['json_url', 'image_url', 'pdf_url', 'docx_url', 'text_url', 'source_file_url']
    const removedPaths: string[] = []
    for (const field of urlFields) {
      const val = (row as any)[field]
      if (!val) continue
      const parts = (val || '').split('/resumes/')
      const maybePath = parts.length > 1 ? parts[1] : null
      if (!maybePath) continue
      try {
        const { error: remErr } = await serviceClient.storage.from('resumes').remove([maybePath])
        if (remErr) {
          // Don't fail the whole operation if a single storage removal fails; log and continue
          console.warn('Failed to remove storage path', maybePath, remErr.message)
        } else {
          removedPaths.push(maybePath)
        }
      } catch (e) {
        console.warn('Error removing storage path', maybePath, e)
      }
    }

    // Delete resume row using service role so RLS won't block it
    const { error: delErr } = await serviceClient.from('resume_jobs').delete().eq('id', id)
    if (delErr) return new Response(JSON.stringify({ error: delErr.message, removed: removedPaths }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    return new Response(JSON.stringify({ success: true, removed: removedPaths }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('delete-resume error', e)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
