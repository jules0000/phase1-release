/*
 * BACKEND REQUIREMENTS - AuthContext.tsx (Authentication Context):
 * 
 * This context manages user authentication state and provides authentication methods
 * throughout the application. It requires real-time backend integration.
 * 
 * Backend Endpoints Required:
 * - POST /api/auth/login - User authentication with email/password
 * - POST /api/auth/register - User registration with validation
 * - GET /api/auth/me - Current user profile verification
 * - POST /api/auth/refresh - JWT token refresh mechanism
 * - POST /api/auth/logout - Session termination and token invalidation
 * 
 * Database Tables Needed:
 * - users: id, email, password_hash, full_name, username, level, total_xp, 
 *          current_streak_days, is_admin, admin_type, created_at, updated_at
 * - user_sessions: user_id, token_hash, expires_at, created_at
 * - user_activity_log: user_id, action, ip_address, user_agent, timestamp
 * 
 * Real-time Features:
 * - Automatic token refresh before expiration
 * - Session validation on app load
 * - Real-time user status updates
 * - Multi-device session management
 * - Security event logging and monitoring
 * 
 * Security Requirements:
 * - JWT token storage in localStorage with automatic cleanup
 * - Token expiration handling and refresh
 * - Secure password hashing (bcrypt)
 * - Rate limiting on authentication endpoints
 * - Input validation and sanitization
 * - CORS configuration for cross-origin requests
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import apiService from '@/lib/api';
import { setSentryUser } from '@/lib/sentry';

interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  level: number;
  total_xp: number;
  current_streak_days: number;
  avatar_url?: string;
  is_admin?: boolean;
  admin_type?: string;
  subscription?: {
    plan_type: 'free_trial' | 'habitual';
    subscription_status: 'active' | 'expired' | 'cancelled' | 'trial';
    is_trial_active: boolean;
    is_subscription_active: boolean;
    days_remaining: number;
  };
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (user: User) => void;
  refreshToken: () => Promise<boolean>;
  isLoading: boolean;
  isAuthenticated: boolean;
}

// Create context with a default value to prevent "must be used within provider" errors
const defaultAuthContext: AuthContextType = {
  user: null,
  token: null,
  login: async () => { throw new Error('AuthProvider not initialized'); },
  logout: () => { },
  updateUser: () => { },
  refreshToken: async () => false,
  isLoading: true,
  isAuthenticated: false
};

const AuthContext = createContext<AuthContextType>(defaultAuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    console.log('AuthContext: useEffect triggered - checking for existing tokens');

    // Check for existing token on app load
    const existingToken = localStorage.getItem('token');
    const existingRefreshToken = localStorage.getItem('refreshToken');
    const existingUser = localStorage.getItem('user');

    console.log('AuthContext: Checking existing tokens', {
      hasToken: !!existingToken,
      hasRefreshToken: !!existingRefreshToken,
      hasUser: !!existingUser,
      tokenLength: existingToken?.length || 0,
      refreshTokenLength: existingRefreshToken?.length || 0
    });

    if (existingToken && existingRefreshToken && existingUser) {
      try {
        const userData = JSON.parse(existingUser);
        console.log('AuthContext: Setting tokens and user from localStorage', {
          userId: userData.id,
          userEmail: userData.email,
          isAdmin: userData.is_admin
        });

        setToken(existingToken);
        setUser(userData);
        apiService.setToken(existingToken, existingRefreshToken);

        // Set Sentry user context for error tracking
        setSentryUser({
          id: userData.id.toString(),
          email: userData.email,
          username: userData.username || userData.full_name
        });

        // Set loading to false immediately - don't block rendering
        setIsLoading(false);

        // Validate token in background (non-blocking)
        console.log('AuthContext: Starting background token validation...');
        apiService.getCurrentUser().then((response) => {
          console.log('AuthContext: Token validation successful', {
            userId: response.id,
            userEmail: response.email,
            isAdmin: response.is_admin
          });
          // Only update user if data actually changed to prevent unnecessary re-renders
          const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
          const userChanged = JSON.stringify(currentUser) !== JSON.stringify(response);
          if (userChanged) {
            setUser(response);
            localStorage.setItem('user', JSON.stringify(response));
          }
        }).catch((error) => {
          console.log('AuthContext: Token validation failed', {
            error: error.message,
            errorType: error.constructor.name
          });
          // Token is invalid, clear it and logout
          console.log('AuthContext: Clearing invalid tokens and user data');
          logout();
        });
      } catch (error) {
        console.log('AuthContext: Error parsing user data', error);
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        setIsLoading(false);
      }
    } else {
      console.log('AuthContext: No existing tokens found - setting loading to false');
      setIsLoading(false);
    }
  }, [navigate]);

  // Refresh user data when window gains focus (e.g., returning from lesson)
  useEffect(() => {
    const handleFocus = async () => {
      // Only refresh if user is authenticated and has a token
      if (user && token) {
        try {
          const updatedUser = await apiService.getCurrentUser();
          setUser(updatedUser);
          localStorage.setItem('user', JSON.stringify(updatedUser));
        } catch (error) {
          console.error('Failed to refresh user data:', error);
          // Silently fail - don't logout user on refresh failure
        }
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, token]);

  const login = async (email: string, password: string) => {
    try {
      console.log('AuthContext: Starting login for', email);
      const data = await apiService.login(email, password);
      console.log('AuthContext: Login response received', {
        hasAccessToken: !!data.access_token,
        hasRefreshToken: !!(data as any).refresh_token,
        hasUser: !!data.user,
        userEmail: data.user?.email,
        userId: data.user?.id,
        isAdmin: data.user?.is_admin,
        accessTokenPreview: data.access_token ? `${data.access_token.substring(0, 20)}...` : 'null',
        refreshTokenPreview: (data as any).refresh_token ? `${(data as any).refresh_token.substring(0, 20)}...` : 'null'
      });

      if (data.access_token && data.user) {
        console.log('AuthContext: Setting tokens and user data');
        setToken(data.access_token);
        setUser(data.user);
        apiService.setToken(data.access_token, (data as any).refresh_token);
        localStorage.setItem('token', data.access_token);
        if ((data as any).refresh_token) {
          localStorage.setItem('refreshToken', (data as any).refresh_token);
        }
        localStorage.setItem('user', JSON.stringify(data.user));

        // Set Sentry user context for error tracking
        setSentryUser({
          id: data.user.id.toString(),
          email: data.user.email,
          username: data.user.username || data.user.full_name
        });

        // Verify token was stored correctly
        const storedToken = localStorage.getItem('token');
        console.log('AuthContext: Token storage verification', {
          originalLength: data.access_token?.length || 0,
          storedLength: storedToken?.length || 0,
          matches: data.access_token === storedToken,
          storedTokenPreview: storedToken ? `${storedToken.substring(0, 20)}...` : 'null'
        });

        console.log('AuthContext: Login successful, navigating...');
        // First-time onboarding gate for learners
        const onboardingKey = `onboarding_${data.user.id}`;
        const completed = localStorage.getItem(onboardingKey) === 'true';
        if (data.user.is_admin === true) {
          // After explicit login, go to /admin only if not already on an admin route
          if (!location.pathname.startsWith('/admin')) {
            console.log('AuthContext: Admin user, navigating to /admin');
            navigate('/admin');
          }
        } else if (!completed) {
          console.log('AuthContext: New user, navigating to /welcome');
          navigate('/welcome');
        } else {
          console.log('AuthContext: Returning user, navigating to /dashboard');
          navigate('/dashboard');
        }

        // Set a small delay to ensure navigation happens before any token validation
        setTimeout(() => {
          console.log('AuthContext: Login process completed');
        }, 100);
      } else {
        console.log('AuthContext: Invalid response from server', data);
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.log('AuthContext: Login error', error);
      const message = (error as any)?.message || '';
      if (message.toLowerCase().includes('maintenance')) {
        window.alert('The platform is currently under maintenance. Please try again later.');
        return;
      }
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = () => {
    console.log('AuthContext: Logout called - clearing all auth data');
    setToken(null);
    setUser(null);
    apiService.clearToken();
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');

    // Clear Sentry user context
    setSentryUser(null);

    navigate('/');
  };

  const updateUser = (u: User) => {
    setUser(u);
    localStorage.setItem('user', JSON.stringify(u));
  };

  // Token refresh state management to prevent concurrent requests
  let refreshPromise: Promise<boolean> | null = null;
  let refreshAttempts = 0;
  const MAX_REFRESH_ATTEMPTS = 3;
  const REFRESH_RETRY_DELAY = 1000; // 1 second base delay

  const refreshToken = async (): Promise<boolean> => {
    // If a refresh is already in progress, return the existing promise
    if (refreshPromise) {
      return refreshPromise;
    }

    // Create new refresh promise
    refreshPromise = (async (): Promise<boolean> => {
      let lastError: any = null;

      // Retry logic with exponential backoff
      for (let attempt = 0; attempt < MAX_REFRESH_ATTEMPTS; attempt++) {
        try {
          const data = await apiService.refreshTokenRequest();
          if (data.access_token) {
            setToken(data.access_token);
            apiService.setToken(data.access_token, data.refresh_token);
            localStorage.setItem('token', data.access_token);
            if (data.refresh_token) {
              localStorage.setItem('refreshToken', data.refresh_token);
            }

            // Reset state on success
            refreshAttempts = 0;
            refreshPromise = null;
            return true;
          }
        } catch (error: any) {
          lastError = error;
          console.error(`Token refresh attempt ${attempt + 1} failed:`, error);

          // Don't retry on 401 (unauthorized) - token is invalid
          if (error?.response?.status === 401) {
            break;
          }

          // Wait before retrying (exponential backoff)
          if (attempt < MAX_REFRESH_ATTEMPTS - 1) {
            const delay = REFRESH_RETRY_DELAY * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // All attempts failed
      refreshAttempts++;
      refreshPromise = null;

      // Only logout if we've exhausted retries AND it's a definitive auth error
      const isAuthError = lastError?.message?.includes('Session expired') || 
                           lastError?.message?.includes('No refresh token') ||
                           lastError?.response?.status === 401;
      
      if (refreshAttempts >= MAX_REFRESH_ATTEMPTS && isAuthError) {
        console.error('Token refresh failed after all retries with auth error');
        logout();
      } else if (refreshAttempts >= MAX_REFRESH_ATTEMPTS) {
        // Network/other errors - don't logout, just return false
        console.warn('Token refresh failed after all retries (non-auth error), user may need to retry');
      }

      return false;
    })();

    return refreshPromise;
  };

  const value: AuthContextType = {
    user,
    token,
    login,
    logout,
    updateUser,
    refreshToken,
    isLoading,
    isAuthenticated: !!token && !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  // Context always has a value now (either default or from provider)
  return context;
}


