/*
 * BACKEND REQUIREMENTS - api.ts (API Service Layer):
 * 
 * This is the central API service that handles all backend communication.
 * It provides a unified interface for both client and admin operations.
 * 
 * Core Backend Services Required:
 */

import { getErrorMessage } from '@/utils/errorMessages';

/*
 * 1. Authentication Service (/api/auth/*):
 *    - POST /auth/login - User authentication with JWT tokens
 *    - POST /auth/register - User registration with validation
 *    - GET /auth/me - Current user profile verification
 *    - POST /auth/refresh - Token refresh mechanism
 *    - POST /auth/logout - Session termination
 * 
 * 2. User Management (/api/users/*):
 *    - GET /users/profile - User profile data
 *    - PUT /users/profile - Profile updates
 *    - GET /users/progress - Learning progress tracking
 *    - GET /users/xp-transactions - XP history and transactions
 *    - GET /users/notifications - Real-time notifications
 *    - PUT /users/notifications/{id}/read - Mark notifications as read
 *    - GET /users/settings - User preferences
 *    - PUT /users/settings - Update preferences
 * 
 * 3. Learning Content (/api/modules/*, /api/content/*):
 *    - GET /modules/topics - Available learning topics
 *    - GET /modules - Paginated module listings with filters
 *    - GET /modules/{id} - Module details and metadata
 *    - POST /modules/{id}/progress - Progress tracking
 *    - GET /content/topic/{number} - Neural content from JSON files
 *    - POST /content/upload - Media file uploads
 *    - DELETE /content/upload/{id} - File management
 * 
 * 4. Progress & Analytics (/api/progress/*, /api/analytics/*):
 *    - GET /progress/summary - User progress overview
 *    - GET /progress/streak - Learning streak tracking
 *    - GET /progress/leaderboard - Community rankings
 *    - GET /analytics/basic - User analytics
 *    - GET /analytics/admin - Admin dashboard analytics
 *    - GET /analytics/engagement - Engagement metrics
 * 
 * 5. AI Services (/api/openai/*):
 *    - POST /openai/test-prompt - Prompt testing
 *    - POST /openai/grade-prompt - AI-powered grading
 *    - POST /openai/translate-prompt - Model translation
 *    - POST /openai/optimize-prompt - Prompt optimization
 *    - POST /openai/generate-image - Image generation
 *    - POST /openai/generate-code - Code generation
 *    - POST /openai/generate-creative-content - Creative writing
 *    - GET /openai/config - Model configuration
 *    - GET /openai/usage - Usage statistics
 * 
 * 6. Tools & Utilities (/api/tools/*):
 *    - GET /tools/available - Available tools list
 *    - GET /tools/user-stats - User tool usage statistics
 *    - POST /tools/{id}/track-usage - Usage tracking
 * 
 * 7. Challenges & Gamification (/api/challenges/*):
 *    - GET /challenges - Available challenges
 *    - GET /challenges/{id} - Challenge details
 *    - POST /challenges/{id}/attempt - Submit challenge solution
 *    - GET /challenges/daily - Daily challenges
 *    - GET /challenges/weekly - Weekly challenges
 *    - GET /challenges/timed - Timed challenges
 *    - POST /challenges/{id}/start - Start challenge
 *    - POST /challenges/{id}/submit - Submit solution
 * 
 * 8. Activities & Practice (/api/activities/*, /api/practice/*):
 *    - GET /activities/available - Available activities
 *    - GET /activities/completed - Completed activities
 *    - POST /activities/{id}/start - Start activity
 *    - POST /activities/{id}/complete - Complete activity
 *    - GET /practice/exercises - Practice exercises
 *    - POST /practice/{id}/submit - Submit practice solution
 * 
 * 9. Certificates (/api/certificates/*):
 *    - GET /certificates/available - Available certificates
 *    - GET /certificates/{id}/download - Certificate download
 *    - POST /certificates/{id}/share - Share certificate
 * 
 * 10. Admin Operations (/api/admin/*):
 *     - GET /admin/dashboard/stats - Admin dashboard statistics
 *     - GET /admin/users - User management with pagination
 *     - PUT /admin/users/{id} - Update user data
 *     - DELETE /admin/users/{id} - Delete user
 *     - GET /admin/modules - Module management
 *     - POST /admin/modules - Create modules
 *     - GET /admin/challenges - Challenge management
 *     - POST /admin/challenges - Create challenges
 *     - PUT /admin/challenges/{id} - Update challenges
 *     - DELETE /admin/challenges/{id} - Delete challenges
 * 
 * 11. Quiz & Assessment (/api/quiz/*):
 *     - GET /quiz/{moduleId}/{lessonId} - Quiz data
 *     - POST /quiz/{moduleId}/{lessonId}/submit - Submit quiz answers
 * 
 * Real-time Features Required:
 * - WebSocket connections for live updates
 * - Real-time progress synchronization
 * - Live notifications and achievements
 * - Collaborative features and live leaderboards
 * - System health monitoring
 * 
 * Database Tables Needed:
 * - users, user_progress, user_settings, user_notifications
 * - modules, lessons, topics, content_uploads
 * - challenges, challenge_attempts, activities
 * - certificates, xp_transactions, leaderboard
 * - admin_logs, system_health, analytics_data
 * - ai_usage_logs, tool_usage_stats
 */

// Neural AI Learning Platform API Service
// Unified API service for both client and admin interfaces

import { configService } from './config';

// Use Vite dev proxy: frontend calls '/api/*' which rewrites to backend '/api/v1/*'
// In development, we'll try proxy first, then fallback to direct connection
// Get from configuration service - no hardcoded defaults
const API_BASE_URL = configService.apiConfig.baseUrl;
const BACKEND_PORT = configService.apiConfig.backendPort;
const API_DIRECT_URL = configService.apiConfig.directUrl || (BACKEND_PORT ? `http://localhost:${BACKEND_PORT}/api/v1` : null);

// Standardized API Error class
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public details?: any,
    public endpoint?: string
  ) {
    super(message);
    this.name = 'APIError';
    Object.setPrototypeOf(this, APIError.prototype);
  }
  
  isNetworkError(): boolean {
    return !this.status || this.status >= 500;
  }
  
  isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
  
  isValidationError(): boolean {
    return this.status === 422 || this.status === 400;
  }
  
  isRetryable(): boolean {
    // Retry on network errors, timeouts, and 5xx errors (except 501, 505)
    if (!this.status) return true; // Network error
    if (this.status >= 500) {
      return this.status !== 501 && this.status !== 505; // Not Implemented, HTTP Version Not Supported
    }
    // Retry on specific 4xx errors
    return this.status === 408 || this.status === 429; // Timeout, Rate Limit
  }
}

// TypeScript interfaces for standardized API responses
interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
  error_code?: string;
  details?: any;
  timestamp?: string;
  status_code?: number;
}

interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
    next_page?: number;
    prev_page?: number;
  };
}

interface ProgressSummaryResponse {
  summary: {
    totalXP: number;
    level: number;
    streak: number;
    longestStreak?: number;
    completedModules: number;
    totalModules: number;
    completedLessons: number;
    totalLessons: number;
    overallProgress: number;
    averageScore: number;
    totalLearningTime: number;
    averageSessionDuration: number;
    lastActivityDate: string | null;
  };
  topicProgress: any[];
  achievements: any[];
  recentActivity: any[];
}

interface LessonCompletionResponse {
  lesson_progress: any;
  module_progress?: any;
  xp_earned: number;
  already_completed?: boolean;
}

// Basic runtime validation helpers
function validateResponse<T>(response: any, validator?: (data: any) => data is T): T {
  if (response == null) {
    throw new Error('Response is null or undefined');
  }
  
  // If validator provided, use it
  if (validator && !validator(response)) {
    throw new Error('Response validation failed');
  }
  
  return response as T;
}

function isArrayResponse<T>(data: any): data is T[] {
  return Array.isArray(data);
}

function isObjectResponse(data: any): data is Record<string, any> {
  return typeof data === 'object' && data !== null && !Array.isArray(data);
}

function isValidApiResponse(data: any): data is ApiResponse {
  return isObjectResponse(data) && (
    'success' in data || 'data' in data || 'error' in data || 'message' in data
  );
}

/**
 * Helper function to unwrap backend responses that may be wrapped in a success object
 * Handles multiple response formats:
 * - Standardized: {success: true, data: {...}, message: "..."}
 * - Legacy wrapped: {success: true, modules: []}
 * - Legacy direct: {modules: []}
 * - Direct data: {...}
 * 
 * Logs format mismatches for debugging
 */
function unwrapResponse<T>(response: any, dataKey?: string, endpoint?: string): T {
  // Handle null or undefined responses
  if (response == null) {
    return response as T;
  }

  // Standardized format: {success: true, data: {...}}
  if (response.success !== undefined && response.data !== undefined) {
    // If dataKey is provided, try to extract it from data
    if (dataKey && typeof response.data === 'object' && dataKey in response.data) {
      return response.data[dataKey] as T;
    }
    // Otherwise return the data object itself
    return response.data as T;
  }

  // Legacy wrapped format: {success: true, modules: []} or {success: true, users: []}
  if (response.success !== undefined && dataKey && dataKey in response) {
    return response[dataKey] as T;
  }

  // Legacy direct format: {modules: []} or direct data
  if (dataKey && dataKey in response && response[dataKey] !== undefined) {
    return response[dataKey] as T;
  }

  // If no dataKey provided or dataKey not found, return the response as-is
  // This handles cases where response is already the expected format
  if (!dataKey) {
    // For responses without dataKey, prefer data field if it exists
    if (response.data !== undefined) {
      return response.data as T;
    }
    return response as T;
  }

  // Log format mismatch for debugging
  if (endpoint) {
    console.warn(`API response format mismatch for ${endpoint}: expected key '${dataKey}' not found in response`, response);
  }
  
  // Return response as-is if we can't extract the expected key
  return response as T;
}

/**
 * Extract data from a standardized API response
 * Handles both {success: true, data: {...}} and direct data formats
 */
export function extractResponseData<T>(response: any, defaultData?: T): T {
  if (response == null) {
    return defaultData as T;
  }

  // Standardized format
  if (response.success !== undefined && response.data !== undefined) {
    return response.data as T;
  }

  // Direct data format
  return response as T;
}

/**
 * Check if response indicates success
 */
function isSuccessResponse(response: any): boolean {
  if (response == null) return false;
  // Standardized format
  if (response.success !== undefined) {
    return response.success === true;
  }
  // Direct format - assume success if no error field
  return !response.error && !response.errors;
}

/**
 * Extract error message from response
 * Uses standardized error message utility when available
 */
function extractErrorMessage(response: any, defaultMessage: string = 'An error occurred'): string {
  // Try to use getErrorMessage if available (dynamic import to avoid circular deps)
  try {
    const { getErrorMessage } = require('@/utils/errorMessages');
    const errorMsg = getErrorMessage(response, defaultMessage);
    return errorMsg.message;
  } catch {
    // Fallback to existing logic if import fails
    if (response == null) return defaultMessage;
    
    // Standardized format
    if (response.success === false) {
      return response.message || response.error || defaultMessage;
    }
    
    // Legacy format
    if (response.error) {
      return typeof response.error === 'string' ? response.error : defaultMessage;
    }
    
    if (response.message && !response.success) {
      return response.message;
    }
    
    return defaultMessage;
  }
}

class ApiService {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private abortControllers = new Map<string, AbortController>();
  private pendingRequests = new Map<string, Promise<any>>();
  private refreshPromise: Promise<any> | null = null;

  constructor() {
    // Get tokens from localStorage on initialization
    this.token = localStorage.getItem('token');
    this.refreshToken = localStorage.getItem('refreshToken');
    console.log('API Service: Constructor initialized', {
      hasToken: !!this.token,
      hasRefreshToken: !!this.refreshToken,
      tokenLength: this.token?.length || 0
    });
  }

  // Check if API service has a valid token
  hasValidToken(): boolean {
    const hasToken = !!this.token && this.token.length > 0;
    console.log('API Service: Checking token validity', {
      hasToken,
      tokenLength: this.token?.length || 0
    });
    return hasToken;
  }


  // Refresh token from localStorage (in case it gets out of sync)
  refreshTokenFromStorage() {
    const storedToken = localStorage.getItem('token');
    const storedRefreshToken = localStorage.getItem('refreshToken');
    
    // Only log if there's a significant change
    if (this.token !== storedToken) {
      console.log('API Service: Refreshing token from storage', {
        hadToken: !!this.token,
        hasStoredToken: !!storedToken,
        tokenLength: storedToken?.length || 0
      });
    }
    
    this.token = storedToken;
    this.refreshToken = storedRefreshToken;
  }

  // Update tokens (called after login)
  setToken(token: string, refreshTokenValue?: string) {
    console.log('API Service: Setting token', {
      hasToken: !!token,
      hasRefreshToken: !!refreshTokenValue,
      tokenLength: token?.length || 0,
      tokenPreview: token ? `${token.substring(0, 20)}...` : 'null'
    });
    this.token = token;
    if (refreshTokenValue) {
      this.refreshToken = refreshTokenValue;
      localStorage.setItem('refreshToken', refreshTokenValue);
    }
    localStorage.setItem('token', token);
    
    // Verify token was stored correctly
    const storedToken = localStorage.getItem('token');
    console.log('API Service: Token storage verification', {
      originalLength: token?.length || 0,
      storedLength: storedToken?.length || 0,
      matches: token === storedToken
    });
  }

