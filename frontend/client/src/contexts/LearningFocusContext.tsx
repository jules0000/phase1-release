import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import apiService from '@/lib/api';
import { getRecommendations, type Recommendation } from '@/lib/recommendations';
import { useAuth } from '@/contexts/AuthContext';

type LearningFocusState = {
  interests: string[];
  recommendations: Recommendation[];
  refresh: () => Promise<void>;
};

const Ctx = createContext<LearningFocusState | undefined>(undefined);

export function LearningFocusProvider({ children }: { children: React.ReactNode }) {
  const [interests, setInterests] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  
  // Safely get auth state with error handling
  let authState = { isAuthenticated: false };
  try {
    authState = useAuth();
  } catch (error) {
    // AuthProvider not ready yet, use default state
    console.log('LearningFocusProvider: AuthProvider not ready yet');
  }

  const refresh = async () => {
    try {
      if (!authState.isAuthenticated) {
        console.log('LearningFocusProvider: Not authenticated, skipping API calls');
        return; // avoid 401s before login
      }
      
      console.log('LearningFocusProvider: Making API calls...');
      // Refresh token from storage to ensure it's up to date
      apiService.refreshTokenFromStorage();
      
      // Double-check that we have a token before making API calls
      if (!apiService.hasValidToken()) {
        console.log('LearningFocusProvider: No valid token found, skipping API calls');
        return;
      }
      
      // Additional check: verify token exists in localStorage
      const localStorageToken = localStorage.getItem('token');
      if (!localStorageToken) {
        console.log('LearningFocusProvider: No token in localStorage, skipping API calls');
        return;
      }
      
      console.log('LearningFocusProvider: Token verified, proceeding with API calls');
      
      // Try to get settings, but don't fail if it errors
      try {
        const settings = await apiService.getUserSettings();
        setInterests(settings?.preferences?.interests || []);
      } catch (settingsError: any) {
        // Settings API failed - use default empty interests
        console.log('LearningFocusProvider: Failed to get settings, using defaults', settingsError.message);
        setInterests([]);
        // Don't throw - continue with recommendations
      }
      
      // Try to get recommendations, but don't fail if it errors
      try {
        const recs = await getRecommendations();
        setRecommendations(recs);
      } catch (recError: any) {
        // Recommendations failed - use empty array
        console.log('LearningFocusProvider: Failed to get recommendations, using defaults', recError.message);
        setRecommendations([]);
        // Don't throw - continue with empty recommendations
      }
      
      console.log('LearningFocusProvider: API calls completed');
    } catch (e: any) {
      console.log('LearningFocusProvider: Unexpected error in refresh', e.message);
      // Set default values on any unexpected error
      setInterests([]);
      setRecommendations([]);
      // Don't let this break the context - provide default values
    }
  };

  useEffect(() => {
    // Add a delay to ensure token is properly set in API service
    if (authState.isAuthenticated) {
      const timeoutId = setTimeout(() => {
        console.log('LearningFocusProvider: Starting API calls after delay');
        refresh().catch(error => {
          console.log('LearningFocusProvider: API calls failed, but continuing', error.message);
          // Don't let this block the UI - just log and continue
        });
      }, 2000); // Increased delay to 2 seconds to ensure token is fully set
      
      return () => {
        console.log('LearningFocusProvider: Cleaning up timeout');
        clearTimeout(timeoutId);
      };
    }
  }, [authState.isAuthenticated]);

  const value = useMemo(() => ({ interests, recommendations, refresh }), [interests, recommendations]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLearningFocus() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLearningFocus must be used within LearningFocusProvider');
  return ctx;
}


