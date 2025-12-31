"""
Configuration settings for different environments
"""

import os
from datetime import timedelta
from urllib.parse import urlparse, urlunparse, parse_qs, urlencode

def normalize_mysql_url(database_url: str) -> str:
    """
    Normalize MySQL connection URL to ensure charset=utf8mb4 is always present.
    
    This fixes the PyMySQL charset encoding error by ensuring the charset parameter
    is always included in the connection string.
    """
    if not database_url:
        return database_url
    
    # Only normalize MySQL URLs
    if 'mysql' not in database_url.lower() and 'pymysql' not in database_url.lower():
        return database_url
    
    try:
        # Parse the URL
        parsed = urlparse(database_url)
        
        # Parse query parameters
        query_params = parse_qs(parsed.query)
        
        # Ensure charset is set to utf8mb4
        query_params['charset'] = ['utf8mb4']
        
        # Rebuild query string
        new_query = urlencode(query_params, doseq=True)
        
        # Reconstruct URL
        normalized = urlunparse((
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            new_query,
            parsed.fragment
        ))
        
        return normalized
    except Exception:
        # If parsing fails, try simple string replacement
        if 'charset=' not in database_url.lower():
            # Add charset if not present
            if '?' in database_url:
                return f"{database_url}&charset=utf8mb4"
            else:
                return f"{database_url}?charset=utf8mb4"
        return database_url