  // Clear tokens (called after logout)
  clearToken() {
    this.token = null;
    this.refreshToken = null;
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
  }

  // Normalize endpoint - Vite proxy rewrites /api/* to /api/v1/* on backend
  // So we should send /api/auth/login from frontend, proxy rewrites to /api/v1/auth/login
  // Also handles trailing slashes consistently
  private normalizeEndpoint(endpoint: string): string {
    // Remove leading slash if present
    let normalized = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    // Remove trailing slash for consistency (backend handles both, but we standardize to no trailing slash)
    normalized = normalized.endsWith('/') && normalized.length > 1 ? normalized.slice(0, -1) : normalized;
    
    // Remove /api/v1/ prefix if present (proxy will add it)
    if (normalized.startsWith('/api/v1/')) {
      normalized = normalized.replace('/api/v1/', '/');
    }
    // Remove /api/ prefix if present (proxy will add /v1)
    else if (normalized.startsWith('/api/')) {
      normalized = normalized.replace('/api/', '/');
    }
    // Remove /v1/ prefix if present (proxy will add it)
    else if (normalized.startsWith('/v1/')) {
      normalized = normalized.replace('/v1/', '/');
    }
    
    // Ensure it starts with / (for paths like 'auth/login' -> '/auth/login')
    if (!normalized.startsWith('/')) {
      normalized = `/${normalized}`;
    }
    
    // Preserve /public endpoints as-is
    if (normalized.startsWith('/public')) {
      return normalized;
    }
    
    return normalized;
  }

