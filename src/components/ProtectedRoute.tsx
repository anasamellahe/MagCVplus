import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export const ProtectedRoute = ({ children, requireAdmin = false }: ProtectedRouteProps) => {
  const { user, loading, role, isApproved } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Check if user has a role assigned
  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <h2 className="text-xl font-semibold mb-2">Compte en attente d'approbation</h2>
          <p className="text-muted-foreground mb-4">
            Votre compte est en attente d'approbation par un administrateur.
            Vous recevrez l'accès une fois que votre compte aura été examiné et approuvé.
          </p>
          <button 
            onClick={() => window.location.href = '/auth'}
            className="text-primary hover:underline"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  // Check admin requirement
  if (requireAdmin && role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  // Check if client is approved (admins are auto-approved)
  if (role === 'client' && !isApproved) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <h2 className="text-xl font-semibold mb-2">Compte en attente d'approbation</h2>
          <p className="text-muted-foreground mb-4">
            Votre compte est en attente d'approbation par un administrateur.
            Vous recevrez l'accès une fois que votre compte aura été examiné et approuvé.
          </p>
          <button 
            onClick={() => window.location.href = '/auth'}
            className="text-primary hover:underline"
          >
            Retour à la connexion
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};