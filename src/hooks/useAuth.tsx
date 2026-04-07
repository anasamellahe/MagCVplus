import { useState, useEffect, createContext, useContext } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: string | null;
  isApproved: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: any }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error?: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState(false);

  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Load user role and approval status
        if (session?.user) {
          setTimeout(async () => {
            await loadUserData(session.user);
            // Upsert presence row to mark online (use onConflict and fallback update to avoid 409)
            try {
              const { error } = await supabase.from('user_presence').upsert(
                { user_id: session.user.id, last_seen: new Date().toISOString(), online: true },
                { onConflict: 'user_id' }
              );
              if (error) {
                try { await supabase.from('user_presence').update({ last_seen: new Date().toISOString(), online: true }).eq('user_id', session.user.id); } catch {}
              }
            } catch (e) { console.warn('Presence upsert failed', e); }
          }, 0);
        } else {
          setRole(null);
          setIsApproved(false);
        }
        
        setLoading(false);
      }
    );

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserData(session.user);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Presence heartbeat
  useEffect(() => {
    let heartbeat: number | null = null;
    const onVisibilityChange = async () => {
      if (!session?.user) return;
      try {
        if (document.visibilityState === 'visible') {
          const { error } = await supabase.from('user_presence').upsert(
            { user_id: session.user.id, last_seen: new Date().toISOString(), online: true },
            { onConflict: 'user_id' }
          );
          if (error) { try { await supabase.from('user_presence').update({ last_seen: new Date().toISOString(), online: true }).eq('user_id', session.user.id); } catch {} }
        } else {
          await supabase.from('user_presence').update({ online: false }).eq('user_id', session.user.id);
        }
      } catch (e) { /* ignore */ }
    };
    const onUnload = async () => {
      if (!session?.user) return;
      try { await supabase.from('user_presence').update({ online: false }).eq('user_id', session.user.id); } catch {}
    };
    if (session?.user) {
      heartbeat = window.setInterval(async () => {
        try {
          const { error } = await supabase.from('user_presence').upsert(
            { user_id: session.user!.id, last_seen: new Date().toISOString(), online: true },
            { onConflict: 'user_id' }
          );
          if (error) { try { await supabase.from('user_presence').update({ last_seen: new Date().toISOString(), online: true }).eq('user_id', session.user!.id); } catch {} }
        } catch {}
      }, 30_000);
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('beforeunload', onUnload);
    }
    return () => {
      if (heartbeat) clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [session]);

  const loadUserData = async (user: User) => {
    try {
      // Create profile if it doesn't exist
      await createUserProfile(user);
      
      // Load user role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      
      setRole(roleData?.role || null);
      
      // Load approval status
      const { data: profileData } = await supabase
        .from('profiles')
        .select('approved')
        .eq('user_id', user.id)
        .single();
      
      setIsApproved(profileData?.approved || false);
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const createUserProfile = async (user: User) => {
    try {
      // Check if profile already exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!existingProfile) {
        // Create new profile
        const { error } = await supabase
          .from('profiles')
          .insert({
            user_id: user.id,
            email: user.email,
            display_name: user.user_metadata?.display_name || user.email?.split('@')[0]
          });

        if (error) {
          console.error('Error creating profile:', error);
        }
      }
    } catch (error) {
      console.error('Error in createUserProfile:', error);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        toast({
          title: "Sign In Failed",
          description: error.message,
          variant: "destructive",
        });
        return { error };
      }
      
      toast({
        title: "Welcome back!",
        description: "You have successfully signed in.",
      });
      
      return {};
    } catch (error) {
      console.error('Sign in error:', error);
      return { error };
    }
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            display_name: displayName
          }
        }
      });
      
      if (error) {
        toast({
          title: "Sign Up Failed", 
          description: error.message,
          variant: "destructive",
        });
        return { error };
      }
      
      toast({
        title: "Account Created!",
        description: "Please check your email to verify your account.",
      });
      
      return {};
    } catch (error) {
      console.error('Sign up error:', error);
      return { error };
    }
  };

  const signOut = async () => {
    try {
      // Perform sign out with Supabase
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Sign out error:', error);
        toast({
          title: 'Sign Out Failed',
          description: error.message,
          variant: 'destructive'
        });
        return;
      }

      // Proactively clear local auth state so ProtectedRoute triggers redirect
      setSession(null);
      setUser(null);
      setRole(null);
      setIsApproved(false);

      toast({
        title: 'Signed Out',
        description: 'You have been successfully signed out.'
      });
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const value = {
    user,
    session,
    loading,
    role,
    isApproved,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};