  // Cancel a specific request
  cancelRequest(endpoint: string): void {
    const normalizedEndpoint = this.normalizeEndpoint(endpoint);
    const controller = this.abortControllers.get(normalizedEndpoint);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(normalizedEndpoint);
    }
  }
  
  // Cancel all pending requests
  cancelAllRequests(): void {
    this.abortControllers.forEach(controller => controller.abort());
    this.abortControllers.clear();
  }

  // Generic API request method
  private async request<T>(
    endpoint: string,
    method: string = 'GET',
    data?: any,
    options?: { signal?: AbortSignal }
  ): Promise<T> {
    // Normalize endpoint to ensure consistent /api/v1/ prefix
    const normalizedEndpoint = this.normalizeEndpoint(endpoint);
    
    // Cancel previous request for same endpoint if exists (unless using provided signal)
    if (!options?.signal) {
      const existingController = this.abortControllers.get(normalizedEndpoint);
      if (existingController) {
        existingController.abort();
      }
    }
    
    // Create new AbortController if not provided
    const controller = options?.signal 
      ? null 
      : new AbortController();
    
    if (controller) {
      this.abortControllers.set(normalizedEndpoint, controller);
    }
    
    const signal = options?.signal || controller?.signal;
    
    // Build the full URL - try proxy first, fallback to direct if needed
    const proxyUrl = `${API_BASE_URL}${normalizedEndpoint}`;
    const directUrl = `${API_DIRECT_URL}${normalizedEndpoint}`;
    
    const config: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      signal,
    };

    // Add body for POST/PUT requests
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.body = JSON.stringify(data);
    }

    // Add authorization header if token exists
    // Only refresh token from storage if we don't have one in memory
    if (!this.token) {
      this.refreshTokenFromStorage();
    }
    
    // Public endpoints that should NOT send Authorization (prevents accidental 401s)
    const isPublicGet = (
      method === 'GET' && (
        endpoint.startsWith('/public') ||
        endpoint.startsWith('/modules/public') ||
        endpoint.startsWith('/modules?') // Only public module listings
      )
    );

    if (this.token && !isPublicGet) {
      config.headers = {
        ...config.headers,
        'Authorization': `Bearer ${this.token}`,
      };
    }

    try {
      // Determine timeout based on endpoint - slow endpoints get more time
      const slowEndpoints = [
        '/admin/dashboard/stats',
        '/admin/analytics',
        '/admin/system/logs',
        '/content/admin/migration-status',
        '/admin/modules',
        '/content/admin/modules'
      ];
      const isSlowEndpoint = slowEndpoints.some(ep => normalizedEndpoint.includes(ep));
      
      // Use longer timeout for slow endpoints, shorter for fast ones
      const proxyTimeout = isSlowEndpoint ? 60000 : 30000; // 60s for slow, 30s for fast
      const directTimeout = isSlowEndpoint ? 60000 : 30000; // 60s for slow, 30s for fast
      
      // Request deduplication - if same request is already pending, return that promise
      const requestKey = `${method}:${normalizedEndpoint}:${JSON.stringify(config.body || {})}`;
      if (this.pendingRequests.has(requestKey)) {
        console.log(`Deduplicating request: ${requestKey}`);
        return this.pendingRequests.get(requestKey)!;
      }
      
      // Create the request promise and store it
      const requestPromise = (async () => {
        try {
          // Try proxy URL first with timeout
          let response: Response;
          let url = proxyUrl;
          const proxyController = new AbortController();
          const proxyTimeoutId = setTimeout(() => proxyController.abort(), proxyTimeout);
          
          try {
        response = await fetch(proxyUrl, {
          ...config,
          signal: proxyController.signal
        });
        clearTimeout(proxyTimeoutId);
        console.log(`API request successful via proxy: ${normalizedEndpoint}`);
      } catch (proxyError: any) {
        clearTimeout(proxyTimeoutId);
        console.warn(`Proxy request failed for ${normalizedEndpoint}:`, proxyError.name, proxyError.message);
        
        // If proxy fails or times out, try direct connection in dev mode (only if API_DIRECT_URL is configured)
        if (import.meta.env.DEV && API_DIRECT_URL) {
          const isNetworkError = proxyError.name === 'AbortError' || 
                                 proxyError.message?.includes('Failed to fetch') || 
                                 proxyError.message?.includes('timeout') ||
                                 proxyError.message?.includes('network') ||
                                 !proxyError.response;
          
          if (isNetworkError) {
            console.warn('Proxy request failed or timed out, trying direct backend connection...', proxyError.message || proxyError.name);
            const directController = new AbortController();
            const directTimeoutId = setTimeout(() => directController.abort(), directTimeout);
            
            try {
              url = directUrl;
              response = await fetch(directUrl, {
                ...config,
                signal: directController.signal
              });
              clearTimeout(directTimeoutId);
              console.log('Direct backend connection successful');
            } catch (directError: any) {
              clearTimeout(directTimeoutId);
              console.error('Direct backend connection also failed:', directError.message || directError.name);
              // If it's a timeout, provide a helpful error message
              if (directError.name === 'AbortError') {
                const portInfo = BACKEND_PORT ? ` on port ${BACKEND_PORT}` : '';
                throw new Error(`Request timeout - backend server may not be running${portInfo}. Please check your backend configuration.`);
              }
              throw directError;
            }
          } else {
            // Not a network error, throw the original error
            throw proxyError;
          }
        } else {
          // In production or if no direct URL configured, throw the original error
          throw proxyError;
        }
      }
      
      if (!response.ok) {
        // Handle 500 errors with retry logic (transient server errors)
        if (response.status >= 500 && response.status < 600) {
          const maxRetries = 2;
          let lastError: any = null;
          
          for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
              // Wait before retry (exponential backoff: 1s, 2s)
              if (attempt > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
              }
              
              console.warn(`Retrying request to ${normalizedEndpoint} (attempt ${attempt + 1}/${maxRetries}) due to ${response.status} error`);
              
              const retryController = new AbortController();
              const retryTimeout = isSlowEndpoint ? 60000 : 30000;
              const retryTimeoutId = setTimeout(() => retryController.abort(), retryTimeout);
              
              try {
                const retryResponse = await fetch(url, {
                  ...config,
                  signal: retryController.signal
                });
                clearTimeout(retryTimeoutId);
                
                if (retryResponse.ok) {
                  const retryData = await retryResponse.json();
                  console.log(`Request succeeded on retry ${attempt + 1} for ${normalizedEndpoint}`);
                  return retryData;
                } else if (retryResponse.status < 500) {
                  // Non-5xx error on retry - don't retry again
                  response = retryResponse;
                  break;
                } else {
                  // Still 5xx error
                  lastError = retryResponse;
                  response = retryResponse;
                }
              } catch (retryError: any) {
                clearTimeout(retryTimeoutId);
                if (retryError.name === 'AbortError') {
                  throw retryError;
                }
                lastError = retryError;
              }
            } catch (retryError: any) {
              lastError = retryError;
              if (retryError.name === 'AbortError') {
                throw retryError;
              }
            }
          }
          
          // All retries failed - provide helpful error message
          const errorData = await response.json().catch(() => ({}));
          const backendMsg = extractErrorMessage(errorData, `Server error (${response.status}). Please try again later.`);
          const errorCode = errorData?.error_code || errorData?.code || `HTTP_${response.status}`;
          throw new APIError(
            backendMsg,
            response.status,
            errorCode,
            { ...errorData?.details, retries: maxRetries },
            normalizedEndpoint
          );
        }
        
        // Handle token expiration
        if (response.status === 401 && this.token) {
          try {
            // Try to refresh the token (only once, prevents cascading)
            const refreshResponse = await this.refreshTokenRequest();
            if (refreshResponse?.access_token) {
              this.setToken(refreshResponse.access_token);
              // Retry the original request with new token
              config.headers = {
                ...config.headers,
                'Authorization': `Bearer ${refreshResponse.access_token}`,
              };
              // Create a new controller for the retry with longer timeout
              const retryController = new AbortController();
              const retryTimeout = isSlowEndpoint ? 60000 : 30000;
              const retryTimeoutId = setTimeout(() => retryController.abort(), retryTimeout);
              try {
                const retryResponse = await fetch(url, {
                  ...config,
                  signal: retryController.signal
                });
                clearTimeout(retryTimeoutId);
                if (retryResponse.ok) {
                  const retryData = await retryResponse.json();
                  return retryData;
                } else if (retryResponse.status === 401) {
                  // Still 401 after refresh - token is truly invalid
                  throw new Error('Session expired. Please log in again.');
                }
              } catch (retryError: any) {
                clearTimeout(retryTimeoutId);
                // Don't throw immediately - let the error handler below deal with it
                if (retryError.message?.includes('Session expired')) {
                  throw retryError;
                }
                throw retryError;
              }
            }
          } catch (refreshError: any) {
            // Refresh failed - don't clear tokens immediately, let AuthContext handle it
            // Only clear if it's a definitive auth error
            if (refreshError.message?.includes('Session expired') || 
                refreshError.message?.includes('No refresh token')) {
              console.log('API Service: Token refresh failed definitively, clearing tokens');
              this.clearToken();
              localStorage.removeItem('token');
              localStorage.removeItem('refreshToken');
              localStorage.removeItem('user');
            } else {
              console.warn('API Service: Token refresh failed, but may be recoverable:', refreshError.message);
            }
            // Re-throw to let the caller handle it
            throw refreshError;
          }
        }
        
        const errorData = await response.json().catch(() => ({}));
        // Extract error message using standardized helper
        let backendMsg = extractErrorMessage(errorData, `HTTP ${response.status}: ${response.statusText}`);
        
        // Improve error messages for common status codes
        if (response.status === 500) {
          backendMsg = errorData?.message || errorData?.error || 'Internal server error. Please try again later or contact support if the problem persists.';
        } else if (response.status === 503) {
          backendMsg = errorData?.message || errorData?.error || 'Service temporarily unavailable. Please try again in a moment.';
        } else if (response.status === 504) {
          backendMsg = errorData?.message || errorData?.error || 'Request timeout. The server took too long to respond. Please try again.';
        } else if (response.status === 429) {
          backendMsg = errorData?.message || errorData?.error || 'Too many requests. Please wait a moment before trying again.';
        }
        
        const errorCode = errorData?.error_code || errorData?.code || `HTTP_${response.status}`;
        throw new APIError(
          backendMsg,
          response.status,
          errorCode,
          errorData?.details || {},
          normalizedEndpoint
        );
      }

      const data = await response.json();
      
      // Check if response indicates an error even with 200 status
      if (!isSuccessResponse(data) && data.success === false) {
        const errorMessage = extractErrorMessage(data, `HTTP ${response.status}: ${response.statusText}`);
        throw new APIError(
          errorMessage,
          response.status,
          data.error_code || `HTTP_${response.status}`,
          data.details || {},
          normalizedEndpoint
        );
      }
      
      return data;
        } finally {
          // Clean up pending request
          this.pendingRequests.delete(requestKey);
          // Clean up abort controller on completion
          if (controller) {
            this.abortControllers.delete(normalizedEndpoint);
          }
        }
      })();
      
      // Store the promise for deduplication
      this.pendingRequests.set(requestKey, requestPromise);
      
      return requestPromise;
    } catch (error: any) {
      // Clean up abort controller on completion
      if (controller) {
        this.abortControllers.delete(normalizedEndpoint);
      }
      
      // Clean up pending request
      const requestKey = `${method}:${normalizedEndpoint}:${JSON.stringify(config.body || {})}`;
      this.pendingRequests.delete(requestKey);
      
      // Don't log aborted requests as errors
      if (error.name === 'AbortError') {
        throw error;
      }
      
      console.error(`API request failed for ${normalizedEndpoint}:`, error);
      
      // Handle timeout errors specifically
      if (error instanceof Error && error.name === 'AbortError') {
        // If we're in dev mode, haven't tried direct connection yet, and API_DIRECT_URL is configured, try it now
        if (import.meta.env.DEV && API_DIRECT_URL && !error.message?.includes('direct backend')) {
          console.warn('Request timed out, attempting direct backend connection as last resort...');
          try {
            const directController = new AbortController();
            const directTimeoutId = setTimeout(() => directController.abort(), 10000);
            const directResponse = await fetch(directUrl, {
              ...config,
              signal: directController.signal
            });
            clearTimeout(directTimeoutId);
            
            if (directResponse.ok) {
              const directData = await directResponse.json();
              console.log('Direct backend connection successful on retry');
              return directData;
            } else {
              const errorData = await directResponse.json().catch(() => ({}));
              const backendMsg = (errorData && (errorData.error || errorData.message)) ? (errorData.error || errorData.message) : '';
              const errorCode = errorData?.code || `HTTP_${directResponse.status}`;
              const error = new Error(backendMsg || `HTTP ${directResponse.status}: ${directResponse.statusText}`);
              (error as any).status = directResponse.status;
              (error as any).code = errorCode;
              (error as any).error = backendMsg;
              (error as any).details = errorData?.details || {};
              throw error;
            }
          } catch (directError: any) {
            console.error('Direct backend connection failed on retry:', directError);
            const portInfo = BACKEND_PORT ? ` on port ${BACKEND_PORT}` : '';
            throw new Error(`Request timeout - backend server may not be running${portInfo}. Please check your backend configuration.`);
          }
        }
        throw new Error('Request timeout - please check your connection and try again');
      }
      
      throw error;
    }
  }

  // Authentication endpoints
  async login(email: string, password: string) {
    const res = await this.request<{ access_token: string; refresh_token?: string; user: any }>('/auth/login', 'POST', { email, password });
    // Extract data from standardized response: {success: true, data: {access_token, refresh_token, user}}
    return extractResponseData(res, res);
  }

  async register(email: string, password: string, full_name: string, username: string) {
    const res = await this.request<{ access_token: string; refresh_token?: string; user: any }>('/auth/register', 'POST', { email, password, full_name, username });
    // Extract data from standardized response: {success: true, data: {access_token, refresh_token, user}}
    return extractResponseData(res, res);
  }

  async getCurrentUser() {
    const res = await this.request<any>('/auth/me');
    // Handle both formats: {user: {}} and {success: true, data: {user: {}}}
    if (res && typeof res === 'object' && 'user' in res) return res.user;
    const data = extractResponseData(res);
    return (data && typeof data === 'object' && 'user' in data) ? data.user : data;
  }

  async refreshTokenRequest() {
    // Prevent multiple simultaneous refresh attempts
    if (this.refreshPromise) {
      console.log('Token refresh already in progress, waiting for existing request');
      return this.refreshPromise;
    }
    
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }
    
    // Create refresh promise and store it
    this.refreshPromise = (async () => {
      try {
        // Use a separate request method that doesn't trigger token refresh to avoid infinite loops
        const url = `${API_BASE_URL}/auth/refresh`;
        const config: RequestInit = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.refreshToken}`,
          },
        };

        const response = await fetch(url, config);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData?.message || 'Token refresh failed';
          throw new Error(errorMessage);
        }
        const data = await response.json();
        // Backend only returns access_token, so we keep the existing refresh_token
        return {
          access_token: data.data?.access_token || data.access_token,
          refresh_token: this.refreshToken // Keep the existing refresh token
        };
      } finally {
        // Clear the promise so a new refresh can be attempted
        this.refreshPromise = null;
      }
    })();
    
    return this.refreshPromise;
  }

  // Generic GET method
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, 'GET');
  }

  // Generic POST method
  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, 'POST', data);
  }

  // User endpoints
  async getUserProfile() {
    const res = await this.request<any>('/users/profile');
    // Handle both formats
    if (res && typeof res === 'object' && 'user' in res) return res.user;
    const data = extractResponseData(res);
    return (data && typeof data === 'object' && 'user' in data) ? data.user : data;
  }

  async updateUserProfile(data: Partial<{ full_name: string; username: string; avatar_url: string; bio: string; location: string; website: string; }>) {
    const res = await this.request<any>('/users/profile', 'PUT', data);
    // Handle both formats
    if (res && typeof res === 'object' && 'user' in res) return res.user;
    const responseData = extractResponseData(res);
    return (responseData && typeof responseData === 'object' && 'user' in responseData) ? responseData.user : responseData;
  }

  async getUserProgress() {
    const res = await this.request<any>('/users/progress');
    // Handle both formats
    if (res && typeof res === 'object' && 'progress' in res) return res.progress;
    const data = extractResponseData(res);
    return (data && typeof data === 'object' && 'progress' in data) ? data.progress : data;
  }

  // Simple avatar upload using data URL (stored in avatar_url). For binary uploads, integrate /media/upload.
  async uploadAvatarFromFile(file: File): Promise<string> {
    // Convert file to data URL so it can be saved directly as avatar_url
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
    return dataUrl;
  }

  async getXPTransactions(page = 1, limit = 20) {
    const backendData = await this.request<any>(`/users/xp-transactions?page=${page}&per_page=${limit}`);
    // Handle standardized paginated response: {success: true, data: {items: [], pagination: {...}}}
    const data = extractResponseData(backendData, backendData);
    const items = (data && typeof data === 'object' && 'items' in data) ? data.items : 
                  (Array.isArray(data) ? data : 
                   (data?.transactions || []));
    // Return items array directly for easier consumption
    return Array.isArray(items) ? items : [];
  }

  async getNotifications(unreadOnly = false) {
    return this.request<any[]>(`/users/notifications${unreadOnly ? '?unread=true' : ''}`);
  }

  async markNotificationAsRead(notificationId: string) {
    return this.request<any>(`/users/notifications/${notificationId}/read`, 'PUT');
  }

  // Modules and Learning endpoints
  async getTopics() {
    const res = await this.request<any>('/modules/public/topics');
    // Handle standardized response: {success: true, data: [...]} or direct array
    const data = extractResponseData(res, res);
    return Array.isArray(data) ? data : [];
  }

  async getModules(topicId?: string, page = 1, pageSize = 20) {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    
    if (topicId) {
      params.append('topicId', topicId);
    }
    
    const res = await this.request<any>(`/modules/public/modules?${params.toString()}`);
    // Handle standardized paginated response: {success: true, data: {items: [], pagination: {...}}}
    const data = extractResponseData(res, res);
    return {
      items: data?.items || [],
      pagination: data?.pagination || {
        page,
        per_page: pageSize,
        total: 0,
        pages: 0
      }
    };
  }

  async getModuleDetails(moduleId: string) {
    const res = await this.request<any>(`/modules/${moduleId}`);
    // Handle standardized response: {success: true, data: {module: {...}, user_progress: {...}}}
    const data = extractResponseData(res, res);
    return {
      module: data?.module || data,
      user_progress: data?.user_progress || null
    };
  }

  // Backward-compatible alias used by ModuleDetail.tsx
  async getModuleDetail(moduleId: string) {
    return this.getModuleDetails(moduleId);
  }

  async getModule(moduleId: string) {
    return this.request(`/modules/${moduleId}`);
  }

  async getLesson(lessonId: string) {
    return this.request(`/lessons/${lessonId}`);
  }

  async getModuleLessons(moduleId: string) {
    const res = await this.request<any>(`/modules/${moduleId}/lessons`);
    // Handle standardized response: {success: true, data: {lessons: [], user_progress: {}, module_info: {}}}
    const data = extractResponseData(res, res);
    return {
      lessons: data?.lessons || [],
      user_progress: data?.user_progress || {},
      module_info: data?.module_info || {}
    };
  }

  async updateProgress(moduleId: string, data: {
    lessonId?: string;
    completionPercentage: number;
    timeSpentMinutes?: number;
  }) {
    return this.request<any>(`/modules/${moduleId}/progress`, 'POST', data);
  }

  async addXP(amount: number, source: string, description: string) {
    return this.request<any>('/gamification/xp/earn', 'POST', {
      amount,
      source,
      description
    });
  }

  // Progress and Analytics endpoints
  async getProgressSummary() {
    const backendData = await this.request<any>('/progress/summary');
    // Extract data from standardized response format: {success: true, data: {summary: {...}, topicProgress: [...], ...}}
    const extractedData = extractResponseData(backendData, backendData);
    // Transform backend response to frontend format
    return this.transformProgressSummary(extractedData);
  }

  // Transform progress summary from backend format to frontend format
  private transformProgressSummary(backendData: any) {
    if (!backendData) {
      return {
        summary: {
          totalXP: 0,
          level: 1,
          streak: 0,
          completedModules: 0,
          totalModules: 0,
          completedLessons: 0,
          totalLessons: 0,
          overallProgress: 0,
          averageScore: 0,
          totalLearningTime: 0,
          averageSessionDuration: 0,
          lastActivityDate: null
        },
        topicProgress: [],
        achievements: [],
        recentActivity: []
      };
    }

    // Handle standardized response: {success: true, data: {summary: {...}, topicProgress: [...], ...}}
    // or legacy format: {summary: {...}, topicProgress: [...]}
    const data = backendData.data || backendData;
    const summary = data.summary || {};
    return {
      summary: {
        totalXP: summary.total_xp || 0,
        level: summary.level || 1,
        streak: summary.current_streak_days || 0,
        longestStreak: summary.longest_streak_days || 0,
        completedModules: Array.isArray(summary.completed_modules) ? summary.completed_modules.length : (summary.completed_modules || 0),
        totalModules: summary.total_modules || 0,
        completedLessons: Array.isArray(summary.completed_lessons) ? summary.completed_lessons.length : (summary.completed_lessons || 0),
        totalLessons: summary.total_lessons || 0,
        overallProgress: summary.overall_progress || 0,
        averageScore: summary.average_score || 0,
        totalLearningTime: summary.total_learning_time || 0,
        averageSessionDuration: summary.average_session_duration || 0,
        lastActivityDate: summary.last_activity_date || null
      },
      topicProgress: Array.isArray(data.topicProgress) ? data.topicProgress : [],
      achievements: Array.isArray(data.achievements) ? data.achievements : [],
      recentActivity: Array.isArray(data.recentActivity) ? data.recentActivity : []
    };
  }

  async getLearningStreak() {
    const backendData = await this.request<any>('/progress/streak');
    // Extract data from standardized response format: {success: true, data: {currentStreak, longestStreak, streakHistory}}
    const data = extractResponseData(backendData, backendData);
    // Transform backend response to frontend format
    return {
      currentStreak: data?.currentStreak || data?.current_streak || 0,
      longestStreak: data?.longestStreak || data?.longest_streak || 0,
      streakHistory: Array.isArray(data?.streakHistory) ? data.streakHistory : 
                     (Array.isArray(data?.streak_history) ? data.streak_history : [])
    };
  }

  async syncProgress(localProgress?: any) {
    const response = await this.request<any>('/progress/sync', 'POST', {
      updated_at: new Date().toISOString(),
      ...localProgress
    });
    // Handle standardized response: {success: true, data: {progress: {...}}}
    const data = extractResponseData(response, response);
    return data && typeof data === 'object' && 'progress' in data ? { progress: data.progress } : { progress: data };
  }

  async getLeaderboard(limit = 10, timeframe = 'all') {
    // Map timeframe to type parameter expected by backend
    const type = timeframe === 'all' ? 'global' : timeframe;
    const response = await this.request<any>(`/gamification/leaderboard?limit=${limit}&type=${type}`);
    // Handle standardized response: {success: true, data: {leaderboard: [...], type: ..., updated_at: ...}}
    const data = extractResponseData(response, response);
    const leaderboard = data?.leaderboard || [];
    // Return the leaderboard array, normalized with streak data
    if (Array.isArray(leaderboard)) {
      return leaderboard.map((entry: any) => ({
        ...entry,
        total_xp: entry.xp || entry.total_xp || 0,
        streak: 0 // Will be populated from user data if available
      }));
    }
    return [];
  }

  async getBasicAnalytics() {
    return this.request<{
      userStats: any;
      recentActivity: any[];
    }>('/analytics/basic');
  }

  // Admin endpoints (require admin authentication)
  async getAdminDashboardStats() {
    const backendData = await this.request<any>('/admin/dashboard/stats');
    // Transform backend response to frontend format
    return this.transformAdminDashboardStats(backendData);
  }

  private transformAdminDashboardStats(backendData: any) {
    if (!backendData) {
      return {
        total_users: 0,
        active_users_today: 0,
        total_xp_earned: 0,
        system_uptime: '99.9%',
        growth: {
          user_growth_month: null,
          active_user_growth_day: null,
          xp_growth_week: null
        }
      };
    }

    // Handle standardized response: {success: true, data: {...}} or legacy format
    const data = extractResponseData(backendData, backendData);
    
    return {
      total_users: data?.total_users || data?.totalUsers || 0,
      active_users_today: data?.active_users_today || data?.active_users || data?.activeUsers || 0,
      total_xp_earned: data?.total_xp_earned || data?.totalXpEarned || 0,
      system_uptime: data?.system_uptime || data?.systemUptime || '99.9%',
      // Include other fields if present
      total_modules: data?.total_modules || data?.totalModules || 0,
      total_lessons: data?.total_lessons || data?.totalLessons || 0,
      total_challenges: data?.total_challenges || data?.totalChallenges || 0,
      timestamp: data?.timestamp || new Date().toISOString(),
      // Growth metrics
      growth: data?.growth || {
        user_growth_month: null,
        active_user_growth_day: null,
        xp_growth_week: null
      }
    };
  }

  async getAllUsers(page = 1, limit = 20, search = '') {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    
    if (search) {
      params.append('search', search);
    }

    const response = await this.request<any>(`/admin/users?${params.toString()}`);
    // Handle standardized paginated response: {success: true, data: {items: [], pagination: {...}}}
    // or legacy format: {users: [], pagination: {}}
    const data = extractResponseData(response, response);
    const users = data?.items || data?.users || [];
    const pagination = data?.pagination || {};
    
    return {
      users: Array.isArray(users) ? users : [],
      pagination: {
        page: pagination.page || page,
        per_page: pagination.per_page || limit,
        pageSize: pagination.per_page || pagination.pageSize || limit,
        total: pagination.total || 0,
        pages: pagination.pages || pagination.total_pages || 0
      }
    };
  }

  async updateUser(userId: string, data: Partial<{
    full_name: string;
    level: number;
    total_xp: number;
    current_streak_days: number;
    is_admin: boolean;
    admin_type: string;
    is_active: boolean;
  }>) {
    return this.request<any>(`/admin/users/${userId}`, 'PUT', data);
  }

  async deleteUser(userId: string) {
    return this.request<any>(`/admin/users/${userId}`, 'DELETE');
  }

  async getUserDetails(userId: string): Promise<any> {
    const res = await this.request<{ success: boolean; user: any }>(`/admin/users/${userId}`);
    // Handle standardized response: {success: true, data: {user: {...}}} or legacy {user: {...}}
    const data = extractResponseData(res, res);
    return data?.user || data || (res as any).user;
  }

  async getUserActivity(userId: string, page = 1, perPage = 20, filters?: {
    action_type?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<{ activities: any[]; pagination: any }> {
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString(),
    });
    if (filters?.action_type) params.append('action_type', filters.action_type);
    if (filters?.start_date) params.append('start_date', filters.start_date);
    if (filters?.end_date) params.append('end_date', filters.end_date);
    return this.request<{ success: boolean; activities: any[]; pagination: any }>(`/admin/users/${userId}/activity?${params.toString()}`);
  }

  async bulkUserOperations(operation: string, userIds: number[]): Promise<any> {
    return this.request('/admin/users/bulk-operations', 'POST', {
      operation,
      user_ids: userIds
    });
  }

  async importUsers(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    const token = this.token || localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/v1/admin/users/import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to import users' }));
      throw new Error(error.error || 'Failed to import users');
    }
    return response.json();
  }

  async exportUsers(format: 'json' | 'csv' = 'json'): Promise<any> {
    const token = this.token || localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/v1/admin/users/export?format=${format}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to export users' }));
      throw new Error(error.error || 'Failed to export users');
    }
    if (format === 'csv') {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      return { success: true, message: 'Users exported successfully' };
    }
    return response.json();
  }

  async reorderTopics(order: Array<{ id: number; order_index: number }>): Promise<any> {
    // Backend returns {success: true, message: "...", data: null}
    // Return the full response so component can check result.success
    return this.request<any>('/content/admin/topics/reorder', 'PUT', { order });
  }

  async reorderModules(order: Array<{ id: number; order_index: number; module_number?: number }>): Promise<any> {
    // Backend returns {success: true, message: "...", data: null}
    // Return the full response so component can check result.success
    return this.request<any>('/content/admin/modules/reorder', 'PUT', { order });
  }

  async reorderLessons(order: Array<{ id: number; order_index: number; lesson_number?: number }>): Promise<any> {
    // Backend returns {success: true, message: "...", data: null}
    // Return the full response so component can check result.success
    return this.request<any>('/content/admin/lessons/reorder', 'PUT', { order });
  }

  async getToolAvailability(): Promise<any> {
    return this.request('/admin/settings/tool_availability');
  }

  async updateToolAvailability(toolAvailability: Record<string, boolean>): Promise<any> {
    return this.request('/admin/settings/tool_availability', 'POST', { tool_availability: toolAvailability });
  }

  async getToolModelPreferences(): Promise<any> {
    return this.request('/admin/settings/tool_model_preferences');
  }

  async updateToolModelPreferences(preferences: Record<string, { provider: string; model: string }>): Promise<any> {
    return this.request('/admin/settings/tool_model_preferences', 'POST', { tool_model_preferences: preferences });
  }

  async getFeatures(): Promise<any> {
    return this.request('/admin/features');
  }

  async createFeature(featureData: { key: string; value: boolean; description?: string }): Promise<any> {
    return this.request('/admin/features', 'POST', featureData);
  }

  async updateFeature(featureId: number, featureData: { value?: boolean; description?: string }): Promise<any> {
    return this.request(`/admin/features/${featureId}`, 'PUT', featureData);
  }

  async deleteFeature(featureId: number): Promise<any> {
    return this.request(`/admin/features/${featureId}`, 'DELETE');
  }

  async getMigrationStatus(): Promise<any> {
    return this.request('/content/admin/migration-status');
  }

  async migrateContent(): Promise<any> {
    return this.request('/content/admin/migrate', 'POST');
  }

  async syncFromJson(forceUpdate = false): Promise<any> {
    return this.request('/content/admin/sync-from-json', 'POST', { force_update: forceUpdate });
  }

  async getAllModules() {
    const res = await this.request<any>('/admin/modules');
    // Handle standardized response: {success: true, data: [...]} (admin endpoint returns array directly)
    // or legacy formats: {success: true, data: {items: []}} or {modules: []}
    const data = extractResponseData(res, res);
    // Admin endpoint returns array directly in data field
    if (Array.isArray(data)) {
      return data;
    }
    // Fallback for other formats
    const modules = data?.items || data?.modules || [];
    return Array.isArray(modules) ? modules : [];
  }


  async getAdminAnalytics() {
    try {
      const res = await this.request<any>('/analytics/admin');
      // Handle standardized response: {success: true, data: {...}}
      const data = extractResponseData(res, res);
      return {
        platformStats: data?.platformStats || data?.platform_stats || {},
        registrationTrends: Array.isArray(data?.registrationTrends) ? data.registrationTrends : 
                          (Array.isArray(data?.registration_trends) ? data.registration_trends : []),
        topModules: Array.isArray(data?.topModules) ? data.topModules : 
                   (Array.isArray(data?.top_modules) ? data.top_modules : []),
        topicPerformance: Array.isArray(data?.topicPerformance) ? data.topicPerformance : 
                         (Array.isArray(data?.topic_performance) ? data.topic_performance : [])
      };
    } catch (error) {
      console.error('Error getting admin analytics:', error);
      return {
        platformStats: {},
        registrationTrends: [],
        topModules: [],
        topicPerformance: []
      };
    }
  }

  async getEngagementAnalytics(timeframe = '30') {
    try {
      const res = await this.request<any>(`/analytics/engagement?timeframe=${timeframe}`);
      // Handle standardized response: {success: true, data: {...}}
      const data = extractResponseData(res, res);
      return {
        dailyActiveUsers: Array.isArray(data?.dailyActiveUsers) ? data.dailyActiveUsers : 
                         (Array.isArray(data?.daily_active_users) ? data.daily_active_users : []),
        retentionData: Array.isArray(data?.retentionData) ? data.retentionData : 
                      (Array.isArray(data?.retention_data) ? data.retention_data : []),
        sessionPatterns: Array.isArray(data?.sessionPatterns) ? data.sessionPatterns : 
                        (Array.isArray(data?.session_patterns) ? data.session_patterns : [])
      };
    } catch (error) {
      console.error('Error getting engagement analytics:', error);
      return {
        dailyActiveUsers: [],
        retentionData: [],
        sessionPatterns: []
      };
    }
  }

  // User Profile & Progress (duplicates removed)
  getUserCertificates(): Promise<any[]> {
    return this.request('/users/certificates');
  }

  // Lesson & Module Progress
  // Note: This is a generic progress update. For specific lesson completion,
  // use completeLessonInModule() or completeLessonByNumber() instead.
  markLessonComplete(lessonId: string, xpEarned: number = 50): Promise<any> {
    return this.request('/progress/update', 'POST', {
      lessonId,
      status: 'completed',
      xp_earned: xpEarned
    });
  }

  completeLessonInModule(moduleId: number, lessonId: number, data: {
    score?: number;
    time_spent?: number;
    xp_earned?: number;
  }, retries: number = 3): Promise<any> {
    const endpoint = `/modules/${moduleId}/lessons/${lessonId}/complete`;
    // Retry logic for critical lesson completion operation (3 retries with exponential backoff)
    return this.requestWithRetry(endpoint, 'POST', data, retries, 1000);
  }

  completeLessonByNumber(moduleNumber: number, lessonNumber: number, data: {
    score?: number;
    time_spent?: number;
    xp_earned?: number;
  }): Promise<any> {
    // Use retry logic for lesson completion (critical operation)
    return this.requestWithRetry(`/modules/${moduleNumber}/lessons/${lessonNumber}/complete-by-number`, 'POST', data, 3, 1000);
  }

  // Helper method for retry logic on critical operations with exponential backoff
  private async requestWithRetry<T>(
    endpoint: string,
    method: string = 'GET',
    data?: any,
    retries: number = 2,
    retryDelay: number = 1000
  ): Promise<T> {
    let lastError: any;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.request<T>(endpoint, method, data);
      } catch (error: any) {
        lastError = error;
        // Only retry on network errors, timeouts, or 5xx errors, not on 4xx (client errors)
        // Use APIError's isRetryable method if available, otherwise check status
        const shouldRetry = attempt < retries && (
          error instanceof APIError 
            ? error.isRetryable()
            : (
                error.status >= 500 || 
                !error.status || // Network error
                error.status === 408 || // Timeout
                error.status === 429 || // Rate limit
                error.message?.includes('timeout') ||
                error.message?.includes('Failed to fetch') ||
                error.message?.includes('network') ||
                error.name === 'AbortError'
              )
        );
        
        if (shouldRetry) {
          // Exponential backoff: wait 1s, 2s, 4s... with jitter
          const delay = retryDelay * Math.pow(2, attempt) + Math.random() * 1000;
          console.warn(`API request failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${Math.round(delay)}ms...`, endpoint);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  // Public method for retrying requests (can be used by components)
  async retryRequest<T>(
    endpoint: string,
    method: string = 'GET',
    data?: any,
    options?: { retries?: number; retryDelay?: number }
  ): Promise<T> {
    const retries = options?.retries ?? 2;
    const retryDelay = options?.retryDelay ?? 1000;
    return this.requestWithRetry<T>(endpoint, method, data, retries, retryDelay);
  }

  updateModuleProgress(moduleId: string, progress: number): Promise<any> {
    return this.request('/progress/update', 'POST', {
      moduleId,
      progress_percentage: progress
    });
  }

  // Tools & Utilities
  getAvailableTools(): Promise<any[]> {
    return this.request('/ai-tools/available');
  }

  getUserToolStats(): Promise<any> {
    return this.request('/ai-tools/user-stats');
  }

  trackToolUsage(toolId: string, action: string): Promise<any> {
    return this.request(`/ai-tools/${toolId}/track-usage`, 'POST', { action });
  }

  // Prompt Engineering & OpenAI Integration
  async getPromptTechniques(): Promise<any[]> {
    try {
      const response = await this.request('/prompt-techniques');
      return Array.isArray(response) ? response : [];
    } catch (error) {
      // Endpoint doesn't exist yet, return empty array
      console.warn('Prompt techniques endpoint not available, returning empty array');
      return [];
    }
  }

  testPromptWithOpenAI(prompt: string, model: string = 'gpt-4'): Promise<{
    response: string;
    tokens_used: number;
    model: string;
    timestamp: string;
  }> {
    return this.request('/openai/test-prompt', 'POST', { prompt, model });
  }

  gradePrompt(prompt: string, criteria: string[]): Promise<{
    score: number;
    feedback: string;
    suggestions: string[];
    breakdown: any;
  }> {
    return this.request('/openai/grade-prompt', 'POST', { prompt, criteria });
  }

  async translatePrompt(prompt: string, sourceModel: string, targetModel: string): Promise<{
    translated_prompt: string;
    explanation: string;
    tips: string[];
  }> {
    // Try openai endpoint first (primary), fallback to ai-tools if needed
    try {
      const response = await this.request<any>('/openai/translate-prompt', 'POST', { 
        prompt, 
        sourceModel, 
        targetModel 
      });
      // Handle standardized response: {success: true, data: {...}}
      const data = extractResponseData(response, response);
      return {
        translated_prompt: data?.translated_prompt || data?.translatedPrompt || '',
        explanation: data?.explanation || '',
        tips: Array.isArray(data?.tips) ? data.tips : []
      };
    } catch (error) {
      // Fallback to ai-tools endpoint if openai endpoint fails
      const response = await this.request<any>('/ai-tools/translate-prompt', 'POST', { 
        prompt, 
        sourceModel, 
        targetModel 
      });
      // Handle standardized response: {success: true, data: {...}}
      const data = extractResponseData(response, response);
      return {
        translated_prompt: data?.translated_prompt || data?.translatedPrompt || '',
        explanation: data?.explanation || '',
        tips: Array.isArray(data?.tips) ? data.tips : []
      };
    }
  }

  optimizePrompt(prompt: string, goal: string): Promise<{
    optimized_prompt: string;
    improvements: string[];
    explanation: string;
  }> {
    return this.request('/openai/optimize-prompt', 'POST', { prompt, goal });
  }

  // OpenAI API Management
  getOpenAIConfig(): Promise<{
    models: string[];
    max_tokens: number;
    temperature: number;
    api_key_configured: boolean;
  }> {
    return this.request('/ai-tools/config');
  }

  updateOpenAIConfig(config: any): Promise<any> {
    return this.request('/openai/config', 'PUT', config);
  }

  getOpenAIUsage(): Promise<{
    tokens_used_today: number;
    tokens_used_month: number;
    cost_today: number;
    cost_month: number;
    requests_today: number;
  }> {
    return this.request('/ai-tools/usage');
  }

  // Creative Writing & Content Generation
  getCreativeWritingTemplates(): Promise<any[]> {
    return this.request('/creative-writing/templates');
    return this.request('/creative-writing/templates');
  }

  generateCreativeContent(params: {
    prompt: string;
    genre: string;
    wordCount: number;
    title: string;
    toolPath?: string;
  }): Promise<{
    content: string;
    word_count: number;
    model: string;
    timestamp: string;
  }> {
    // Add default toolPath if not provided
    const payload = {
      ...params,
      toolPath: params.toolPath || '/creative-writing'
    };
    return this.request('/ai-tools/generate-creative-content', 'POST', payload);
  }

  getUserWritings(): Promise<any[]> {
    return this.request('/creative-writing/user-writings');
  }

  saveWriting(writing: any): Promise<any> {
    return this.request('/creative-writing/save', 'POST', writing);
  }

  // Image Generation & Visual Content
  generateImage(prompt: string, style: string = 'realistic', toolPath?: string): Promise<{
    image_url: string;
    prompt: string;
    model: string;
    timestamp: string;
  }> {
    return this.request('/openai/generate-image', 'POST', { 
      prompt, 
      style,
      toolPath: toolPath || '/image-prompt-mastery'
    });
  }

  getImagePromptTemplates(): Promise<any[]> {
    return this.request('/image-prompts/templates');
  }

  getImagePromptExamples(): Promise<any[]> {
    return this.request('/image-prompts/examples');
  }

  // Code Generation
  generateCode(prompt: string, language: string = 'javascript', toolPath?: string): Promise<{
    code: string;
    explanation: string;
    language: string;
    model: string;
  }> {
    return this.request('/openai/generate-code', 'POST', { 
      prompt, 
      language,
      toolPath: toolPath || '/code-generation-workshop'
    });
  }

  getCodeTemplates(): Promise<any[]> {
    return this.request('/code-generation/templates');
    return this.request('/code-generation/templates');
  }

  // Content Management
  async getContentUploads(): Promise<any[]> {
    // Backend content API: /api/v1/content/admin/uploads
    const res = await this.request<any>('/content/admin/uploads');
    const data = extractResponseData(res, res);
    return Array.isArray(data) ? data : [];
  }

  uploadContentFile(formData: FormData): Promise<any> {
    // Backend media API: /api/v1/media/upload
    return fetch(`${API_BASE_URL}/media/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
      body: formData,
    }).then(response => {
      if (!response.ok) throw new Error(`${response.status}`);
      return response.json();
    });
  }

  deleteContentUpload(uploadId: number): Promise<any> {
    return this.request(`/media/files/${uploadId}`, 'DELETE');
  }

  async getTopicContent(topicNumber: number): Promise<any> {
    const response = await this.request(`/content/topic/${topicNumber}`);
    // Handle standardized response: {success: true, data: {...}}
    return extractResponseData(response, response);
  }

  async getLessonExercises(lessonKey: string): Promise<any> {
    const response = await this.request(`/quiz/lesson-exercises/${lessonKey}`);
    // Handle standardized response: {success: true, data: {exercises: [...]}}
    const data = extractResponseData(response, response);
    return data?.exercises || data || [];
  }

  async getReviewQuestions(limit: number = 10): Promise<any[]> {
    const response = await this.request(`/quiz/review-questions?limit=${limit}`);
    // Handle standardized response: {success: true, data: {questions: [...]}}
    const data = extractResponseData(response, response);
    return data?.questions || (Array.isArray(data) ? data : []);
  }

  async getActivityCategories(): Promise<any[]> {
    const response = await this.request('/activities/categories');
    // Handle standardized response: {success: true, data: [...]} or {success: true, data: {categories: [...]}}
    const data = extractResponseData(response, response);
    return data?.categories || (Array.isArray(data) ? data : []);
  }

  async getCodeGenerationTemplates(): Promise<any[]> {
    const response = await this.request('/templates/code-generation/templates');
    // Handle standardized response: {success: true, data: [...]}
    const data = extractResponseData(response, response);
    return Array.isArray(data) ? data : [];
  }

  async getChallengeConfig(): Promise<any> {
    const response = await this.request('/system-config/challenges');
    // Handle standardized response: {success: true, data: {config: {...}}}
    const data = extractResponseData(response, response);
    return data?.config || data || {};
  }

  async updateChallengeConfig(config: any): Promise<any> {
    return this.request('/admin/content/challenges', 'PUT', config);
  }

  async updateXPConfig(config: any): Promise<any> {
    return this.request('/admin/xp/config', 'PUT', { config });
  }

  async updateUserAdminStatus(userId: string, isAdmin: boolean, adminType?: string): Promise<any> {
    return this.request(`/admin/users/${userId}/admin`, 'PUT', { 
      is_admin: isAdmin, 
      admin_type: adminType 
    });
  }

  async updateUserAdminType(userId: string, adminType: string): Promise<any> {
    return this.request(`/admin/users/${userId}/admin-type`, 'PUT', { admin_type: adminType });
  }

  async lockUser(userId: string, locked: boolean): Promise<any> {
    return this.request(`/admin/users/${userId}/lock`, 'PUT', { locked });
  }

  async updateUserStatus(userId: string, isActive: boolean): Promise<any> {
    return this.request(`/admin/users/${userId}`, 'PUT', { is_active: isActive });
  }

  async getUserPermissions(userId: string): Promise<any> {
    const res = await this.request<{ success: boolean; permissions: any[] }>(`/admin/users/${userId}/permissions`);
    return res?.permissions || [];
  }

  async grantUserPermission(userId: string, permission: string): Promise<any> {
    return this.request(`/admin/users/${userId}/permissions`, 'POST', { permission });
  }

  async revokeUserPermission(userId: string, permission: string): Promise<any> {
    return this.request(`/admin/users/${userId}/permissions/${permission}`, 'DELETE');
  }

  async getClientLearners(clientId: number): Promise<any[]> {
    try {
      const response = await this.request(`/admin/clients/${clientId}/learners`);
      // Handle standardized response: {success: true, data: {learners: [...]}}
      const data = extractResponseData(response, response);
      // Handle both {learners: []} and direct array formats
      if (Array.isArray(data)) {
        return data;
      }
      return data?.learners || data?.items || [];
    } catch (error) {
      console.error('Error getting client learners:', error);
      return [];
    }
  }

  async getClientAnalytics(clientId: number): Promise<any> {
    try {
      const response = await this.request(`/admin/clients/${clientId}/analytics`);
      // Handle standardized response: {success: true, data: {analytics: {...}}}
      const data = extractResponseData(response, response);
      // Handle both {analytics: {...}} and direct object formats
      return data?.analytics || data || {};
    } catch (error) {
      console.error('Error getting client analytics:', error);
      return {};
    }
  }

  // Learner Management Methods
  async getLearners(params?: {
    page?: number;
    page_size?: number;
    search?: string;
    subscription_status?: string;
    is_active?: string;
    level?: string;
    client_id?: string;
  }): Promise<any> {
    try {
      const queryParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            queryParams.append(key, value.toString());
          }
        });
      }
      const response = await this.request<any>(`/admin/learners?${queryParams.toString()}`);
      return response;
    } catch (error) {
      console.error('Error getting learners:', error);
      throw error;
    }
  }

  async getLearnerActivities(learnerId: number): Promise<any> {
    try {
      const response = await this.request<any>(`/admin/learners/${learnerId}/activities`);
      return response;
    } catch (error) {
      console.error('Error getting learner activities:', error);
      throw error;
    }
  }

  async getLearnerAchievements(learnerId: number): Promise<any> {
    try {
      const response = await this.request<any>(`/admin/learners/${learnerId}/achievements`);
      return response;
    } catch (error) {
      console.error('Error getting learner achievements:', error);
      throw error;
    }
  }

  async getLearnerCertifications(learnerId: number): Promise<any> {
    try {
      const response = await this.request<any>(`/admin/learners/${learnerId}/certifications`);
      return response;
    } catch (error) {
      console.error('Error getting learner certifications:', error);
      throw error;
    }
  }

  async getLearnerSessions(learnerId: number): Promise<any> {
    try {
      const response = await this.request<any>(`/admin/learners/${learnerId}/sessions`);
      return response;
    } catch (error) {
      console.error('Error getting learner sessions:', error);
      throw error;
    }
  }

  async getLearnerCompetitions(learnerId: number): Promise<any[]> {
    try {
      const response = await this.request(`/admin/learners/${learnerId}/competitions`);
      const data = extractResponseData(response, response);
      return data?.competitions || data?.items || [];
    } catch (error) {
      console.error('Error getting learner competitions:', error);
      return [];
    }
  }

  async getLearnerCompetitionDetails(learnerId: number, competitionId: string): Promise<any> {
    try {
      const response = await this.request(`/admin/learners/${learnerId}/competitions/${competitionId}`);
      const data = extractResponseData(response, response);
      return data?.participation || data || {};
    } catch (error) {
      console.error('Error getting learner competition details:', error);
      return {};
    }
  }

  async updateLearnerCompetition(learnerId: number, competitionId: string, data: { status?: string; xp_earned?: number; final_score?: number; position?: number; prize_received?: string }): Promise<any> {
    try {
      const response = await this.request(`/admin/learners/${learnerId}/competitions/${competitionId}`, 'PUT', data);
      return extractResponseData(response, response);
    } catch (error) {
      console.error('Error updating learner competition:', error);
      throw error;
    }
  }

  async updateLearnerXP(learnerId: number, amount: number, operation: string = 'add', reason?: string): Promise<any> {
    try {
      const response = await this.request(`/admin/learners/${learnerId}/xp`, 'POST', {
        amount: operation === 'add' ? amount : -amount,
        reason: reason || 'Manual adjustment'
      });
      const data = extractResponseData(response, response);
      return data;
    } catch (error) {
      console.error('Error updating learner XP:', error);
      throw error;
    }
  }

  async upgradeLearnerSubscription(learnerId: number): Promise<any> {
    try {
      const response = await this.request(`/admin/learners/${learnerId}/subscription/upgrade`, 'POST');
      return extractResponseData(response, response);
    } catch (error) {
      console.error('Error upgrading learner subscription:', error);
      throw error;
    }
  }

  async downgradeLearnerSubscription(learnerId: number): Promise<any> {
    try {
      const response = await this.request(`/admin/learners/${learnerId}/subscription/downgrade`, 'POST');
      return extractResponseData(response, response);
    } catch (error) {
      console.error('Error downgrading learner subscription:', error);
      throw error;
    }
  }

  async updateSubscriptionDates(userId: number, dates: { subscription_start_date?: string; subscription_end_date?: string }): Promise<any> {
    try {
      const response = await this.request(`/admin/subscriptions/${userId}/dates`, 'PUT', dates);
      return extractResponseData(response, response);
    } catch (error) {
      console.error('Error updating subscription dates:', error);
      throw error;
    }
  }

  async sendAdminNotification(userId: number, notification: { type: string; title: string; message: string; metadata?: any; action_url?: string; action_text?: string }): Promise<any> {
    try {
      const response = await this.request(`/notifications/admin/notify/${userId}`, 'POST', notification);
      return extractResponseData(response, response);
    } catch (error) {
      console.error('Error sending admin notification:', error);
      throw error;
    }
  }

  async resetUserPassword(userId: number, newPassword?: string): Promise<any> {
    try {
      const payload = newPassword ? { new_password: newPassword } : {};
      const response = await this.request(`/users/${userId}/reset-password`, 'POST', payload);
      return extractResponseData(response, response);
    } catch (error) {
      console.error('Error resetting user password:', error);
      throw error;
    }
  }

  // AI Tools and Limits
  async getAITools(): Promise<any[]> {
    try {
      const response = await this.request('/admin/ai/tools');
      const data = extractResponseData(response, response);
      return data?.tools || data?.items || (Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error getting AI tools:', error);
      return [];
    }
  }

  async getAIUserLimits(userId: number): Promise<any> {
    try {
      const response = await this.request(`/admin/ai/users/${userId}/limits`);
      return extractResponseData(response, response);
    } catch (error) {
      console.error('Error getting AI user limits:', error);
      return {};
    }
  }

  async updateAIUserLimits(userId: number, limits: any): Promise<any> {
    try {
      const response = await this.request(`/admin/ai/users/${userId}/limits`, 'PUT', limits);
      return extractResponseData(response, response);
    } catch (error) {
      console.error('Error updating AI user limits:', error);
      throw error;
    }
  }

  // Competition Management
  async toggleCompetition(competitionId: string, enabled: boolean): Promise<any> {
    try {
      const response = await this.request(`/admin/competitions/${competitionId}/toggle`, 'PUT', { is_active: enabled });
      return extractResponseData(response, response);
    } catch (error) {
      console.error('Error toggling competition:', error);
      throw error;
    }
  }

  // Content Admin endpoints
  async getAdminTopics(page = 1, perPage = 20): Promise<{ topics: any[]; total: number; pages: number; current_page: number; }> {
    const res = await this.request<any>(`/content/admin/topics?page=${page}&per_page=${perPage}`);
    const data = extractResponseData(res, res);
    // Handle paginated response: { items: [...], pagination: {...} }
    if (data && data.items) {
      return {
        topics: data.items,
        total: data.pagination?.total || data.items.length,
        pages: data.pagination?.total_pages || 1,
        current_page: data.pagination?.page || page
      };
    }
    // Fallback for non-paginated response
    return {
      topics: Array.isArray(data) ? data : [],
      total: Array.isArray(data) ? data.length : 0,
      pages: 1,
      current_page: page
    };
  }

  async getAdminModules(topicId?: number, page = 1, perPage = 20): Promise<{ modules: any[]; total: number; pages: number; current_page: number; }> {
    const qp = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    if (typeof topicId === 'number') qp.append('topic_id', String(topicId));
    const res = await this.request<any>(`/content/admin/modules?${qp.toString()}`);
    const data = extractResponseData(res, res);
    // Handle paginated response: { items: [...], pagination: {...} }
    if (data && data.items) {
      return {
        modules: data.items,
        total: data.pagination?.total || data.items.length,
        pages: data.pagination?.total_pages || 1,
        current_page: data.pagination?.page || page
      };
    }
    // Fallback for non-paginated response
    return {
      modules: Array.isArray(data) ? data : [],
      total: Array.isArray(data) ? data.length : 0,
      pages: 1,
      current_page: page
    };
  }

  async getAdminLessons(moduleId?: number, page = 1, perPage = 20): Promise<{ lessons: any[]; total: number; pages: number; current_page: number; }> {
    const qp = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    if (typeof moduleId === 'number') qp.append('module_id', String(moduleId));
    const res = await this.request<any>(`/content/admin/lessons?${qp.toString()}`);
    const data = extractResponseData(res, res);
    // Handle paginated response: { items: [...], pagination: {...} }
    if (data && data.items) {
      return {
        lessons: data.items,
        total: data.pagination?.total || data.items.length,
        pages: data.pagination?.total_pages || 1,
        current_page: data.pagination?.page || page
      };
    }
    // Fallback for non-paginated response
    return {
      lessons: Array.isArray(data) ? data : [],
      total: Array.isArray(data) ? data.length : 0,
      pages: 1,
      current_page: page
    };
  }

  // Update endpoints for admin content editing
  async updateTopic(topicId: number, data: any): Promise<any> {
    return this.request(`/content/admin/topics/${topicId}`, 'PUT', data);
  }

  async updateModule(moduleId: number, data: any): Promise<any> {
    return this.request(`/content/admin/modules/${moduleId}`, 'PUT', data);
  }

  async updateLesson(lessonId: number, data: any): Promise<any> {
    return this.request(`/content/admin/lessons/${lessonId}`, 'PUT', data);
  }

  // Create endpoints for admin content management
  async getContentAdminTopics(page = 1, per_page = 100): Promise<any> {
    const res = await this.request<any>(`/content/admin/topics?page=${page}&per_page=${per_page}`);
    const data = extractResponseData(res, res);
    // Handle paginated response: {items: [], pagination: {...}}
    if (data && typeof data === 'object' && 'items' in data) {
      return data;
    }
    // Handle direct array
    if (Array.isArray(data)) {
      return { items: data, pagination: { page, per_page, total: data.length } };
    }
    return { items: [], pagination: { page, per_page, total: 0 } };
  }

  async createTopic(data: any): Promise<any> {
    return this.request('/content/admin/topics', 'POST', data);
  }

  async createModule(data: any): Promise<any> {
    return this.request('/content/admin/modules', 'POST', data);
  }

  async createLesson(data: any): Promise<any> {
    return this.request('/content/admin/lessons', 'POST', data);
  }

  // Delete endpoints for admin content management
  async deleteTopic(topicId: number): Promise<any> {
    return this.request(`/content/admin/topics/${topicId}`, 'DELETE');
  }

  async deleteModule(moduleId: number): Promise<any> {
    return this.request(`/content/admin/modules/${moduleId}`, 'DELETE');
  }

  async deleteLesson(lessonId: number): Promise<any> {
    return this.request(`/content/admin/lessons/${lessonId}`, 'DELETE');
  }

  // Admin Users
  async createAdminUser(data: {
    email: string;
    password: string;
    name?: string;
    is_admin?: boolean;
    admin_type?: 'super_admin' | 'content_admin';
    is_active?: boolean;
  }): Promise<any> {
    return this.request('/admin/users', 'POST', data);
  }

  // Challenges API
  getChallenges(): Promise<any[]> {
    return this.request('/challenges');
  }

  getChallenge(challengeId: number): Promise<any> {
    return this.request(`/challenges/${challengeId}`);
  }

  submitChallengeAttempt(challengeId: number, userAnswer: any, timeTaken?: number): Promise<any> {
    return this.request(`/challenges/${challengeId}/attempt`, 'POST', {
      user_answer: userAnswer,
      time_taken_seconds: timeTaken
    });
  }

  // Admin Challenge Management
  createChallenge(challengeData: any): Promise<any> {
    // Map frontend fields to backend schema
    const payload: any = {
      title: challengeData.title,
      description: challengeData.description || '',
      challenge_type: challengeData.type, // e.g., multiple_choice, true_false, etc.
      difficulty: (
        challengeData.difficulty === 'beginner' ? 'easy' :
        challengeData.difficulty === 'intermediate' ? 'medium' :
        challengeData.difficulty === 'advanced' ? 'hard' : (challengeData.difficulty || 'medium')
      ),
      time_limit: challengeData.time_limit_minutes ?? undefined,
      xp_reward: challengeData.xp_reward ?? 0,
      status: challengeData.is_active === false ? 'inactive' : 'active',
      requirements: challengeData.challenge_data || {},
      instructions: challengeData.description || ''
      // start_date / end_date omitted to use backend defaults
    };
    return this.request('/admin/challenges', 'POST', payload);
  }

  updateChallenge(challengeId: number, challengeData: any): Promise<any> {
    const payload: any = {
      title: challengeData.title,
      description: challengeData.description || '',
      challenge_type: challengeData.type,
      difficulty: (
        challengeData.difficulty === 'beginner' ? 'easy' :
        challengeData.difficulty === 'intermediate' ? 'medium' :
        challengeData.difficulty === 'advanced' ? 'hard' : (challengeData.difficulty || undefined)
      ),
      time_limit: challengeData.time_limit_minutes ?? undefined,
      xp_reward: challengeData.xp_reward ?? undefined,
      status: challengeData.is_active === false ? 'inactive' : 'active',
      requirements: challengeData.challenge_data ?? undefined,
      instructions: challengeData.description ?? undefined
    };
    return this.request(`/admin/challenges/${challengeId}`, 'PUT', payload);
  }

  deleteChallenge(challengeId: number): Promise<any> {
    return this.request(`/admin/challenges/${challengeId}`, 'DELETE');
  }

  async getAdminChallenges(): Promise<any[]> {
    const res = await this.request<any>('/admin/challenges');
    // Handle standardized response: {success: true, data: {items: []}} or legacy {challenges: []}
    const data = extractResponseData(res, res);
    const challenges = data?.items || data?.challenges || res?.challenges || [];
    return Array.isArray(challenges) ? challenges : [];
  }

  // AI Model Management
  async getAIModels(): Promise<any[]> {
    const res = await this.request<any>('/admin/ai/models');
    // Handle standardized response: {success: true, data: [...]} or legacy formats
    const data = extractResponseData(res, res);
    const models = data?.items || data?.models || (Array.isArray(data) ? data : []);
    return Array.isArray(models) ? models : [];
  }

  async createAIModel(modelData: any): Promise<any> {
    return this.request('/admin/ai/models', 'POST', modelData);
  }

  async updateAIModel(modelId: number, modelData: any): Promise<any> {
    return this.request(`/admin/ai/models/${modelId}`, 'PUT', modelData);
  }

  async getAIUsageStats(days?: number): Promise<any> {
    const params = days ? `?days=${days}` : '';
    return this.request(`/admin/ai/usage${params}`);
  }

  async setAILimits(limits: any): Promise<any> {
    return this.request('/admin/ai/limits', 'POST', limits);
  }

  // System Monitoring
  async getSystemHealth(): Promise<any> {
    const backendData = await this.request<any>('/admin/system/health').catch(() => null);
    // Transform backend response to frontend format
    return this.transformSystemHealth(backendData);
  }

  private transformSystemHealth(backendData: any) {
    // Handle standardized response: {success: true, data: {...}}
    const data = extractResponseData(backendData, backendData);
    
    // Handle nested system_health structure from backend
    const systemHealth = data?.system_health || data;
    const overallStatus = data?.overall_status || systemHealth?.overall_status || systemHealth?.status || 'healthy';
    
    // Ensure load_average is always a 3-element array
    const cpuData = systemHealth?.cpu || data?.cpu || {};
    const loadAverage = cpuData?.load_average || [];
    const safeLoadAverage = Array.isArray(loadAverage) && loadAverage.length >= 3
      ? loadAverage.slice(0, 3)
      : Array.isArray(loadAverage) && loadAverage.length > 0
      ? [...loadAverage, ...Array(3 - loadAverage.length).fill(0)]
      : [0, 0, 0];
    
    // Build complete SystemMetrics object with all required properties
    return {
      status: overallStatus,
      uptime: systemHealth?.uptime || data?.uptime || systemHealth?.system_uptime || '99.9%',
      response_time: systemHealth?.response_time || data?.response_time || 0,
      error_rate: systemHealth?.error_rate || data?.error_rate || 0,
      throughput: systemHealth?.throughput || data?.throughput || 0,
      cpu: {
        usage: cpuData?.usage || cpuData?.percentage || 0,
        percentage: cpuData?.usage || cpuData?.percentage || 0, // Include both for compatibility
        cores: cpuData?.cores || 4,
        temperature: cpuData?.temperature || 0,
        load_average: safeLoadAverage
      },
      memory: {
        total: systemHealth?.memory?.total || data?.memory?.total || 0,
        used: systemHealth?.memory?.used || data?.memory?.used || 0,
        available: systemHealth?.memory?.available || data?.memory?.available || 0,
        percentage: (() => {
          const memData = systemHealth?.memory || data?.memory || {};
          if (memData.percentage !== undefined) return Math.round(memData.percentage * 10) / 10;
          if (memData.used && memData.total) return Math.round((memData.used / memData.total * 100) * 10) / 10;
          return 0;
        })()
      },
      disk: {
        total: systemHealth?.disk?.total || data?.disk?.total || 0,
        used: systemHealth?.disk?.used || data?.disk?.used || 0,
        available: systemHealth?.disk?.available || data?.disk?.available || systemHealth?.disk?.free || 0,
        percentage: (() => {
          const diskData = systemHealth?.disk || data?.disk || {};
          if (diskData.percentage !== undefined) return Math.round(diskData.percentage * 10) / 10;
          if (diskData.used && diskData.total) return Math.round((diskData.used / diskData.total * 100) * 10) / 10;
          return 0;
        })()
      },
      network: {
        bytes_sent: systemHealth?.network?.bytes_sent || data?.network?.bytes_sent || 0,
        bytes_received: systemHealth?.network?.bytes_received || data?.network?.bytes_received || 0,
        packets_sent: systemHealth?.network?.packets_sent || data?.network?.packets_sent || 0,
        packets_received: systemHealth?.network?.packets_received || data?.network?.packets_received || 0
      },
      database: {
        connections: systemHealth?.database?.connections || data?.database?.connections || 0,
        max_connections: systemHealth?.database?.max_connections || data?.database?.max_connections || 100,
        query_time: systemHealth?.database?.query_time || data?.database?.query_time || 0,
        slow_queries: systemHealth?.database?.slow_queries || data?.database?.slow_queries || 0
      },
      alerts: data?.alerts || systemHealth?.alerts || []
    };
  }

  async getSystemLogs(days?: number): Promise<any> {
    const params = days ? `?days=${days}` : '';
    const res = await this.request<any>(`/admin/system/logs${params}`).catch(() => null);
    // Handle standardized response: {success: true, data: {logs: []}}
    if (!res) return { logs: [], admin_logs: [] };
    const data = extractResponseData(res, res);
    return {
      logs: data?.logs || [],
      admin_logs: data?.logs || data?.admin_logs || []
    };
  }

  async getSystemPerformance(days?: number): Promise<any> {
    const params = days ? `?days=${days}` : '';
    return this.request(`/admin/system/performance${params}`);
  }

  async setMaintenanceMode(enabled: boolean): Promise<any> {
    return this.request('/admin/system/maintenance', 'POST', { maintenance_mode: enabled });
  }

  // Analytics
  async getAnalyticsUsers(days?: number): Promise<any> {
    const params = days ? `?days=${days}` : '';
    const backendData = await this.request<any>(`/admin/analytics/users${params}`);
    // Transform backend response to frontend format
    return this.transformAnalyticsUsers(backendData);
  }

  private transformAnalyticsUsers(backendData: any) {
    if (!backendData) {
      return { engagement_summary: {} };
    }

    // Handle standardized response: {success: true, data: {...}}
    const data = extractResponseData(backendData, backendData);
    
    // Return engagement_summary if available, otherwise return the whole response
    return {
      engagement_summary: data?.engagement_summary || data?.engagementSummary || data || {},
      user_growth: data?.user_growth || [],
      engagement_metrics: data?.engagement_metrics || {}
    };
  }

  async getAnalyticsContent(): Promise<any> {
    const backendData = await this.request<any>('/admin/analytics/content');
    // Transform backend response to frontend format
    return this.transformAnalyticsContent(backendData);
  }

  private transformAnalyticsContent(backendData: any) {
    if (!backendData) {
      return {
        content_summary: {},
        module_stats: [],
        popular_content: []
      };
    }

    // Handle standardized response: {success: true, data: {...}}
    const data = extractResponseData(backendData, backendData);
    
    // Ensure content summary is properly formatted
    // Backend returns content_summary as an object with keys like 'module_1', 'lesson_1', etc.
    const contentSummary = data?.content_summary || data?.contentSummary || {};
    
    return {
      content_summary: contentSummary,
      module_stats: data?.module_stats || data?.moduleStats || [],
      popular_content: data?.popular_content || data?.popularContent || []
    };
  }

  async getAnalyticsRevenue(days?: number): Promise<any> {
    const params = days ? `?days=${days}` : '';
    return this.request(`/admin/analytics/revenue${params}`);
  }

  async exportAnalytics(type: string, format: string): Promise<any> {
    return this.request(`/admin/analytics/export?type=${type}&format=${format}`);
  }

  // Certification Management
  async getCertificateTemplates(): Promise<any[]> {
    const res = await this.request<any>('/admin/certificates/templates');
    // Extract from standardized APIResponse format: { success: true, data: { templates: [...] } }
    if (res?.data?.templates && Array.isArray(res.data.templates)) {
      return res.data.templates;
    }
    // Fallback for direct array or other formats
    if (Array.isArray((res as any).templates)) {
      return (res as any).templates;
    }
    if (Array.isArray(res)) {
      return res;
    }
    return [];
  }

  async createCertificateTemplate(templateData: any): Promise<any> {
    return this.request('/admin/certificates/templates', 'POST', templateData);
  }

  async updateCertificateTemplate(templateId: number, templateData: any): Promise<any> {
    return this.request(`/admin/certificates/templates/${templateId}`, 'PUT', templateData);
  }

  async getCertificateTemplate(templateId: number): Promise<any> {
    const res = await this.request<any>(`/admin/certificates/templates/${templateId}`);
    // Extract from standardized APIResponse format: { success: true, data: { template: {...} } }
    if (res?.data?.template) {
      return res.data.template;
    }
    // Fallback for direct template property
    if ((res as any).template) {
      return (res as any).template;
    }
    return res;
  }

  async deleteCertificateTemplate(templateId: number): Promise<any> {
    return this.request(`/admin/certificates/templates/${templateId}`, 'DELETE');
  }

  async getIssuedCertificates(): Promise<any[]> {
    const res = await this.request<any>('/admin/certificates/issued');
    // Extract from standardized APIResponse format
    // Paginated format: { success: true, data: { items: [...], pagination: {...} } }
    if (res?.data?.items && Array.isArray(res.data.items)) {
      return res.data.items;
    }
    // Non-paginated format: { success: true, data: { certificates: [...] } }
    if (res?.data?.certificates && Array.isArray(res.data.certificates)) {
      return res.data.certificates;
    }
    // Fallback for direct array or other formats
    if (Array.isArray((res as any).certificates)) {
      return (res as any).certificates;
    }
    if (Array.isArray(res)) {
      return res;
    }
    return [];
  }

  async issueCertificate(certificateData: any): Promise<any> {
    return this.request('/admin/certificates/issue', 'POST', certificateData);
  }

  async verifyCertificate(certificateNumber: string): Promise<any> {
    return this.request('/admin/certificates/verify', 'POST', { certificate_number: certificateNumber });
  }

  async previewCertificateTemplate(templateId: number): Promise<any> {
    return this.request(`/certificates/templates/${templateId}/preview-template`);
  }

  async previewCertificate(templateId: number, userId?: number): Promise<any> {
    const params = userId ? `?user_id=${userId}` : '';
    return this.request(`/certificates/templates/${templateId}/preview${params}`);
  }

  async uploadCertificateSignature(templateId: number, file: File): Promise<any> {
    const formData = new FormData();
    formData.append('signature', file);
    // Use fetch directly for FormData uploads
    const token = this.token || localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/v1/admin/certificates/templates/${templateId}/signature`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to upload signature' }));
      throw new Error(error.error || 'Failed to upload signature');
    }
    
    return response.json();
  }

  async getEligibleLearners(templateId: number): Promise<any> {
    const res = await this.request<{ eligible_learners: any[] }>(`/admin/certificates/templates/${templateId}/eligible-learners`);
    return {
      eligible_learners: (res as any).eligible_learners || [],
      eligible_count: (res as any).eligible_count || 0
    };
  }

  async getLearnerCertificates(learnerId: number): Promise<any[]> {
    // This will get certificates for a specific learner
    const res = await this.request<{ certificates: any[] }>(`/certificates/admin/all?user_id=${learnerId}`);
    return Array.isArray((res as any).certificates) ? (res as any).certificates : [];
  }

  // Notification Management
  async getNotificationTemplates(): Promise<any[]> {
    const res = await this.request<{ templates: any[] }>('/admin/notifications/templates');
    return Array.isArray((res as any).templates) ? (res as any).templates : [];
  }

  async createNotificationTemplate(templateData: any): Promise<any> {
    return this.request('/admin/notifications/templates', 'POST', templateData);
  }

  async getNotificationCampaigns(): Promise<any[]> {
    const res = await this.request<{ campaigns: any[] }>('/admin/notifications/campaigns');
    return Array.isArray((res as any).campaigns) ? (res as any).campaigns : [];
  }

  async createNotificationCampaign(campaignData: any): Promise<any> {
    return this.request('/admin/notifications/campaigns', 'POST', campaignData);
  }

  async getNotificationLogs(): Promise<any[]> {
    const res = await this.request<{ logs: any[] }>('/admin/notifications/logs');
    return Array.isArray((res as any).logs) ? (res as any).logs : [];
  }

  async getNotificationDeliveryLogs(days?: number): Promise<any> {
    const params = days ? `?days=${days}` : '';
    return this.request(`/admin/notifications/delivery-logs${params}`);
  }

  // Integration Management
  async getAPIKeys(): Promise<any[]> {
    const res = await this.request<any>('/admin/integrations/api-keys');
    // Handle standardized response format: {success: true, data: {api_keys: [...]}}
    const data = extractResponseData(res, { api_keys: [] });
    return Array.isArray(data.api_keys) ? data.api_keys : (Array.isArray(data) ? data : []);
  }

  async createAPIKey(keyData: any): Promise<any> {
    return this.request('/admin/integrations/api-keys', 'POST', keyData);
  }

  async getWebhooks(): Promise<any[]> {
    const res = await this.request<{ webhooks: any[] }>('/admin/integrations/webhooks');
    return Array.isArray((res as any).webhooks) ? (res as any).webhooks : [];
  }

  async createWebhook(webhookData: any): Promise<any> {
    return this.request('/admin/integrations/webhooks', 'POST', webhookData);
  }

  async getThirdPartyIntegrations(): Promise<any[]> {
    const res = await this.request<{ integrations: any[] }>('/admin/integrations/third-party');
    return Array.isArray((res as any).integrations) ? (res as any).integrations : [];
  }

  async getIntegrations(): Promise<any[]> {
    const res = await this.request<{ integrations: any[] }>('/admin/integrations');
    return Array.isArray((res as any).integrations) ? (res as any).integrations : [];
  }

  async createThirdPartyIntegration(integrationData: any): Promise<any> {
    return this.request('/admin/integrations/third-party', 'POST', integrationData);
  }

  // Security & Compliance
  async getSecurityPolicies(): Promise<any[]> {
    const res = await this.request<{ policies: any[] }>('/admin/security/policies');
    return Array.isArray((res as any).policies) ? (res as any).policies : [];
  }

  async createSecurityPolicy(policyData: any): Promise<any> {
    return this.request('/admin/security/policies', 'POST', policyData);
  }

  // Badges (for Certification Management)
  async getBadges(): Promise<any[]> {
    try {
      const response = await this.request<any>('/admin/badges');
      // Extract from standardized APIResponse format
      // Paginated format: { success: true, data: { items: [...], pagination: {...} } }
      if (response?.data?.items && Array.isArray(response.data.items)) {
        return response.data.items;
      }
      // Non-paginated format: { success: true, data: { badges: [...] } }
      if (response?.data?.badges && Array.isArray(response.data.badges)) {
        return response.data.badges;
      }
      // Handle both array and object with badges property (legacy formats)
      if (Array.isArray(response)) return response;
      if (response && typeof response === 'object' && 'badges' in response) {
        return Array.isArray(response.badges) ? response.badges : [];
      }
      return [];
    } catch (error) {
      // Return empty array if endpoint doesn't exist or fails
      console.warn('Badges endpoint not available, returning empty array');
      return [];
    }
  }

  async createBadge(badgeData: any): Promise<any> {
    return this.request('/admin/badges', 'POST', badgeData);
  }

  async updateBadge(badgeId: number, badgeData: any): Promise<any> {
    return this.request(`/admin/badges/${badgeId}`, 'PUT', badgeData);
  }

  async deleteBadge(badgeId: number): Promise<any> {
    return this.request(`/admin/badges/${badgeId}`, 'DELETE');
  }

  async getComplianceLogs(days?: number): Promise<any> {
    const params = days ? `?days=${days}` : '';
    return this.request(`/admin/security/compliance-logs${params}`);
  }

  async getAuditTrail(days?: number): Promise<any> {
    const params = days ? `?days=${days}` : '';
    return this.request(`/admin/security/audit-trail${params}`);
  }

  async getDataRetentionRules(): Promise<any[]> {
    const res = await this.request<{ retention_rules: any[] }>('/admin/security/data-retention');
    return Array.isArray((res as any).retention_rules) ? (res as any).retention_rules : [];
  }

  async getPrivacySettings(): Promise<any[]> {
    const res = await this.request<{ privacy_settings: any[] }>('/admin/security/privacy-settings');
    return Array.isArray((res as any).privacy_settings) ? (res as any).privacy_settings : [];
  }

  // Activities & Challenges
  async getAvailableActivities(): Promise<any[]> {
    const response = await this.request('/activities/available');
    // Handle standardized response: {success: true, data: [...]}
    const data = extractResponseData(response, response);
    return Array.isArray(data) ? data : [];
  }

  getCompletedActivities(): Promise<any[]> {
    return this.request('/activities/completed');
  }

  startActivity(activityId: string): Promise<any> {
    return this.request(`/activities/${activityId}/start`, 'POST');
  }

  completeActivity(activityId: string, score: number, xpEarned: number): Promise<any> {
    return this.request(`/activities/${activityId}/complete`, 'POST', {
      score,
      xp_earned: xpEarned
    });
  }

  // Challenges & Gamification
  async getDailyChallenges(): Promise<any[]> {
    const response = await this.request<any>('/challenges/daily');
    // Handle standardized response: {success: true, data: {challenges: [], userProgress: {}}}
    const data = extractResponseData(response, response);
    return Array.isArray(data?.challenges) ? data.challenges : [];
  }

  async getWeeklyChallenges(): Promise<any[]> {
    const response = await this.request<any>('/challenges/weekly');
    // Handle standardized response: {success: true, data: {challenges: [], userProgress: {}}}
    const data = extractResponseData(response, response);
    return Array.isArray(data?.challenges) ? data.challenges : [];
  }

  async getTimedChallenges(): Promise<any[]> {
    const response = await this.request<any>('/challenges/timed');
    // Handle standardized response: {success: true, data: {challenges: [], activeCompetitions: []}}
    const data = extractResponseData(response, response);
    return Array.isArray(data?.challenges) ? data.challenges : [];
  }

  async getTimedChallengeQuestions(challengeId?: number): Promise<{ questions: any[], challenge_id: number | null }> {
    const url = challengeId 
      ? `/challenges/timed-questions?challenge_id=${challengeId}`
      : '/challenges/timed-questions';
    const response = await this.request<any>(url);
    // Handle standardized response: {success: true, data: {questions: [], challenge_id: ...}}
    const data = extractResponseData(response, response);
    return {
      questions: Array.isArray(data?.questions) ? data.questions : [],
      challenge_id: data?.challenge_id || challengeId || null
    };
  }

  startChallenge(challengeId: string): Promise<any> {
    return this.request(`/challenges/${challengeId}/start`, 'POST');
  }

  submitChallengeSolution(challengeId: string, solution: string): Promise<{
    score: number;
    xpEarned: number;
    feedback: string;
  }> {
    return this.request(`/challenges/${challengeId}/submit`, 'POST', { solution });
  }


  getUserRanking(): Promise<any> {
    return this.request('/leaderboard/user-ranking');
  }

  // Certificates
  getAvailableCertificates(): Promise<any[]> {
    return this.request('/certificates/available');
  }

  downloadCertificate(certificateId: string): Promise<Blob> {
    return fetch(`${API_BASE_URL}/certificates/${certificateId}/download`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    }).then(response => response.blob());
  }

  shareCertificate(certificateId: string): Promise<{ shareUrl: string }> {
    return this.request(`/certificates/${certificateId}/share`, 'POST');
  }

  // Settings & Preferences
  getUserSettings(): Promise<any> {
    return this.request('/users/settings');
  }

  updateUserSettings(settings: any): Promise<any> {
    return this.request('/users/settings', 'PUT', settings);
  }

  updateNotificationPreferences(preferences: any): Promise<any> {
    return this.request('/users/notification-preferences', 'PUT', preferences);
  }

  // Learning Path
  getLearningPath(): Promise<any> {
    return this.request('/learning-path/current');
  }

  updateLearningPath(pathData: any): Promise<any> {
    return this.request('/learning-path/update', 'PUT', pathData);
  }

  // Quiz & Assessment
  getQuizData(moduleId: string, lessonId: string): Promise<any> {
    return this.request(`/quiz/${moduleId}/${lessonId}`);
  }

  submitQuizAnswers(moduleId: string, lessonId: string, answers: any[]): Promise<{
    score: number;
    correctAnswers: number;
    totalQuestions: number;
    xpEarned: number;
    feedback: any[];
  }> {
    return this.request(`/quiz/${moduleId}/${lessonId}/submit`, 'POST', { answers });
  }

  // Practice & Challenges
  async getPracticeExercises(topicId: string): Promise<any[]> {
    const response = await this.request(`/learning/practice-exercises?type=${topicId}`);
    // Handle standardized response: {success: true, data: [...]}
    const data = extractResponseData(response, response);
    return Array.isArray(data) ? data : [];
  }

  submitPracticeExercise(exerciseId: string, solution: string): Promise<{
    score: number;
    feedback: string;
    xpEarned: number;
  }> {
    return this.request(`/practice/${exerciseId}/submit`, 'POST', { solution });
  }

  // Recommendations
  async getRecommendations(): Promise<any> {
    const response = await this.request('/recommendations/modules');
    // Handle standardized response: {success: true, data: {recommendations: [...], ...}}
    const data = extractResponseData(response, response);
    if (data && typeof data === 'object' && 'recommendations' in data) {
      return data;
    }
    // Fallback: if data is already the recommendations array
    if (Array.isArray(data)) {
      return { recommendations: data, total: data.length };
    }
    return { recommendations: [], total: 0 };
  }

  getNextLesson(): Promise<any> {
    return this.request('/recommendations/next-lesson');
  }

  // Learning Features
  async getDailyGoals(): Promise<any> {
    const response = await this.request('/learning/daily-goals');
    // Handle standardized response: {success: true, data: {goals: [...], all_completed: bool, completion_percentage: number}}
    const data = extractResponseData(response, response) as any;
    if (data && typeof data === 'object' && 'goals' in data) {
      return { 
        goals: data.goals || [], 
        all_completed: data.all_completed || false, 
        completion_percentage: data.completion_percentage || 0 
      };
    }
    return { goals: Array.isArray(data) ? data : [], all_completed: false, completion_percentage: 0 };
  }

  async getRecentLessons(limit: number = 10): Promise<any[]> {
    const response = await this.request(`/learning/recent-lessons?limit=${limit}`);
    // Handle standardized response: {success: true, data: [...]}
    const data = extractResponseData(response, response);
    return Array.isArray(data) ? data : [];
  }

  getLearningObjectives(): Promise<any> {
    return this.request('/learning/objectives');
  }

  getSkillTree(): Promise<any> {
    return this.request('/learning/skill-tree');
  }

  getUserSkills(): Promise<any> {
    return this.request('/learning/skills');
  }

  recordSkillPractice(skillId: string, improvement: number = 0.1): Promise<any> {
    return this.request(`/learning/skills/${skillId}/practice`, 'POST', { improvement });
  }

  // System Health (public endpoint)
  getSystemHealthPublic(): Promise<any> {
    return this.request('/system-health');
  }

  // Translation History
  getTranslationHistory(limit: number = 50): Promise<any> {
    return this.request(`/openai/translation-history?limit=${limit}`);
  }

  deleteTranslationHistory(historyId: number): Promise<any> {
    return this.request(`/openai/translation-history/${historyId}`, 'DELETE');
  }

  rateTranslation(historyId: number, rating: number, isFavorite?: boolean): Promise<any> {
    return this.request(`/openai/translation-history/${historyId}/rate`, 'PUT', { 
      rating, 
      is_favorite: isFavorite 
    });
  }

  // Certificate Verification
  verifyCertificateByHash(certificateHash: string): Promise<any> {
    return this.request(`/certificates/verify/${certificateHash}`);
  }

  // Hearts System
  async getHearts(): Promise<any> {
    const response = await this.request('/hearts/');
    // Handle standardized response: {success: true, data: {hearts: {...}, refilled: bool}}
    const data = extractResponseData(response, response);
    if (data && typeof data === 'object' && 'hearts' in data) {
      return data;
    }
    // Fallback: if data is the hearts object directly
    if (data && typeof data === 'object' && 'current_hearts' in data) {
      return { hearts: data, refilled: false };
    }
    return { hearts: { current_hearts: 5, max_hearts: 5, unlimited_hearts: false }, refilled: false };
  }

  loseHeart(reason: string = 'wrong_answer', entityType?: string, entityId?: number): Promise<any> {
    return this.request('/hearts/lose', 'POST', { 
      reason, 
      entity_type: entityType, 
      entity_id: entityId 
    });
  }

  refillHearts(method: string = 'premium'): Promise<any> {
    return this.request('/hearts/refill', 'POST', { method });
  }

  getHeartHistory(limit: number = 50): Promise<any> {
    return this.request(`/hearts/history?limit=${limit}`);
  }

  getHeartStats(): Promise<any> {
    return this.request('/hearts/stats');
  }

  // Dashboard - Aggregated Data
  getDashboardData(): Promise<any> {
    return this.request('/dashboard/data');
  }

  getDashboardSummary(): Promise<any> {
    return this.request('/dashboard/summary');
  }

  // Admin Gamification Endpoints
  async getAdminCompetitions(page = 1, pageSize = 20, search = '', status = '') {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
      });
      if (search) params.append('search', search);
      if (status) params.append('status', status);
      
      const response = await this.request<any>(`/admin/competitions?${params.toString()}`);
      // Handle standardized response: {success: true, data: {items: [], pagination: {...}}} or legacy {success: true, competitions: []}
      const data = extractResponseData(response, response);
      const competitions = data?.items || data?.competitions || (Array.isArray(data) ? data : []);
      const pagination = data?.pagination || {};
      
      return {
        success: response?.success !== false,
        competitions: Array.isArray(competitions) ? competitions : [],
        pagination: {
          page: pagination.page || page,
          per_page: pagination.per_page || pagination.page_size || pageSize,
          total: pagination.total || 0,
          pages: pagination.pages || pagination.total_pages || 0,
          has_next: pagination.has_next || false,
          has_prev: pagination.has_prev || false
        }
      };
    } catch (error) {
      console.error('Error getting admin competitions:', error);
      return {
        success: false,
        competitions: [],
        pagination: { page, per_page: pageSize, total: 0, pages: 0, has_next: false, has_prev: false }
      };
    }
  }

  async createAdminCompetition(data: any) {
    return this.request('/admin/competitions', 'POST', data);
  }

  async toggleCompetitionStatus(competitionId: string, isActive: boolean) {
    return this.request(`/admin/competitions/${competitionId}/toggle`, 'PUT', { is_active: isActive });
  }

  async getCompetitionParticipants(competitionId: string) {
    try {
      const response = await this.request<any>(`/admin/competitions/${competitionId}/participants`);
      // Handle standardized response: {success: true, data: {participants: []}} or legacy {success: true, participants: []}
      const data = extractResponseData(response, response);
      const participants = data?.participants || data?.items || [];
      return {
        success: response?.success !== false,
        participants: Array.isArray(participants) ? participants : []
      };
    } catch (error) {
      console.error('Error getting competition participants:', error);
      return {
        success: false,
        participants: []
      };
    }
  }

  async getCompetitionProgress(competitionId: string) {
    try {
      const response = await this.request<any>(`/admin/competitions/${competitionId}/progress`);
      // Handle standardized response: {success: true, data: {progress: []}} or legacy {success: true, progress: []}
      const data = extractResponseData(response, response);
      const progress = data?.progress || data?.items || [];
      return {
        success: response?.success !== false,
        progress: Array.isArray(progress) ? progress : []
      };
    } catch (error) {
      console.error('Error getting competition progress:', error);
      return {
        success: false,
        progress: []
      };
    }
  }

  async createCompetitionActivity(data: any) {
    return this.request('/admin/competitions/activities', 'POST', data);
  }

  async updateCompetitionActivity(data: any) {
    return this.request('/admin/competitions/activities', 'PUT', data);
  }

  async getAdminAchievements() {
    return this.request<{success: boolean; achievements: any[]}>('/admin/gamification/achievements');
  }

  async createAdminAchievement(data: any) {
    return this.request('/admin/gamification/achievements', 'POST', data);
  }

  async updateAdminAchievement(achievementId: number, data: any) {
    return this.request(`/admin/gamification/achievements/${achievementId}`, 'PUT', data);
  }

  async deleteAdminAchievement(achievementId: number) {
    return this.request(`/admin/gamification/achievements/${achievementId}`, 'DELETE');
  }

  async getAdminRewards() {
    return this.request<{success: boolean; rewards: any[]}>('/admin/gamification/rewards');
  }

  async createAdminReward(data: any) {
    return this.request('/admin/gamification/rewards', 'POST', data);
  }

  async getGamificationSettings() {
    return this.request<{success: boolean; settings: any}>('/admin/gamification/settings');
  }

  async updateGamificationSettings(settings: any) {
    return this.request('/admin/gamification/settings', 'PUT', { settings });
  }

  // Guilds
  async getGuilds(page = 1, perPage = 20, search = '', isOpen?: boolean) {
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString(),
    });
    if (search) params.append('search', search);
    if (isOpen !== undefined) params.append('is_open', isOpen.toString());
    
    const response = await this.request<any>(`/gamification/guilds?${params.toString()}`);
    const data = extractResponseData(response, response);
    return {
      guilds: data?.guilds || [],
      pagination: data?.pagination || { page, per_page: perPage, total: 0, pages: 0 },
    };
  }

  async createGuild(guildData: { name: string; description?: string; tag?: string; is_open?: boolean; max_members?: number }) {
    return this.request('/gamification/guilds', 'POST', guildData);
  }

  async getGuild(guildId: number) {
    const response = await this.request<any>(`/gamification/guilds/${guildId}`);
    return extractResponseData(response, response);
  }

  async joinGuild(guildId: number) {
    return this.request(`/gamification/guilds/${guildId}/join`, 'POST');
  }

  async leaveGuild(guildId: number) {
    return this.request(`/gamification/guilds/${guildId}/leave`, 'POST');
  }

  // Tournaments
  async getTournaments(page = 1, perPage = 20, status?: string, type?: string) {
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString(),
    });
    if (status) params.append('status', status);
    if (type) params.append('type', type);
    
    const response = await this.request<any>(`/gamification/tournaments?${params.toString()}`);
    const data = extractResponseData(response, response);
    return {
      tournaments: data?.tournaments || [],
      pagination: data?.pagination || { page, per_page: perPage, total: 0, pages: 0 },
    };
  }

  async getTournament(tournamentId: number) {
    const response = await this.request<any>(`/gamification/tournaments/${tournamentId}`);
    return extractResponseData(response, response);
  }

  async joinTournament(tournamentId: number) {
    return this.request(`/gamification/tournaments/${tournamentId}/join`, 'POST');
  }

  async getTournamentLeaderboard(tournamentId: number, page = 1, perPage = 50) {
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString(),
    });
    const response = await this.request<any>(`/gamification/tournaments/${tournamentId}/leaderboard?${params.toString()}`);
    return extractResponseData(response, response);
  }

  // Lesson Bookmarks
  async getLessonBookmark(lessonId: string): Promise<any> {
    return this.request(`/lessons/${lessonId}/bookmark`);
  }

  async addLessonBookmark(lessonId: string, moduleId: string, note?: string): Promise<any> {
    return this.request(`/lessons/${lessonId}/bookmark`, 'POST', { module_id: moduleId, note });
  }

  async removeLessonBookmark(lessonId: string): Promise<any> {
    return this.request(`/lessons/${lessonId}/bookmark`, 'DELETE');
  }

  async updateLessonBookmark(lessonId: string, data: { note?: string }): Promise<any> {
    return this.request(`/lessons/${lessonId}/bookmark`, 'PUT', data);
  }

  async getBookmarkedLessons(): Promise<any> {
    return this.request('/lessons/bookmarks');
  }

  // Stripe Checkout Session
  async createCheckoutSession(planType: 'monthly' | 'yearly', billingCycle?: string): Promise<{ checkout_url: string; session_id: string }> {
    const response = await this.request<{ success: boolean; checkout_url: string; session_id: string }>(
      '/subscriptions/create-checkout-session',
      'POST',
      {
        plan_type: planType,
        billing_cycle: billingCycle || planType
      }
    );
    
    if (!response.success || !response.checkout_url) {
      throw new Error('Failed to create checkout session');
    }
    
    return {
      checkout_url: response.checkout_url,
      session_id: response.session_id
    };
  }

  // Admin Credentials Management
  async getCredentials(): Promise<any[]> {
    const response = await this.request<any>('/admin/credentials');
    const data = extractResponseData(response, response);
    return data?.credentials || data?.data?.credentials || [];
  }

  async getCredential(id: number): Promise<any> {
    const response = await this.request<any>(`/admin/credentials/${id}`);
    return extractResponseData(response, response);
  }

  async createCredential(credentialData: any): Promise<any> {
    return this.request('/admin/credentials', 'POST', credentialData);
  }

  async updateCredential(id: number, credentialData: any): Promise<any> {
    return this.request(`/admin/credentials/${id}`, 'PUT', credentialData);
  }

  async deleteCredential(id: number): Promise<any> {
    return this.request(`/admin/credentials/${id}`, 'DELETE');
  }

  async importCredentialsFromFile(fileContent: string): Promise<any> {
    return this.request('/admin/credentials/import-from-file', 'POST', { file_content: fileContent });
  }
}

// Create and export a singleton instance
const apiService = new ApiService();
export default apiService;