class Config:
    """Base configuration class"""
    # Secrets - MUST be set in environment variables
    SECRET_KEY = os.environ.get('SECRET_KEY')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY')
    
    # Validation: Ensure secrets are set
    # CRITICAL-002 Fix: Fail fast in production if secrets not configured
    env = os.environ.get('FLASK_ENV', 'production')
    if not SECRET_KEY:
        if env == 'production':
            raise RuntimeError("SECRET_KEY must be set in production environment. Set it in environment variables.")
        import secrets
        SECRET_KEY = secrets.token_hex(32)
        import warnings
        warnings.warn("SECRET_KEY not set! Using random key. This will break sessions on restart!")
    
    if not JWT_SECRET_KEY:
        if env == 'production':
            raise RuntimeError("JWT_SECRET_KEY must be set in production environment. Set it in environment variables.")
        import secrets
        JWT_SECRET_KEY = secrets.token_hex(32)
        import warnings
        warnings.warn("JWT_SECRET_KEY not set! Using random key. Tokens will be invalid on restart!")
    
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)  # Extended to 24 hours for development
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)
    
    # Database connection pool settings
    # Fixed: Reduced pool size to prevent "Too many connections" errors
    # MySQL default max_connections is usually 151, so we keep pool size reasonable
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': int(os.environ.get('DB_POOL_SIZE', '10')),  # Reduced to 10 (configurable via env)
        'max_overflow': int(os.environ.get('DB_MAX_OVERFLOW', '20')),  # Reduced to 20 (configurable via env)
        'pool_timeout': 30,                 # Seconds to wait for connection
        'pool_recycle': 3600,               # Recycle connections after 1 hour to prevent stale connections
        'pool_pre_ping': True,              # Verify connections before using (prevents stale connection errors)
        'echo_pool': False,                 # Don't log pool events (set to True for debugging)
    }
    
    # JWT configuration
    JWT_TOKEN_LOCATION = ['headers']
    JWT_HEADER_NAME = 'Authorization'
    JWT_HEADER_TYPE = 'Bearer'
    JWT_ERROR_MESSAGE_KEY = 'msg'
    
    # AI Provider Configuration
    OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')
    OPENAI_MODEL = os.environ.get('OPENAI_MODEL', 'gpt-4')
    OPENAI_MAX_TOKENS = int(os.environ.get('OPENAI_MAX_TOKENS', '2000'))
    OPENAI_TEMPERATURE = float(os.environ.get('OPENAI_TEMPERATURE', '0.7'))
    
    # Anthropic Configuration
    ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY')
    
    # Groq Configuration
    GROQ_API_KEY = os.environ.get('GROQ_API_KEY')
    
    # Ollama Configuration
    OLLAMA_BASE_URL = os.environ.get('OLLAMA_BASE_URL', 'http://127.0.0.1:11434')
    
    # Default AI Settings
    DEFAULT_AI_MODEL = os.environ.get('DEFAULT_AI_MODEL', 'gpt-3.5-turbo')
    AI_TIMEOUT = int(os.environ.get('AI_TIMEOUT', '60'))
    AI_MAX_RETRIES = int(os.environ.get('AI_MAX_RETRIES', '3'))
    
    # CORS Configuration - read from environment variable only
    # P1 Fix: Improved CORS parsing with edge case handling
    CORS_ORIGINS_ENV = os.environ.get('CORS_ORIGINS', '').strip()
    if CORS_ORIGINS_ENV:
        # Split by comma and clean up each origin
        origins_list = []
        for origin in CORS_ORIGINS_ENV.split(','):
            origin = origin.strip()
            # Validate origin format (basic check)
            if origin and (origin.startswith('http://') or origin.startswith('https://') or origin == '*'):
                origins_list.append(origin)
            elif origin:  # Non-empty but invalid format
                import warnings
                warnings.warn(f"Invalid CORS origin format ignored: {origin}")
        CORS_ORIGINS = origins_list
    else:
        CORS_ORIGINS = []
    
    # Rate Limiting
    RATELIMIT_STORAGE_URL = os.environ.get('REDIS_URL', 'memory://')
    
    # File Upload
    MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB max file size
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'uploads')
    
    # Real-time Configuration
    SOCKETIO_ASYNC_MODE = 'eventlet'
    
    # Pagination
    DEFAULT_PAGE_SIZE = 20
    MAX_PAGE_SIZE = 100
    
    @classmethod
    def validate_config(cls):
        """Validate configuration and warn about missing required settings"""
        warnings = []
        errors = []
        
        # Check required secrets
        if not cls.SECRET_KEY or cls.SECRET_KEY in ['your-secret-key-here', 'dev-secret-key-change-in-production']:
            if cls.SECRET_KEY == 'dev-secret-key-change-in-production':
                warnings.append("Using development SECRET_KEY - change for production")
            else:
                errors.append("SECRET_KEY must be set to a secure random value")
        
        if not cls.JWT_SECRET_KEY or cls.JWT_SECRET_KEY in ['your-jwt-secret-key-here', 'dev-jwt-secret-change-in-production']:
            if cls.JWT_SECRET_KEY == 'dev-jwt-secret-change-in-production':
                warnings.append("Using development JWT_SECRET_KEY - change for production")
            else:
                errors.append("JWT_SECRET_KEY must be set to a secure random value")
        
        # Check database configuration
        # Note: Subclasses (DevelopmentConfig, ProductionConfig) will validate DATABASE_URL is set
        # This base validation only checks if SQLite is explicitly configured (not None/empty)
        # Skip database validation in base class - let subclasses handle it completely
        # This prevents duplicate errors when subclasses already validate
        pass
        
        # Check AI provider configuration (warnings only)
        ai_providers = {
            'OPENAI_API_KEY': 'OpenAI',
            'ANTHROPIC_API_KEY': 'Anthropic', 
            'GROQ_API_KEY': 'Groq'
        }
        
        configured_providers = []
        for key, name in ai_providers.items():
            if getattr(cls, key, None):
                configured_providers.append(name)
            else:
                warnings.append(f"{key} not set - {name} features will be disabled")
        
        if not configured_providers:
            warnings.append("No AI providers configured - AI features will be limited")
        else:
            warnings.append(f"AI providers configured: {', '.join(configured_providers)}")
        
        # P1 Fix: Check CORS configuration (production requires explicit configuration)
        import os
        env = os.environ.get('FLASK_ENV', 'production')
        if not cls.CORS_ORIGINS:
            if env == 'production':
                errors.append("CORS_ORIGINS must be set in production - frontend will not be able to connect")
            else:
                warnings.append("CORS_ORIGINS not set - frontend may have connection issues")
        
        # Validate CORS origins format in production
        if env == 'production' and cls.CORS_ORIGINS:
            invalid_origins = [origin for origin in cls.CORS_ORIGINS 
                              if origin != '*' and not (origin.startswith('http://') or origin.startswith('https://'))]
            if invalid_origins:
                errors.append(f"Invalid CORS origin formats in production: {', '.join(invalid_origins)}")
            
            # Warn if using wildcard in production
            if '*' in cls.CORS_ORIGINS:
                warnings.append("CORS_ORIGINS contains '*' wildcard - this is insecure for production!")
        
        # Check file upload configuration
        if cls.MAX_CONTENT_LENGTH > 100 * 1024 * 1024:  # 100MB
            warnings.append("MAX_CONTENT_LENGTH is very large - consider reducing for security")
        
        return errors, warnings
    
    @classmethod
    def get_config_summary(cls):
        """Get a summary of current configuration"""
        return {
            'environment': os.environ.get('FLASK_ENV', 'production'),
            'debug': getattr(cls, 'DEBUG', False),
            'database_type': 'sqlite' if 'sqlite' in getattr(cls, 'SQLALCHEMY_DATABASE_URI', '') else 'other',
            'ai_providers': {
                'openai': bool(cls.OPENAI_API_KEY),
                'anthropic': bool(cls.ANTHROPIC_API_KEY),
                'groq': bool(cls.GROQ_API_KEY),
                'ollama': bool(cls.OLLAMA_BASE_URL)
            },
            'cors_origins': len(cls.CORS_ORIGINS) if cls.CORS_ORIGINS else 0,
            'upload_limit_mb': cls.MAX_CONTENT_LENGTH / (1024 * 1024) if cls.MAX_CONTENT_LENGTH else 0
        }

