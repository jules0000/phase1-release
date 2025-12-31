"""
Standardized Authentication and Authorization Decorators
Provides consistent auth handling across all API endpoints
"""

from functools import wraps
from flask import request, g
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request
from app.models.user import User
from app.utils.responses import APIResponse, ErrorCodes
import logging

logger = logging.getLogger(__name__)

def require_auth(f):
    """
    Require authentication and load user into g.current_user
    Standardized replacement for @jwt_required()
    """
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        try:
            user_id = get_jwt_identity()
            user = User.query.get(user_id)
            
            if not user:
                return APIResponse.error(
                    message="User not found",
                    status_code=401,
                    error_code=ErrorCodes.INVALID_CREDENTIALS
                )
            
            if not user.is_active:
                return APIResponse.error(
                    message="Account is disabled",
                    status_code=401,
                    error_code=ErrorCodes.ACCOUNT_DISABLED
                )
            
            # P2-002 Fix: Re-query user to ensure fresh data (prevent stale user object)
            # Re-query user from database to ensure we have the latest state
            # This prevents using stale user data if account was deactivated after middleware check
            fresh_user = User.query.get(user_id)
            if not fresh_user or not fresh_user.is_active:
                return APIResponse.error(
                    message="Account is disabled or not found",
                    status_code=401,
                    error_code=ErrorCodes.ACCOUNT_DISABLED
                )
            
            # Store fresh user in Flask's g object for use in the request
            g.current_user = fresh_user
            g.current_user_id = user_id
            
            return f(*args, **kwargs)
            
        except Exception as e:
            logger.error(f"Authentication error: {str(e)}")
            return APIResponse.error(
                message="Authentication failed",
                status_code=401,
                error_code=ErrorCodes.TOKEN_INVALID
            )
    
    return decorated_function

def require_admin(f):
    """
    Require admin privileges
    Can be used after @jwt_required() or @require_auth
    If user is not loaded, it will load it from JWT identity
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # If user is not already loaded, load it from JWT
        if not hasattr(g, 'current_user') or not g.current_user:
            try:
                # Try to get user from JWT if not already loaded
                user_id = get_jwt_identity()
                if user_id:
                    user = User.query.get(user_id)
                    if not user:
                        return APIResponse.error(
                            message="User not found",
                            status_code=401,
                            error_code=ErrorCodes.INVALID_CREDENTIALS
                        )
                    
                    if not user.is_active:
                        return APIResponse.error(
                            message="Account is disabled",
                            status_code=401,
                            error_code=ErrorCodes.ACCOUNT_DISABLED
                        )
                    
                    g.current_user = user
                    g.current_user_id = user_id
                else:
                    return APIResponse.error(
                        message="Authentication required",
                        status_code=401,
                        error_code=ErrorCodes.INVALID_CREDENTIALS
                    )
            except Exception as e:
                logger.error(f"Error loading user in require_admin: {str(e)}")
                return APIResponse.error(
                    message="Authentication required",
                    status_code=401,
                    error_code=ErrorCodes.INVALID_CREDENTIALS
                )
        
        if not g.current_user.is_admin:
            return APIResponse.error(
                message="Admin privileges required",
                status_code=403,
                error_code=ErrorCodes.INSUFFICIENT_PERMISSIONS
            )
        
        return f(*args, **kwargs)
    
    return decorated_function

def require_super_admin(f):
    """
    Require super admin privileges
    Must be used after @require_auth
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not hasattr(g, 'current_user') or not g.current_user:
            return APIResponse.error(
                message="Authentication required",
                status_code=401,
                error_code=ErrorCodes.INVALID_CREDENTIALS
            )
        
        if not g.current_user.is_admin or g.current_user.admin_type != 'super_admin':
            return APIResponse.error(
                message="Super admin privileges required",
                status_code=403,
                error_code=ErrorCodes.INSUFFICIENT_PERMISSIONS
            )
        
        return f(*args, **kwargs)
    
    return decorated_function

