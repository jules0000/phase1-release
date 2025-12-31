"""
Neural AI Learning Platform Backend
Flask application factory with all extensions and configurations
"""

from flask import Flask, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_socketio import SocketIO
import os
import logging
from dotenv import load_dotenv, find_dotenv

# Load environment variables
# 1) Try standard .env
# 2) If not found, fall back to env.example so local dev defaults work out-of-the-box
_dotenv_found = load_dotenv(find_dotenv(usecwd=True))
if not _dotenv_found:
    # Fall back to env.example in the backend directory (alongside this file's parent)
    backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    example_env_path = os.path.join(backend_root, 'env.example')
    load_dotenv(example_env_path)

# Initialize extensions
db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
socketio = SocketIO(cors_allowed_origins="*")

def create_app(config_name=None):
    """Application factory pattern"""
    app = Flask(__name__)
    
    # Configuration
    config_name = config_name or os.getenv('FLASK_ENV', 'development')
    
    if config_name == 'production':
        from app.config import ProductionConfig
        app.config.from_object(ProductionConfig)
        config_class = ProductionConfig
    elif config_name == 'testing':
        from app.config import TestingConfig
        app.config.from_object(TestingConfig)
        config_class = TestingConfig
    else:
        from app.config import DevelopmentConfig
        app.config.from_object(DevelopmentConfig)
        config_class = DevelopmentConfig
    
    # Validate configuration
    errors, warnings = config_class.validate_config()
    
    if errors:
        for error in errors:
            app.logger.error(f"Configuration Error: {error}")
        # Always raise on configuration errors - don't allow startup with invalid config
        error_msg = f"Configuration errors found: {'; '.join(errors)}"
        app.logger.error(error_msg)
        raise RuntimeError(error_msg)
    
    if warnings:
        for warning in warnings:
            app.logger.warning(f"Configuration Warning: {warning}")
    
    # Log database connection information
    db_uri = app.config.get('SQLALCHEMY_DATABASE_URI')
    env_database_url = os.environ.get('DATABASE_URL', '')
    
    # Check if DATABASE_URL is missing first (before checking for SQLite)
    if not db_uri or db_uri == '':
        error_msg = (
            "=" * 70 + "\n"
            "ERROR: DATABASE_URL is not configured!\n"
            "=" * 70 + "\n"
            "MySQL connection is required. Please set DATABASE_URL environment variable.\n"
            "\n"
            "Example: DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/neural?charset=utf8mb4\n"
            "\n"
            "If you have a .env file, ensure it contains:\n"
            "  DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/neural?charset=utf8mb4\n"
            "  FLASK_ENV=development\n"
            "\n"
            "Then restart the Flask server.\n"
            "=" * 70
        )
        app.logger.error(error_msg)
        raise RuntimeError("DATABASE_URL environment variable is required. Please set it to a MySQL connection string.")
    
    # Validate MySQL connection (only MySQL is supported)
    db_uri_lower = db_uri.lower()
    is_mysql = 'mysql' in db_uri_lower or 'pymysql' in db_uri_lower
    is_sqlite = 'sqlite' in db_uri_lower
    
    # Redact password for logging
    display_uri = db_uri
    if '@' in display_uri:
        parts = display_uri.split('@')
        if len(parts) == 2:
            user_part = parts[0]
            if '://' in user_part:
                scheme_user = user_part.split('://')
                if len(scheme_user) == 2:
                    scheme = scheme_user[0]
                    user_pass = scheme_user[1]
                    if ':' in user_pass:
                        user, _ = user_pass.split(':', 1)
                        display_uri = f"{scheme}://{user}:***@{parts[1]}"
    
    # Log database connection and validate MySQL
    if is_mysql:
        app.logger.info(f"Database: MySQL - {display_uri}")
    elif is_sqlite:
        # Fail hard if SQLite is detected - SQLite is NOT supported
        error_msg = (
            "=" * 70 + "\n"
            "ERROR: SQLite is NOT supported! Only MySQL is allowed.\n"
            "=" * 70 + "\n"
            f"Detected SQLite database URI: {display_uri}\n"
            "\n"
            "SQLite has been completely removed from this application.\n"
            "You MUST use MySQL for all environments (development, testing, production).\n"
            "\n"
            "Please update your .env file or DATABASE_URL environment variable:\n"
            "  1. Open your .env file in the backend directory\n"
            "  2. Change DATABASE_URL from SQLite to MySQL:\n"
            "     FROM: DATABASE_URL=sqlite:///...\n"
            "     TO:   DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/neural?charset=utf8mb4\n"
            "\n"
            "Example .env file content:\n"
            "  DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/neural?charset=utf8mb4\n"
            "  FLASK_ENV=development\n"
            "\n"
            "Then restart the Flask server.\n"
            "=" * 70
        )
        app.logger.error(error_msg)
        raise RuntimeError("SQLite is NOT supported. Only MySQL is allowed. Please update your .env file or DATABASE_URL environment variable.")
    else:
        # Fail hard if not MySQL - only MySQL is supported
        error_msg = (
            "=" * 70 + "\n"
            "ERROR: Only MySQL database is supported!\n"
            "=" * 70 + "\n"
            f"Detected database URI: {display_uri}\n"
            "\n"
            "MySQL connection is required. Please set DATABASE_URL to a MySQL connection string.\n"
            "Example: DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/neural?charset=utf8mb4\n"
            "\n"
            "If you have a .env file, ensure it contains:\n"
            "  DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/neural?charset=utf8mb4\n"
            "  FLASK_ENV=development\n"
            "\n"
            "Then restart the Flask server.\n"
            "=" * 70
        )
        app.logger.error(error_msg)
        raise RuntimeError("Only MySQL database is supported. Please set DATABASE_URL to a MySQL connection string.")
    
    # Initialize extensions with app
    db.init_app(app)
    migrate.init_app(app, db)
    
    # Create database tables if they don't exist
    # This is important for fresh installations
    with app.app_context():
        try:
            # Test database connection before creating tables
            try:
                # Try to connect to verify the connection is working
                db.engine.connect()
                app.logger.info("Database connection verified")
            except Exception as conn_error:
                app.logger.warning(f"Database connection test failed: {conn_error}")
                app.logger.warning("This might be normal if the database doesn't exist yet")
                # Continue anyway - create_all might still work
            
            # Import all models to ensure they are registered with SQLAlchemy
            from app import models  # noqa: F401
            
            # Create all tables
            db.create_all()
            app.logger.info("Database tables verified/created successfully")
        except AttributeError as e:
            # Handle encoding errors and other attribute errors
            if 'encoding' in str(e) or 'NoneType' in str(e):
                app.logger.error(f"Database connection error (encoding issue): {e}")
                app.logger.error("This usually means the database connection is not properly established.")
                app.logger.error("Please verify:")
                app.logger.error("  1. MySQL server is running")
                app.logger.error("  2. Database exists (create it if needed)")
                app.logger.error("  3. DATABASE_URL is correct")
                app.logger.error(f"  4. Current DATABASE_URL: {display_uri if 'display_uri' in locals() else db_uri}")
                # Don't raise in development - allow app to start and retry later
                if config_name == 'production':
                    raise
            else:
                app.logger.error(f"Failed to create database tables (AttributeError): {e}")
                if config_name == 'production':
                    raise
        except Exception as e:
            app.logger.error(f"Failed to create database tables: {e}")
            app.logger.error(f"Error type: {type(e).__name__}")
            # Don't raise in development - the database might not be ready yet
            if config_name == 'production':
                raise
    
    # Set JWT config but DON'T initialize yet
    app.config['PROPAGATE_EXCEPTIONS'] = True
    app.config['JWT_DECODE_ALGORITHMS'] = ['HS256']
    
    CORS(app, origins=app.config['CORS_ORIGINS'])
    # Use threading mode by default (more reliable on Windows); allow override via config
    async_mode = app.config.get('SOCKETIO_ASYNC_MODE', 'threading')
    try:
        socketio.init_app(app, async_mode=async_mode)
    except ValueError:
        # Fallback to default mode if specified mode is invalid
        socketio.init_app(app, async_mode='threading')
    
    # Initialize JWT FIRST before middleware so verify_jwt_in_request() works
    jwt.init_app(app)
    
    # P2-001 Fix: Register JWT token blacklist callbacks
    from app.utils.token_blacklist import is_blacklisted
    
    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        """Check if token is blacklisted (revoked)"""
        jti = jwt_payload.get('jti')
        return is_blacklisted(jti) if jti else False
    
    # Initialize monitoring and observability
    from app.monitoring import init_monitoring
    init_monitoring(app)
    
    # Initialize security headers
    from app.security_headers import init_security_headers
    init_security_headers(app)
    
    # Register middleware AFTER JWT initialization so JWT is available
    from app.middleware import register_middleware as _register_middleware
    _register_middleware(app)
    
    # Register blueprints - Phase 1 MVP only
    from app.api.v1.health import health_bp
    from app.api.v1.auth import auth_bp
    from app.api.v1.users import users_bp
    from app.api.v1.modules import modules_bp  # Contains public routes at /public/*
    from app.api.v1.progress import progress_bp
    from app.api.v1.quiz import quiz_bp
    from app.api.v1.openai import openai_bp
    from app.api.v1.content import content_bp
    from app.api.v1.dashboard import dashboard_bp
    from app.api.v1.lessons import lessons_bp
    
    app.register_blueprint(health_bp, url_prefix='/api/v1')
    app.register_blueprint(auth_bp, url_prefix='/api/v1/auth')
    app.register_blueprint(users_bp, url_prefix='/api/v1/users')
    app.register_blueprint(modules_bp, url_prefix='/api/v1/modules')
    app.register_blueprint(progress_bp, url_prefix='/api/v1/progress')
    app.register_blueprint(quiz_bp, url_prefix='/api/v1/quiz')
    app.register_blueprint(openai_bp, url_prefix='/api/v1/openai')
    app.register_blueprint(content_bp, url_prefix='/api/v1/content')
    app.register_blueprint(dashboard_bp, url_prefix='/api/v1/dashboard')
    app.register_blueprint(lessons_bp, url_prefix='/api/v1/lessons')
    
    # Register error handlers
    from app.errors import register_error_handlers
    register_error_handlers(app)
    
    # Add root route
    @app.route('/')
    def root():
        # Expose a minimal, sanitized view of the DB URL for diagnostics
        try:
            db_uri = app.config.get('SQLALCHEMY_DATABASE_URI', '')
            # Redact credentials but keep the scheme and host/db for visibility
            if '://' in db_uri:
                scheme, rest = db_uri.split('://', 1)
                # Drop potential creds before '@'
                if '@' in rest:
                    rest = rest.split('@', 1)[1]
                redacted_uri = f"{scheme}://{rest}"
            else:
                redacted_uri = db_uri
        except Exception:
            redacted_uri = 'unknown'
        return jsonify({
            'message': 'Neural AI Backend API',
            'version': '1.0.0',
            'status': 'running',
            'database': redacted_uri,
            'endpoints': {
                'health': '/api/v1/health',
                'auth': '/api/v1/auth',
                'users': '/api/v1/users',
                'admin': '/api/v1/admin'
            }
        }), 200
    
    # ============================================================================
    # SUBSCRIPTION ENDPOINTS (Phase 1 MVP - Stubs returning default data)
    # These endpoints are stubs since subscription features are Phase 2
    # ============================================================================
    
    @app.route('/api/v1/subscription/config', methods=['GET'])
    def get_subscription_config():
        """
        Get public subscription configuration (no authentication required)
        Phase 1 MVP: Returns default configuration since subscription model is not available.
        """
        default_config = {
            'trial_grace_days': 7,
            'trial_total_days': 14,
            'habitual_price_monthly': 39.99,
            'habitual_price_yearly': 399.99,
            'currency': 'USD',
            'payment_url': '/checkout',
            'upgrade_page_title': 'Choose Your Learning Plan',
            'upgrade_page_description': 'Unlock your full potential with our premium features designed to accelerate your AI learning journey.',
            'free_trial_features': [],
            'habitual_features': []
        }
        return jsonify({
            'success': True,
            'config': default_config
        }), 200
    
    @app.route('/api/v1/user/subscription', methods=['GET'])
    @jwt_required()
    def get_user_subscription_root():
        """
        Get the authenticated user's subscription.
        Phase 1 MVP: Returns default free trial subscription since subscription model is not available.
        """
        from flask_jwt_extended import get_jwt_identity
        from app.models.user import User
        from datetime import datetime, timedelta
        
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            if not current_user:
                return jsonify({
                    'success': False,
                    'message': 'User not found',
                    'error_code': 'USER_NOT_FOUND'
                }), 404
            
            # Return default free trial subscription for MVP
            default_subscription = {
                'id': None,
                'user_id': current_user_id,
                'plan_type': 'free_trial',
                'subscription_status': 'trial',
                'trial_start_date': current_user.created_at.isoformat() if current_user.created_at else datetime.utcnow().isoformat(),
                'trial_end_date': (datetime.utcnow() + timedelta(days=14)).isoformat(),
                'is_active': True,
                'is_trial': True,
                'is_subscription_active': False,
                'created_at': current_user.created_at.isoformat() if current_user.created_at else datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }
            
            return jsonify({
                'success': True,
                'subscription': default_subscription
            }), 200
            
        except Exception as error:
            app.logger.error(f'Error getting user subscription: {str(error)}', exc_info=True)
            return jsonify({
                'success': False,
                'message': 'Failed to get subscription',
                'error_code': 'INTERNAL_ERROR'
            }), 500
    
    @app.route('/api/v1/user/subscription/features', methods=['GET'])
    @jwt_required()
    def get_user_subscription_features_root():
        """
        Get the authenticated user's subscription features.
        Phase 1 MVP: Returns default free trial features since subscription model is not available.
        """
        from flask_jwt_extended import get_jwt_identity
        from app.models.user import User
        
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            if not current_user:
                return jsonify({
                    'success': False,
                    'message': 'User not found',
                    'error_code': 'USER_NOT_FOUND'
                }), 404
            
            # Return default free trial features for MVP
            default_features = {
                'ai_prompt_grader': True,
                'prompt_translator': True,
                'interactive_modules': True,
                'quizzes': True,
                'lesson_content': True,
                'progress_tracking': True,
                'basic_ai_features': True
            }
            
            return jsonify({
                'success': True,
                'features': default_features
            }), 200
            
        except Exception as error:
            app.logger.error(f'Error getting subscription features: {str(error)}', exc_info=True)
            return jsonify({
                'success': False,
                'message': 'Failed to get features',
                'error_code': 'INTERNAL_ERROR'
            }), 500
    
    # Register socketio events (optional - skip if service doesn't exist)
    try:
        from app.services.realtime_service import register_socketio_events
        register_socketio_events(socketio, app)
    except ImportError:
        app.logger.warning("realtime_service not available - skipping socketio event registration")
    
    return app
