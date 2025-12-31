/**
 * SkipLink Component
 * Provides skip navigation link for keyboard users
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface SkipLinkProps {
  href?: string;
  className?: string;
}

export function SkipLink({ href = '#main-content', className }: SkipLinkProps) {
  return (
    <a
      href={href}
      className={cn(
        'sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50',
        'focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground',
        'focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring',
        className
      )}
      aria-label="Skip to main content"
    >
      Skip to main content
    </a>
  );
}

