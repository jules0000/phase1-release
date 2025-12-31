/**
 * Sentry Configuration for Error Tracking & Performance Monitoring
 * 
 * This module initializes Sentry for the React application with:
 * - Error tracking
 * - Performance monitoring
 * - Session replay
 * - User context tracking
 */

import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";

// Environment configuration
const ENVIRONMENT = import.meta.env.MODE;
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "1.0.0";

/**
 * Fetch Sentry DSN from backend API
 */
async function fetchSentryDSN(): Promise<string | null> {
  try {
    // Use the proxy path - Vite will rewrite /api/* to /api/v1/*
    const response = await fetch('/api/config/sentry');
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.enabled && data.dsn ? data.dsn : null;
  } catch (error) {
    console.debug("Failed to fetch Sentry DSN from API:", error);
    return null;
  }
}

/**
 * Initialize Sentry
 * Only initializes if DSN is provided
 * Made async to not block initial render
 */
export async function initSentry() {
  // Fetch DSN from API (database)
  const SENTRY_DSN = await fetchSentryDSN();
  
  // Skip initialization if DSN is not configured
  if (!SENTRY_DSN) {
    console.info("Sentry DSN not configured - error tracking disabled");
    return;
  }

  // Store DSN for other functions
  setSentryDSN(SENTRY_DSN);
  
  // Initialize Sentry asynchronously to not block initial render
  setTimeout(() => {

  Sentry.init({
    dsn: SENTRY_DSN,
    
    // Environment configuration
    environment: ENVIRONMENT,
    release: `neuraltest@${APP_VERSION}`,
    
    // Performance Monitoring
    integrations: [
      // React Router integration for performance monitoring
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      
      // Session Replay - captures user sessions for debugging
      Sentry.replayIntegration({
        maskAllText: true, // Privacy: mask all text content
        blockAllMedia: true, // Privacy: block all media content
      }),
    ],
    
    // Performance Monitoring
    tracesSampleRate: parseFloat(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || "0.1"),
    
    // Session Replay sampling
    // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
    replaysSessionSampleRate: parseFloat(import.meta.env.VITE_SENTRY_REPLAY_SESSION_RATE || "0.1"),
    
    // If the entire session is not sampled, use the below sample rate to sample
    // sessions when an error occurs.
    replaysOnErrorSampleRate: parseFloat(import.meta.env.VITE_SENTRY_REPLAY_ERROR_RATE || "1.0"),
    
    // Filter out sensitive information
    beforeSend(event, hint) {
      // Don't send events in development unless explicitly enabled
      if (ENVIRONMENT === "development" && !import.meta.env.VITE_SENTRY_DEBUG) {
        return null;
      }
      
      // Filter out specific errors you don't want to track
      const error = hint.originalException;
      if (error && typeof error === "object" && "message" in error) {
        const message = String(error.message).toLowerCase();
        
        // Skip common browser errors
        if (
          message.includes("network error") ||
          message.includes("failed to fetch") ||
          message.includes("cancelled")
        ) {
          return null;
        }
      }
      
      // Remove sensitive data from request bodies
      if (event.request?.data) {
        const data = event.request.data;
        if (typeof data === "object") {
          // Remove password fields
          ["password", "token", "apiKey", "secret"].forEach(key => {
            if (key in data) {
              data[key] = "[Filtered]";
            }
          });
        }
      }
      
      return event;
    },
    
    // Ignore specific errors
    ignoreErrors: [
      // Browser extensions
      "top.GLOBALS",
      "chrome-extension://",
      "moz-extension://",
      
      // Network errors (handled by application)
      "NetworkError",
      "Network request failed",
      
      // React dev tools
      "__REACT_DEVTOOLS_",
    ],
    
    // Ignore specific URLs
    denyUrls: [
      // Browser extensions
      /extensions\//i,
      /^chrome:\/\//i,
      /^moz-extension:\/\//i,
    ],
  });
  
  console.info("Sentry initialized successfully");
  }, 0);
}

// Store DSN for other functions
let SENTRY_DSN: string | null = null;

/**
 * Set Sentry DSN (called after fetching from API)
 */
export function setSentryDSN(dsn: string | null) {
  SENTRY_DSN = dsn;
}

/**
 * Get current Sentry DSN
 */
export function getSentryDSN(): string | null {
  return SENTRY_DSN;
}

/**
 * Set user context for error tracking
 */
export function setSentryUser(user: { id: string; email?: string; username?: string } | null) {
  if (!SENTRY_DSN) return;
  
  if (user) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.username,
    });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Capture custom error with context
 */
export function captureError(error: Error, context?: Record<string, any>) {
  if (!SENTRY_DSN) {
    console.error("Error:", error, context);
    return;
  }
  
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext("additional_info", context);
    }
    Sentry.captureException(error);
  });
}

/**
 * Capture custom message
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = "info") {
  if (!SENTRY_DSN) {
    console.log(`[${level}]`, message);
    return;
  }
  
  Sentry.captureMessage(message, level);
}

/**
 * Add breadcrumb for debugging context
 */
export function addBreadcrumb(message: string, category?: string, data?: Record<string, any>) {
  if (!SENTRY_DSN) return;
  
  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: "info",
  });
}

/**
 * Start a span for performance monitoring
 * Note: Sentry v8+ uses startSpan instead of startTransaction
 */
export function startTransaction(name: string, operation: string) {
  if (!SENTRY_DSN) return null;
  
  // Use startSpan for Sentry v8+
  if ('startSpan' in Sentry) {
    return Sentry.startSpan({ name, op: operation }, (span) => span);
  }
  
  // Fallback for older versions
  return null;
}

export default Sentry;


