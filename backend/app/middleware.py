"""
Middleware for request processing, authentication, and logging
"""

from flask import request, g, jsonify, current_app
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt
from functools import wraps
import time
import logging
import os
from app.models.user import User
from app.errors import AuthenticationError, AuthorizationError, RateLimitError
from app import db

logger = logging.getLogger(__name__)

def register_middleware(app):
    """Register middleware for the Flask app"""
    
    @app.before_request
    def before_request():
        """Process requests before they reach the route handlers"""
        g.start_time = time.time()
        g.user = None
        g.skip_jwt = False
        
        # Skip authentication for certain endpoints
        if request.endpoint in ['auth.login', 'auth.register', 'health.check']:
            return
        
        # Skip auth only for truly public endpoints (explicit public routes)
        # Do NOT blanket bypass /api/v1/modules - individual routes should use @optional_auth
        if request.path.startswith('/api/v1/public'):
            return
        
        # Check if blueprint set skip_jwt flag
        if getattr(g, 'skip_jwt', False):
            return
            
        try:
            verify_jwt_in_request(optional=True)
            user_id = get_jwt_identity()
            
            if user_id:
                user = User.query.get(user_id)
                if user and user.is_active:
                    g.user = user
                else:
                    raise AuthenticationError('User not found or inactive')
                    
        except Exception as e:
            if request.endpoint not in ['auth.login', 'auth.register', 'health.check']:
                logger.warning(f"Authentication failed for {request.endpoint}: {str(e)}")

        # Enforce maintenance mode for non-admin users (learners)
        try:
            from app.models.settings import SystemSetting
            setting = SystemSetting.query.filter_by(key='maintenance_mode').first()
            is_maintenance = bool(setting and ((setting.value is True) or (isinstance(setting.value, dict) and setting.value.get('enabled') is True)))
            if is_maintenance:
                # Allow admins and admin endpoints; block learners from app routes
                is_admin_user = bool(getattr(g, 'user', None) and getattr(g.user, 'is_admin', False))
                # CRITICAL-001 Fix: Correct admin endpoint path from /api/admin to /api/v1/admin
                is_admin_endpoint = request.path.startswith('/api/v1/admin')
                is_auth_endpoint = request.path.startswith('/api/v1/auth')
                is_health_endpoint = request.path.startswith('/api/health') or request.path.startswith('/api/v1/health')
                if not is_admin_user and not is_admin_endpoint and not is_health_endpoint:
                    # Allow login/register to proceed with an explicit maintenance message
                    if is_auth_endpoint:
                        return jsonify({
                            'error': 'maintenance_mode',
                            'message': 'The platform is currently under maintenance. Please try again later.'
                        }), 503
                    # Block other requests for learners
                    return jsonify({
                        'error': 'maintenance_mode',
                        'message': 'The platform is currently under maintenance. Please try again later.'
                    }), 503
        except Exception as e:
            # HIGH-001 Fix: Fail open on maintenance check errors to prevent site-wide outage
            # Log the error but allow access if maintenance check fails (prevents outage if DB temporarily unavailable)
            logger.error(f"Maintenance mode check failed: {str(e)}", exc_info=True)
            # Fail open: If we can't determine maintenance status, allow access
            # This prevents site-wide outage if database is temporarily unavailable
            # The maintenance mode check will work again once the database is available
            pass
    
    @app.after_request
    def after_request(response):
        """Process responses after they are generated"""
        # MEDIUM-002 Fix: Remove manual CORS header setting - Flask-CORS already handles this
        # Flask-CORS is initialized in app/__init__.py with origins=app.config['CORS_ORIGINS']
        # Manual header setting here causes duplication and potential conflicts
        # CORS headers are now handled entirely by Flask-CORS middleware
        
        # Add security headers
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        
        # Add CSP header for API responses
        if request.path.startswith('/api/'):
            response.headers['Content-Security-Policy'] = "default-src 'none'"
        
        # Log request duration
        if hasattr(g, 'start_time'):
            duration = time.time() - g.start_time
            logger.info(f"{request.method} {request.path} - {response.status_code} - {duration:.3f}s")
        
        return response
    
    @app.teardown_appcontext
    def close_db(error):
        """Close database connections after each request to prevent connection leaks"""
        from app import db
        # SQLAlchemy automatically handles session cleanup, but we ensure connections are returned to pool
        db.session.remove()

# NOTE: Authentication decorators have been moved to app.utils.auth_decorators
# Import from there instead: from app.utils.auth_decorators import require_auth, require_admin, require_super_admin
# Rate limiting should use Flask-Limiter from app.extensions - see app.utils.auth_decorators.rate_limit
# These duplicate decorators below are kept for backward compatibility but should not be used in new code

def rate_limit(requests_per_minute=60):
    """
    Legacy rate limiting decorator - DEPRECATED
    Use Flask-Limiter from app.extensions instead: @limiter.limit("X per minute")
    This is kept for backward compatibility only
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Legacy stub implementation - routes should use Flask-Limiter directly
            logger.warning(f"Using deprecated rate_limit decorator on {f.__name__}. Use @limiter.limit() instead.")
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def validate_json(required_fields=None):
    """Decorator to validate JSON request data"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not request.is_json:
                return jsonify({'error': 'Content-Type must be application/json'}), 400
            
            data = request.get_json()
            if not data:
                return jsonify({'error': 'Request body must contain valid JSON'}), 400
            
            if required_fields:
                missing_fields = [field for field in required_fields if field not in data]
                if missing_fields:
                    return jsonify({
                        'error': f'Missing required fields: {", ".join(missing_fields)}'
                    }), 400
            
            g.request_data = data
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def log_user_activity(action, description=None):
    """Decorator to log user activity"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            result = f(*args, **kwargs)
            
            # Log user activity if user is authenticated
            if g.user:
                from app.models.user import UserActivityLog
                activity_log = UserActivityLog(
                    user_id=g.user.id,
                    action=action,
                    description=description,
                    ip_address=request.remote_addr,
                    user_agent=request.headers.get('User-Agent'),
                    extra_metadata={'endpoint': request.endpoint, 'method': request.method}
                )
                db.session.add(activity_log)
                db.session.commit()
            
            return result
        return decorated_function
    return decorator

# CRITICAL-003 Fix: Removed duplicate rate_limit function definition
# Rate limiting should use Flask-Limiter from app.extensions
# The deprecated version above (lines 151-164) is kept for backward compatibility
