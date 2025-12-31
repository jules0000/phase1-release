import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  // Safely get auth state with error handling
  let authState = { isAuthenticated: false, isLoading: true };
  try {
    authState = useAuth();
  } catch (error) {
    // AuthProvider not ready yet, show loading
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const { isAuthenticated, isLoading } = authState;

  if (isLoading) {
    // Show loading spinner while checking authentication
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to landing page if not authenticated
    return <Navigate to="/" replace />;
  }

  // Render protected content if authenticated
  return <>{children}</>;
}


export function AdminRoute({ children }: ProtectedRouteProps) {
  // Safely get auth state with error handling
  let authState = { isAuthenticated: false, isLoading: true, user: null };
  try {
    authState = useAuth();
  } catch (error) {
    // AuthProvider not ready yet, show loading
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  const { isAuthenticated, isLoading, user } = authState;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Strict boolean check: user must exist and is_admin must be exactly true
  if (!user || user.is_admin !== true) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