def require_permission(permission_name):
    """
    Require specific permission
    Must be used after @require_auth
    
    Args:
        permission_name: Name of the required permission
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not hasattr(g, 'current_user') or not g.current_user:
                return APIResponse.error(
                    message="Authentication required",
                    status_code=401,
                    error_code=ErrorCodes.INVALID_CREDENTIALS
                )
            
            # Check if user has the required permission
            from app.models.permissions import UserPermission
            
            permission = UserPermission.query.filter_by(
                user_id=g.current_user.id,
                permission_name=permission_name,
                is_active=True
            ).first()
            
            if not permission and not g.current_user.is_admin:
                return APIResponse.error(
                    message=f"Permission '{permission_name}' required",
                    status_code=403,
                    error_code=ErrorCodes.INSUFFICIENT_PERMISSIONS
                )
            
            return f(*args, **kwargs)
        
        return decorated_function
    return decorator

def optional_auth(f):
    """
    Optional authentication - loads user if token is provided
    Does not require authentication
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            # Try to verify JWT without requiring it
            verify_jwt_in_request(optional=True)
            user_id = get_jwt_identity()
            
            if user_id:
                user = User.query.get(user_id)
                if user and user.is_active:
                    g.current_user = user
                    g.current_user_id = user_id
                else:
                    g.current_user = None
                    g.current_user_id = None
            else:
                g.current_user = None
                g.current_user_id = None
                
        except Exception:
            # If JWT verification fails, continue without authentication
            g.current_user = None
            g.current_user_id = None
        
        return f(*args, **kwargs)
    
    return decorated_function

def rate_limit(requests_per_minute=60):
    """
    Rate limiting decorator using Flask-Limiter
    
    This decorator should be used in combination with Flask-Limiter's @limiter.limit()
    decorator on routes. This function is kept for backward compatibility but
    routes should use @limiter.limit() directly from extensions.
    
    Args:
        requests_per_minute: Maximum requests per minute per user/IP
    
    Note: For new code, use @limiter.limit("X per minute") directly from app.extensions
    """
    def decorator(f):
        # Import limiter here to avoid circular imports
        from app.extensions import limiter
        
        # Apply rate limit using Flask-Limiter
        limited_func = limiter.limit(f"{requests_per_minute} per minute")(f)
        
        return limited_func
    return decorator

def log_user_activity(action, description=None):
    """
    Log user activity for audit purposes
    
    Args:
        action: Action being performed
        description: Optional description
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Execute the function first
            result = f(*args, **kwargs)
            
            # Log activity after successful execution
            if hasattr(g, 'current_user') and g.current_user:
                try:
                    from app.models.user import UserActivityLog
                    from app import db
                    
                    activity = UserActivityLog(
                        user_id=g.current_user.id,
                        action=action,
                        description=description or f"Performed {action}",
                        ip_address=request.remote_addr,
                        user_agent=request.headers.get('User-Agent', ''),
                        extra_metadata={
                            'endpoint': request.endpoint,
                            'method': request.method,
                            'url': request.url
                        }
                    )
                    
                    db.session.add(activity)
                    db.session.commit()
                    
                except Exception as e:
                    logger.error(f"Failed to log user activity: {str(e)}")
                    # Don't fail the request if logging fails
            
            return result
        
        return decorated_function
    return decorator

def validate_json(required_fields=None, optional_fields=None):
    """
    Validate JSON request data
    
    Args:
        required_fields: List of required field names
        optional_fields: List of optional field names with default values
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not request.is_json:
                return APIResponse.error(
                    message="Request must be JSON",
                    status_code=400,
                    error_code=ErrorCodes.INVALID_FORMAT
                )
            
            data = request.get_json()
            if not data:
                return APIResponse.error(
                    message="Invalid JSON data",
                    status_code=400,
                    error_code=ErrorCodes.INVALID_FORMAT
                )
            
            # Check required fields
            if required_fields:
                missing_fields = []
                for field in required_fields:
                    if field not in data or data[field] is None:
                        missing_fields.append(field)
                
                if missing_fields:
                    return APIResponse.error(
                        message="Missing required fields",
                        status_code=400,
                        error_code=ErrorCodes.MISSING_REQUIRED_FIELD,
                        details={'missing_fields': missing_fields}
                    )
            
            # Add optional fields with defaults
            if optional_fields:
                for field, default_value in optional_fields.items():
                    if field not in data:
                        data[field] = default_value
            
            # Store validated data in g for use in the endpoint
            g.json_data = data
            
            return f(*args, **kwargs)
        
        return decorated_function
    return decorator
