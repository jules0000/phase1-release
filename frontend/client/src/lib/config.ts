/**
 * Configuration Management Service
 * Centralizes all configuration values and environment variables
 */

interface AppConfig {
  // API Configuration
  apiBaseUrl: string;
  apiDirectUrl: string | null;
  backendPort: string;
  
  // Development Configuration
  devMode: boolean;
  debugApi: boolean;
  
  // Feature Flags
  enableAnalytics: boolean;
  enableRealTime: boolean;
  enableOfflineMode: boolean;
  
  // UI Configuration
  defaultTheme: 'light' | 'dark';
  enableAnimations: boolean;
  pageSize: number;
  
  // External Services
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  
  // Sentry Configuration
  sentryDsn: string | null;
  sentryOrg: string | null;
  sentryProject: string | null;
  sentryEnvironment: string;
  
  // Build Information
  buildVersion: string;
  buildTimestamp: string | null;
}

class ConfigService {
  private config: AppConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): AppConfig {
    const config = {
      // API Configuration
      apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api',
      apiDirectUrl: import.meta.env.VITE_API_DIRECT_URL || null,
      backendPort: import.meta.env.VITE_BACKEND_PORT || '8085',
      
      // Development Configuration
      devMode: import.meta.env.VITE_DEV_MODE === 'true' || import.meta.env.DEV,
      debugApi: import.meta.env.VITE_DEBUG_API === 'true',
      
      // Feature Flags
      enableAnalytics: import.meta.env.VITE_ENABLE_ANALYTICS !== 'false',
      enableRealTime: import.meta.env.VITE_ENABLE_REAL_TIME !== 'false',
      enableOfflineMode: import.meta.env.VITE_ENABLE_OFFLINE_MODE === 'true',
      
      // UI Configuration
      defaultTheme: (import.meta.env.VITE_DEFAULT_THEME as 'light' | 'dark') || 'light',
      enableAnimations: import.meta.env.VITE_ENABLE_ANIMATIONS !== 'false',
      pageSize: parseInt(import.meta.env.VITE_PAGE_SIZE || '20', 10),
      
      // External Services
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL || null,
      supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || null,
      
      // Sentry Configuration
      sentryDsn: import.meta.env.VITE_SENTRY_DSN || null,
      sentryOrg: import.meta.env.VITE_SENTRY_ORG || null,
      sentryProject: import.meta.env.VITE_SENTRY_PROJECT || null,
      sentryEnvironment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'development',
      
      // Build Information
      buildVersion: import.meta.env.VITE_BUILD_VERSION || '1.0.0',
      buildTimestamp: import.meta.env.VITE_BUILD_TIMESTAMP || null,
    };
    
    // Validate environment after config is created
    this.validateEnvironmentWithConfig(config);
    
    return config;
  }

  // Getters for configuration values
  get apiConfig() {
    return {
      baseUrl: this.config.apiBaseUrl,
      directUrl: this.config.apiDirectUrl,
      backendPort: this.config.backendPort,
    };
  }

  get developmentConfig() {
    return {
      devMode: this.config.devMode,
      debugApi: this.config.debugApi,
    };
  }

  get featureFlags() {
    return {
      analytics: this.config.enableAnalytics,
      realTime: this.config.enableRealTime,
      offlineMode: this.config.enableOfflineMode,
    };
  }

  get uiConfig() {
    return {
      theme: this.config.defaultTheme,
      animations: this.config.enableAnimations,
      pageSize: this.config.pageSize,
    };
  }

  get externalServices() {
    return {
      supabase: {
        url: this.config.supabaseUrl,
        anonKey: this.config.supabaseAnonKey,
      },
    };
  }

  get sentryConfig() {
    return {
      dsn: this.config.sentryDsn,
      org: this.config.sentryOrg,
      project: this.config.sentryProject,
      environment: this.config.sentryEnvironment,
    };
  }

  get buildInfo() {
    return {
      version: this.config.buildVersion,
      timestamp: this.config.buildTimestamp,
    };
  }

  // Utility methods
  isFeatureEnabled(feature: 'analytics' | 'realTime' | 'offlineMode'): boolean {
    return this.featureFlags[feature] || false;
  }

  isDevelopment(): boolean {
    return this.config.devMode;
  }

  isProduction(): boolean {
    return !this.config.devMode;
  }

  // Get full configuration (for debugging)
  getFullConfig(): AppConfig {
    return { ...this.config };
  }

  // Update configuration at runtime (for testing)
  updateConfig(updates: Partial<AppConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // Validate environment configuration with config object
  private validateEnvironmentWithConfig(config: AppConfig): void {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check for development mode configuration
    if (config.devMode) {
      if (!import.meta.env.VITE_BACKEND_PORT) {
        warnings.push('VITE_BACKEND_PORT not set, using default: 8085');
      }
      
      if (!import.meta.env.VITE_API_BASE_URL) {
        warnings.push('VITE_API_BASE_URL not set, using default: /api');
      }
    }

    // Check for production configuration
    if (!config.devMode) {
      if (!import.meta.env.VITE_API_BASE_URL) {
        errors.push('VITE_API_BASE_URL must be set in production');
      }
    }

    // Log warnings and errors
    if (warnings.length > 0) {
      console.warn('Configuration warnings:', warnings);
    }
    
    if (errors.length > 0) {
      console.error('Configuration errors:', errors);
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }
  }

  // Get environment-specific configuration summary
  getConfigSummary(): Record<string, any> {
    return {
      environment: this.isDevelopment() ? 'development' : 'production',
      apiBaseUrl: this.config.apiBaseUrl,
      backendPort: this.config.backendPort,
      featuresEnabled: {
        analytics: this.config.enableAnalytics,
        realTime: this.config.enableRealTime,
        offlineMode: this.config.enableOfflineMode,
      },
      buildInfo: this.buildInfo,
    };
  }
}

// Create and export singleton instance
export const configService = new ConfigService();
export default configService;

// Export types for use in other files
export type { AppConfig };

