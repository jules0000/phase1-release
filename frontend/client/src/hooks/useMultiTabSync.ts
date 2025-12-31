/**
 * Multi-Tab Synchronization Hook
 * Keeps localStorage synchronized across browser tabs
 */

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export const useMultiTabSync = () => {
  // Safely get auth state with error handling
  let authState = { logout: () => {}, updateUser: () => {}, user: null };
  try {
    authState = useAuth();
  } catch (error) {
    // AuthProvider not ready yet, use default state
    console.log('useMultiTabSync: AuthProvider not ready yet');
  }
  
  const { logout, updateUser, user } = authState;
  
  useEffect(() => {
    // Don't set up listeners if auth isn't ready
    if (!authState || !logout || !updateUser) {
      return;
    }
    
    const handleStorageChange = (e: StorageEvent) => {
      // User logged out in another tab
      if (e.key === 'token' && !e.newValue && e.oldValue) {
        console.log('Logout detected in another tab');
        logout();
        return;
      }
      
      // User logged in another tab
      if (e.key === 'token' && e.newValue && !e.oldValue) {
        console.log('Login detected in another tab');
        window.location.reload();
        return;
      }
      
      // User data updated in another tab
      if (e.key === 'user' && e.newValue) {
        try {
          const updatedUser = JSON.parse(e.newValue);
          if (updatedUser && updatedUser.id === user?.id) {
            console.log('User data updated in another tab');
            updateUser(updatedUser);
          }
        } catch (error) {
          console.error('Failed to parse user data from storage event');
        }
      }
      
      // Theme changed in another tab
      if (e.key === 'theme' && e.newValue) {
        console.log('Theme changed in another tab');
        document.documentElement.classList.toggle('dark', e.newValue === 'dark');
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [logout, updateUser, user, authState]);
};

// Usage in App.tsx or main layout component:
// useMultiTabSync();

