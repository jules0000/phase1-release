import React, { createContext, useContext, useEffect, useState } from 'react';
import apiService from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  actualTheme: 'light' | 'dark'; // The actual theme being applied
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Safely get auth state with error handling
  let isAuthenticated = false;
  try {
    const authState = useAuth();
    isAuthenticated = authState.isAuthenticated;
  } catch (error) {
    // AuthProvider not ready yet, use default state
    console.log('ThemeProvider: AuthProvider not ready yet');
  }
  
  const [theme, setThemeState] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    return savedTheme || 'system';
  });

  const [actualTheme, setActualTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const updateActualTheme = () => {
      let newActualTheme: 'light' | 'dark';
      
      if (theme === 'system') {
        newActualTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      } else {
        newActualTheme = theme;
      }
      
      setActualTheme(newActualTheme);
      
      // Apply theme to document
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(newActualTheme);
      
      // Update meta theme-color for mobile browsers
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', newActualTheme === 'dark' ? '#0f172a' : '#ffffff');
      }
    };

    // Initial theme application
    updateActualTheme();

    // Save theme preference
    localStorage.setItem('theme', theme);

    // Persist to backend if authenticated (non-blocking)
    (async () => {
      try {
        if (isAuthenticated) {
          await apiService.updateUserSettings({ theme });
        }
      } catch {}
    })();

    // Listen for system theme changes if using system theme
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', updateActualTheme);
      return () => mediaQuery.removeEventListener('change', updateActualTheme);
    }
  }, [theme, isAuthenticated]);

  // Load theme from backend when authenticated
  useEffect(() => {
    (async () => {
      try {
        if (isAuthenticated) {
          const res: any = await apiService.getUserSettings();
          const backendTheme = res?.settings?.theme as Theme | undefined;
          if (backendTheme === 'light' || backendTheme === 'dark' || backendTheme === 'system') {
            setThemeState(backendTheme);
          }
        }
      } catch {}
    })();
  }, [isAuthenticated]);

  const handleSetTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme: handleSetTheme, actualTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}