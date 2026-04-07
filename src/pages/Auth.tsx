import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { Users, AlertCircle } from 'lucide-react';
import fr from '@/i18n/fr';

const Auth = () => {
  const { user, signIn, signUp, loading } = useAuth();
  const t = fr;
  const [isLoading, setIsLoading] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);
  const [signUpForm, setSignUpForm] = useState({
    email: '',
    password: '',
    confirm: '',
    displayName: ''
  });
  const [signingUp, setSigningUp] = useState(false);

  // Form states
  const [signInForm, setSignInForm] = useState({
    email: '',
    password: ''
  });

  // Redirect if already authenticated
  if (user && !loading) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const { error } = await signIn(signInForm.email, signInForm.password);
      if (!error) {
        // Navigation handled by auth state change
      }
    } catch (error) {
      console.error('Sign in error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">MagCV+</h1>
          <p className="text-muted-foreground mt-2">{t.enhance_resume_with_ai}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t.sign_in}</CardTitle>
            <CardDescription>
              {t.sign_in_desc}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t.enter_email_placeholder}
                  value={signInForm.email}
                  onChange={(e) => setSignInForm(prev => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={t.enter_password_placeholder}
                  value={signInForm.password}
                  onChange={(e) => setSignInForm(prev => ({ ...prev, password: e.target.value }))}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? t.signing_in : t.sign_in}
              </Button>
            </form>

            <div className="border-t pt-4">
              <div className="text-center">
                <div className="flex flex-col gap-2 items-center">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setShowSignUp(true)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {t.need_account}
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setShowContactInfo(!showContactInfo)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t.access_request_info}
                  </Button>
                </div>
              </div>
              
              {showContactInfo && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium mb-1">{t.admin_access_required}</p>
                      <p className="text-muted-foreground">{t.contact_admin_text}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-6 text-sm text-muted-foreground">
          <p>{t.enhance_resume_with_ai}</p>
        </div>
      </div>
  </div>
  {showSignUp && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-background w-full max-w-md border rounded-lg shadow-lg p-6 relative">
          <button
            onClick={() => setShowSignUp(false)}
            className="absolute top-2 right-2 text-muted-foreground hover:text-foreground text-sm"
          >{t.close}</button>
          <h2 className="text-xl font-semibold mb-1">{t.request_access}</h2>
          <p className="text-sm text-muted-foreground mb-6">{t.request_access_desc}</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (signUpForm.password !== signUpForm.confirm) {
                alert(t.passwords_not_match);
                return;
              }
              setSigningUp(true);
              const { error } = await signUp(signUpForm.email, signUpForm.password, signUpForm.displayName || undefined);
              setSigningUp(false);
              if (!error) {
                // Reset form but keep modal open with success message
                setSignUpForm({ email: '', password: '', confirm: '', displayName: '' });
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="su-email">Email</Label>
              <Input id="su-email" type="email" required value={signUpForm.email} onChange={(e) => setSignUpForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-display">Display Name (optional)</Label>
              <Input id="su-display" type="text" value={signUpForm.displayName} onChange={(e) => setSignUpForm(f => ({ ...f, displayName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-password">Password</Label>
              <Input id="su-password" type="password" required value={signUpForm.password} onChange={(e) => setSignUpForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-confirm">Confirm Password</Label>
              <Input id="su-confirm" type="password" required value={signUpForm.confirm} onChange={(e) => setSignUpForm(f => ({ ...f, confirm: e.target.value }))} />
            </div>
            <Button type="submit" disabled={signingUp} className="w-full">{signingUp ? t.submitting : t.submit_request}</Button>
            <div className="text-xs text-muted-foreground mt-2 leading-relaxed">
              <p>After submitting:</p>
              <ul className="list-disc ml-4">
                <li>{t.after_submit_check_email}</li>
                <li>{t.after_submit_admin_review}</li>
                <li>{t.after_submit_once_approved}</li>
              </ul>
            </div>
          </form>
        </div>
      </div>
    )}
    </>
  );
};

export default Auth;