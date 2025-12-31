import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import secondaryLogoUrl from '@/assets/secondary-neural-logo.png';

export default function PageTransitionLoader() {
  const location = useLocation();
  const [show, setShow] = useState(false);
  const lastPathRef = useRef(location.pathname);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only show loader when path actually changes
    if (location.pathname !== lastPathRef.current) {
      // Avoid overlay for in-app admin panel navigation
      const adminMove = lastPathRef.current.startsWith('/admin') && location.pathname.startsWith('/admin');

      if (!adminMove) {
        setShow(true);

        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        // Always hide after 300ms max
        timeoutRef.current = setTimeout(() => {
          setShow(false);
        }, 300);
      }

      lastPathRef.current = location.pathname;
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [location.pathname]);

  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm flex items-center justify-center">
      <img src={secondaryLogoUrl} alt="Loading" className="h-16 w-auto animate-pulse object-contain" />
    </div>
  );
}