class DevelopmentConfig(Config):
    """Development configuration - MySQL required"""
    DEBUG = True
    # MySQL connection is REQUIRED - no SQLite fallback
    # DATABASE_URL must be set in environment or .env file
    # Format: mysql+pymysql://user:password@host:port/database?charset=utf8mb4
    _raw_database_url = os.environ.get('DATABASE_URL')
    SQLALCHEMY_DATABASE_URI = normalize_mysql_url(_raw_database_url) if _raw_database_url else None
    
    @classmethod
    def validate_config(cls):
        """Validate configuration - MySQL is required for development"""
        errors, warnings = super().validate_config()
        
        # Check DATABASE_URL is set FIRST (before checking for SQLite)
        if not cls.SQLALCHEMY_DATABASE_URI:
            errors.append(
                "DATABASE_URL environment variable is required for development.\n"
                "Set it in .env file or environment variable.\n"
                "Example: DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/neural?charset=utf8mb4"
            )
            return errors, warnings
        
        # Validate it's MySQL (only MySQL is supported)
        db_uri_lower = cls.SQLALCHEMY_DATABASE_URI.lower()
        if 'sqlite' in db_uri_lower:
            errors.append(
                f"SQLite is NOT supported. Only MySQL is allowed.\n"
                f"Detected SQLite URI: {cls.SQLALCHEMY_DATABASE_URI}\n"
                f"Please update your .env file or DATABASE_URL environment variable to use MySQL.\n"
                f"Example: DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/neural?charset=utf8mb4"
            )
        elif 'mysql' not in db_uri_lower and 'pymysql' not in db_uri_lower:
            errors.append(
                "DATABASE_URL must point to a MySQL database.\n"
                f"Current value does not appear to be a MySQL connection string: {cls.SQLALCHEMY_DATABASE_URI[:50]}...\n"
                "Example: DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/neural?charset=utf8mb4"
            )
        
        return errors, warnings
    
