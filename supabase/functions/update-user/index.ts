import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Body = {
  user_id: string;
  email?: string;
  password?: string;
}
// Extend accepted body to include role and display_name
type BodyExtended = Body & { role?: string; display_name?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const { user_id, email, password, role, display_name } = await req.json() as BodyExtended
    if (!user_id || (!email && !password && !role && !display_name)) {
      return new Response(JSON.stringify({ error: 'user_id and at least one of email, password, role, or display_name required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const rawAuthHeader = req.headers.get('Authorization') || req.headers.get('authorization')
    if (!rawAuthHeader) {
      return new Response(JSON.stringify({ error: 'Authorization header required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const token = rawAuthHeader.startsWith('Bearer ') ? rawAuthHeader.slice(7) : rawAuthHeader

    const anonClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: caller, error: callerErr } = await anonClient.auth.getUser(token)
    if (callerErr || !caller?.user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const { data: roleData } = await anonClient.from('user_roles').select('role').eq('user_id', caller.user.id).single()
    if (roleData?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

    if (email) {
      const { error: emailErr } = await serviceClient.auth.admin.updateUserById(user_id, { email })
      if (emailErr) {
        return new Response(JSON.stringify({ error: emailErr.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }
    if (password) {
      const { error: passErr } = await serviceClient.auth.admin.updateUserById(user_id, { password })
      if (passErr) {
        return new Response(JSON.stringify({ error: passErr.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

      // Update display name in profiles table when provided
      if (typeof display_name === 'string') {
        const { error: nameErr } = await serviceClient.from('profiles').update({ display_name }).eq('user_id', user_id)
        if (nameErr) {
          return new Response(JSON.stringify({ error: nameErr.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
      }

      // Upsert role into user_roles when provided (service role bypasses RLS)
      if (typeof role === 'string') {
        // Avoid using ON CONFLICT if the DB doesn't have a unique constraint; do select -> update/insert
        const { data: existing, error: selErr } = await serviceClient.from('user_roles').select('user_id').eq('user_id', user_id).maybeSingle();
        if (selErr) {
          return new Response(JSON.stringify({ error: selErr.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
        if (existing) {
          const { error: updErr } = await serviceClient.from('user_roles').update({ role }).eq('user_id', user_id);
          if (updErr) {
            return new Response(JSON.stringify({ error: updErr.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
          }
        } else {
          const { error: insErr } = await serviceClient.from('user_roles').insert({ user_id, role });
          if (insErr) {
            return new Response(JSON.stringify({ error: insErr.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
          }
        }
      }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('update-user error', e)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
