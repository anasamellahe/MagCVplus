import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Enforce POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get request body
    const { email, password, role, display_name } = await req.json();
    
    // Validate input
    if (!email || !password || !role) {
      console.log('VALIDATION_FAIL missing field', { emailPresent: !!email, passwordPresent: !!password, rolePresent: !!role });
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, password, role', code: 'MISSING_FIELDS' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!['admin', 'client'].includes(role)) {
      console.log('VALIDATION_FAIL invalid role', role);
      return new Response(
        JSON.stringify({ error: 'Invalid role. Must be admin or client', code: 'INVALID_ROLE' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Verify the calling user is an admin
    const rawAuthHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!rawAuthHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const token = rawAuthHeader.startsWith('Bearer ') ? rawAuthHeader.slice(7) : rawAuthHeader;

    // Check caller's role using anon key client, forwarding the bearer token for RLS
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });

    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData?.user) {
      console.log('Auth getUser failed', userError);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check if caller is admin
    const { data: roleData, error: roleError } = await anonClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .single();

    if (roleError || roleData?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Admin ${userData.user.email} creating new ${role} user: ${email}`);

    // Create the user using service role
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: display_name || email.split('@')[0]
      }
    });

    if (createError) {
      console.error('CREATE_USER_FAIL', createError);
      return new Response(
        JSON.stringify({ error: createError.message, code: 'CREATE_USER_FAIL' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!newUser.user) {
      console.error('CREATE_USER_NO_USER_OBJ');
      return new Response(
        JSON.stringify({ error: 'Failed to create user', code: 'NO_USER_OBJ' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`User created successfully: ${newUser.user.id}`);

    // Create profile row (if not already created via trigger)
    const profilePayload = {
      user_id: newUser.user.id,
      email: email,
      display_name: display_name || email.split('@')[0],
      approved: role === 'admin',
      approved_by: role === 'admin' ? userData.user.id : null,
      approved_at: role === 'admin' ? new Date().toISOString() : null
    };
    const { error: profileError } = await supabase.from('profiles').insert(profilePayload);
    if (profileError) {
      console.error('Error inserting profile:', profileError);
      // Continue; profile could already exist or be created client side later.
    }

    // Only assign role immediately for admin accounts; clients get role upon approval
    if (role === 'admin') {
      const { error: roleInsertError } = await supabase
        .from('user_roles')
        .upsert({ user_id: newUser.user.id, role }, { onConflict: 'user_id,role' });
      if (roleInsertError) console.error('ROLE_UPSERT_FAIL', roleInsertError);
    }

    console.log(`${role} user setup completed for: ${email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${role} user created successfully`,
        user_id: newUser.user.id,
        profile_created: !profileError,
  auto_approved: role === 'admin'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('UNEXPECTED_ERROR create-user', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', code: 'UNEXPECTED' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});