class TestingConfig(Config):
    """Testing configuration - MySQL required"""
    TESTING = True
    # MySQL connection is REQUIRED for testing - use test database
    # DATABASE_URL must be set in environment or use test MySQL database
    # Format: mysql+pymysql://user:password@host:port/test_database?charset=utf8mb4
    _raw_database_url = os.environ.get('DATABASE_URL') or os.environ.get('TEST_DATABASE_URL')
    SQLALCHEMY_DATABASE_URI = normalize_mysql_url(_raw_database_url) if _raw_database_url else None
    WTF_CSRF_ENABLED = False
    
    # MySQL engine options for testing
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
        'pool_size': 5,  # Smaller pool for tests
        'max_overflow': 10,
        'pool_recycle': 3600,
    }
    
    # Set test secrets (not secure, but fine for testing)
    SECRET_KEY = 'test-secret-key-for-testing-only'
    JWT_SECRET_KEY = 'test-jwt-secret-key-for-testing-only'
    
    @classmethod
    def validate_config(cls):
        """Validate configuration - MySQL is required for testing"""
        errors, warnings = super().validate_config()
        
        # Check DATABASE_URL is set
        if not cls.SQLALCHEMY_DATABASE_URI:
            errors.append(
                "DATABASE_URL or TEST_DATABASE_URL environment variable is required for testing.\n"
                "Set it to a MySQL test database connection string.\n"
                "Example: DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/neural_test?charset=utf8mb4"
            )
            return errors, warnings
        
        # Validate it's MySQL, not SQLite
        db_uri_lower = cls.SQLALCHEMY_DATABASE_URI.lower()
        if 'sqlite' in db_uri_lower:
            errors.append(
                f"SQLite is not supported. MySQL connection is required for testing.\n"
                f"Detected SQLite URI: {cls.SQLALCHEMY_DATABASE_URI}\n"
                f"Please set DATABASE_URL or TEST_DATABASE_URL to a MySQL connection string.\n"
                f"Example: DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/neural_test?charset=utf8mb4"
            )
        elif 'mysql' not in db_uri_lower and 'pymysql' not in db_uri_lower:
            errors.append(
                "DATABASE_URL must point to a MySQL database for testing.\n"
                f"Current value does not appear to be a MySQL connection string: {cls.SQLALCHEMY_DATABASE_URI[:50]}...\n"
                "Example: DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/neural_test?charset=utf8mb4"
            )
        
        return errors, warnings
    
class ProductionConfig(Config):
    """Production configuration - MySQL required"""
    DEBUG = False
    # MySQL connection is REQUIRED - no SQLite fallback
    # DATABASE_URL must be set in environment variable
    # Format: mysql+pymysql://user:password@host:port/database?charset=utf8mb4
    _raw_database_url = os.environ.get('DATABASE_URL')
    SQLALCHEMY_DATABASE_URI = normalize_mysql_url(_raw_database_url) if _raw_database_url else None
    
    # Security settings for production
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    # CORS for production - read from environment variable only
    CORS_ORIGINS_ENV = os.environ.get('CORS_ORIGINS', '')
    CORS_ORIGINS = [origin.strip() for origin in CORS_ORIGINS_ENV.split(',') if origin.strip()] if CORS_ORIGINS_ENV else []
    
    @classmethod
    def validate_config(cls):
        """Validate configuration - MySQL is required for production"""
        errors, warnings = super().validate_config()
        
        # Check DATABASE_URL is set FIRST (before checking for SQLite)
        if not cls.SQLALCHEMY_DATABASE_URI:
            errors.append(
                "DATABASE_URL environment variable is required for production.\n"
                "Set it in environment variable.\n"
                "Example: DATABASE_URL=mysql+pymysql://user:password@host:3306/database?charset=utf8mb4"
            )
            return errors, warnings
        
        # Validate it's MySQL, not SQLite (only if URI is set)
        db_uri_lower = cls.SQLALCHEMY_DATABASE_URI.lower()
        if 'sqlite' in db_uri_lower:
            errors.append(
                "SQLite is not supported for production. MySQL connection is required.\n"
                "Please set DATABASE_URL to a MySQL connection string.\n"
                "Example: DATABASE_URL=mysql+pymysql://user:password@host:3306/database?charset=utf8mb4"
            )
        elif 'mysql' not in db_uri_lower and 'pymysql' not in db_uri_lower:
            errors.append(
                "DATABASE_URL must point to a MySQL database for production.\n"
                f"Current value does not appear to be a MySQL connection string: {cls.SQLALCHEMY_DATABASE_URI[:50]}...\n"
                "Example: DATABASE_URL=mysql+pymysql://user:password@host:3306/database?charset=utf8mb4"
            )
        
        return errors, warnings