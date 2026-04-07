import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AdminDashboard from "./pages/AdminDashboard";
import ClientDashboard from "./pages/ClientDashboard";
import Upload from "./pages/Upload";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const DashboardRouter = () => {
  const { role } = useAuth();
  
  if (role === 'admin') {
    return <AdminDashboard />;
  } else if (role === 'client') {
    return <ClientDashboard />;
  }
  
  return <Navigate to="/auth" replace />;
};

const router = createBrowserRouter([
  { path: '/', element: <Index /> },
  { path: '/auth', element: <Auth /> },
  { path: '/dashboard', element: <ProtectedRoute><DashboardRouter /></ProtectedRoute> },
  { path: '/admin', element: <ProtectedRoute requireAdmin={true}><AdminDashboard /></ProtectedRoute> },
  { path: '/upload', element: <ProtectedRoute><Upload /></ProtectedRoute> },
  { path: '*', element: <NotFound /> },
], ( { future: { v7_startTransition: true } } as any) );

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <RouterProvider router={router} />
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
