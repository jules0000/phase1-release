"""
Authentication API endpoints

This module handles all authentication-related operations including:
- User login and registration
- JWT token management (access and refresh tokens)
- Session management
- User profile retrieval
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, create_refresh_token, jwt_required, get_jwt_identity
from werkzeug.security import check_password_hash
from app import db
from app.models.user import User, UserSession, UserActivityLog
from app.utils.auth_decorators import require_auth, log_user_activity
from app.errors import AuthenticationError, ValidationError
from app.utils.responses import APIResponse
from app.extensions import limiter
import uuid
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from sqlalchemy import or_, func

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__)

# ============================================================================
# AUTHENTICATION ENDPOINTS
# ============================================================================

@auth_bp.route('/login', methods=['POST'])
@limiter.limit("5 per 15 minutes", key_func=lambda: request.remote_addr)
def login():
    """
    Authenticate a user and create a new session.
    
    Users can log in with either their email or username.
    On success, returns JWT tokens and user profile information.
    Also creates a session record and logs the login activity.
    """
    try:
        login_request = request.get_json()
        
        # Validate required fields
        if not login_request or not login_request.get('email') or not login_request.get('password'):
            raise ValidationError('Email and password are required')
        
        login_identifier = login_request['email'].strip()
        provided_password = login_request['password']
        
        # Find user by email or username (case-insensitive for email)
        authenticated_user = _find_user_by_identifier(login_identifier)
        
        if not authenticated_user or not authenticated_user.check_password(provided_password):
            raise AuthenticationError('Invalid email or password')
        
        if not authenticated_user.is_active:
            raise AuthenticationError('Account is deactivated')
        
        # Generate JWT tokens for this session
        access_token, refresh_token = _create_authentication_tokens(authenticated_user.id)
        
        # Create session record for tracking
        _create_user_session(authenticated_user.id, request)
        
        # Update last login timestamp
        authenticated_user.last_login = datetime.utcnow()
        
        # Log the login activity
        _log_user_activity(authenticated_user.id, 'login', 'User logged in', request)
        
        # Save all changes to database
        db.session.commit()
        
        # Prepare user data for response
        user_profile_data = _get_user_profile_dict(authenticated_user)
        
        return APIResponse.success(
            data={
                'access_token': access_token,
                'refresh_token': refresh_token,
                'user': user_profile_data
            },
            message='Login successful'
        )
        
    except (ValidationError, AuthenticationError) as error:
        db.session.rollback()
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="AUTHENTICATION_ERROR" if isinstance(error, AuthenticationError) else "VALIDATION_ERROR"
        )
    except Exception as error:
        db.session.rollback()
        logger.exception(f"Login failed with exception: {str(error)}")
        return APIResponse.error(
            message='Login failed',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

def _find_user_by_identifier(identifier: str) -> Optional[User]:
    """
    Find a user by email (case-insensitive) or username.
    
    This allows flexible login - users can use either their
    email address or username to authenticate.
    """
    return User.query.filter(
        or_(
            func.lower(User.email) == identifier.lower(),
            User.username == identifier
        )
    ).first()

def _create_authentication_tokens(user_id: int) -> tuple[str, str]:
    """
    Generate JWT access and refresh tokens for a user.
    
    P2-001 Fix: Include JTI (JWT ID) in tokens for blacklist support.
    
    Returns both tokens as a tuple. Raises exception if
    token creation fails.
    """
    try:
        import uuid
        # P2-001 Fix: Add JTI to tokens for blacklist support
        access_token = create_access_token(identity=user_id, additional_claims={'jti': str(uuid.uuid4())})
        refresh_token = create_refresh_token(identity=user_id, additional_claims={'jti': str(uuid.uuid4())})
        return access_token, refresh_token
    except Exception as token_error:
        db.session.rollback()
        raise AuthenticationError(f'Failed to create authentication tokens: {str(token_error)}')

def _create_user_session(user_id: int, request_obj) -> None:
    """Create a new user session record for tracking and security."""
    new_session = UserSession(
        user_id=user_id,
        token_hash=str(uuid.uuid4()),
        expires_at=datetime.utcnow() + timedelta(days=30),
        ip_address=request_obj.remote_addr,
        user_agent=request_obj.headers.get('User-Agent')
    )
    db.session.add(new_session)

def _log_user_activity(user_id: int, action: str, description: str, request_obj) -> None:
    """
    Log a user activity event.
    
    This is a best-effort operation - if logging fails,
    it won't prevent the main operation from succeeding.
    """
    try:
        activity_log = UserActivityLog(
            user_id=user_id,
            action=action,
            description=description,
            ip_address=request_obj.remote_addr,
            user_agent=request_obj.headers.get('User-Agent')
        )
        db.session.add(activity_log)
    except Exception:
        # Logging failures shouldn't break the main flow
        pass

def _get_user_profile_dict(user: User) -> Dict[str, Any]:
    """
    Convert user object to dictionary for API response.
    
    Falls back to basic fields if to_dict() method fails,
    ensuring we always return valid user data.
    """
    try:
        return user.to_dict()
    except Exception:
        # Fallback to basic user info if serialization fails
        return {
            'id': user.id,
            'email': user.email,
            'username': user.username,
            'full_name': user.full_name,
            'is_admin': user.is_admin,
            'is_active': user.is_active
        }

@auth_bp.route('/register', methods=['POST'])
@limiter.limit("3 per hour", key_func=lambda: request.remote_addr)
def register():
    """
    Register a new user account.
    
    Validates all input fields, checks for existing accounts,
    creates the user, and immediately logs them in by returning
    authentication tokens.
    """
    try:
        registration_data = request.get_json()
        
        # Check for required fields
        required_fields = ['email', 'password', 'full_name', 'username']
        missing_fields = [
            field for field in required_fields 
            if not registration_data.get(field)
        ]
        
        if missing_fields:
            raise ValidationError(
                f'Missing required fields: {", ".join(missing_fields)}'
            )
        
        # Extract and normalize input data
        email_address = registration_data['email'].lower().strip()
        password = registration_data['password']
        display_name = registration_data['full_name'].strip()
        chosen_username = registration_data['username'].strip()
        
        # Validate all inputs using utility functions
        from app.utils.validation import (
            validate_email, validate_password, 
            validate_username, sanitize_input
        )
        validate_email(email_address)
        validate_password(password)
        validate_username(chosen_username)
        display_name = sanitize_input(display_name, max_length=120)
        
        # Check for existing accounts
        _check_email_not_taken(email_address)
        _check_username_not_taken(chosen_username)
        
        # Create the new user account
        new_user = User(
            email=email_address,
            username=chosen_username,
            full_name=display_name
        )
        new_user.set_password(password)
        db.session.add(new_user)
        db.session.flush()  # Get user ID before creating session
        
        # Generate authentication tokens
        access_token, refresh_token = _create_authentication_tokens(new_user.id)
        
        # Create initial session
        _create_user_session(new_user.id, request)
        
        # Log registration activity
        _log_user_activity(new_user.id, 'register', 'User registered', request)
        
        db.session.commit()
        
        return APIResponse.success(
            data={
                'access_token': access_token,
                'refresh_token': refresh_token,
                'user': new_user.to_dict()
            },
            message='Registration successful',
            status_code=201
        )
        
    except (ValidationError, AuthenticationError) as error:
        db.session.rollback()
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="AUTHENTICATION_ERROR" if isinstance(error, AuthenticationError) else "VALIDATION_ERROR"
        )
    except Exception as error:
        db.session.rollback()
        return APIResponse.error(
            message='Registration failed',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

def _check_email_not_taken(email: str) -> None:
    """Verify that the email address is not already registered."""
    if User.query.filter_by(email=email).first():
        raise ValidationError('Email already registered')

def _check_username_not_taken(username: str) -> None:
    """Verify that the username is not already taken."""
    if User.query.filter_by(username=username).first():
        raise ValidationError('Username already taken')

@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """
    Get the authenticated user's profile information.
    
    Uses the JWT token to identify the current user and
    returns their complete profile data.
    """
    try:
        current_user_id = get_jwt_identity()
        current_user = User.query.get(current_user_id)
        
        if not current_user:
            raise AuthenticationError('User not found')
        
        return APIResponse.success(
            data={'user': current_user.to_dict()},
            message='User profile retrieved successfully'
        )
        
    except AuthenticationError as error:
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="AUTHENTICATION_ERROR"
        )
    except Exception as error:
        return APIResponse.error(
            message='Failed to get user profile',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """
    Refresh an expired access token using a valid refresh token.
    
    This allows users to stay logged in without re-authenticating
    as long as their refresh token is still valid.
    """
    try:
        current_user_id = get_jwt_identity()
        
        if not current_user_id:
            logger.warning('Token refresh attempted with invalid user identity')
            raise AuthenticationError('Invalid refresh token')
        
        # Database connection error handling
        try:
            current_user = User.query.get(current_user_id)
        except Exception as db_error:
            logger.error(f'Database error during token refresh for user {current_user_id}: {str(db_error)}', exc_info=True)
            db.session.rollback()
            raise AuthenticationError('Database connection error')
        
        if not current_user:
            logger.warning(f'Token refresh attempted for non-existent user {current_user_id}')
            raise AuthenticationError('User not found')
        
        if not current_user.is_active:
            logger.warning(f'Token refresh attempted for inactive user {current_user_id}')
            raise AuthenticationError('User account is inactive')
        
        # Generate a new access token with JTI for blacklist support
        try:
            new_access_token = create_access_token(identity=current_user.id, additional_claims={'jti': str(uuid.uuid4())})
        except Exception as token_error:
            logger.error(f'Error creating access token for user {current_user_id}: {str(token_error)}', exc_info=True)
            raise AuthenticationError('Failed to generate new token')
        
        logger.info(f'Token refreshed successfully for user {current_user_id}')
        return APIResponse.success(
            data={'access_token': new_access_token},
            message='Token refreshed successfully'
        )
        
    except AuthenticationError as error:
        logger.warning(f'Authentication error during token refresh: {str(error)}')
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="AUTHENTICATION_ERROR"
        )
    except Exception as error:
        logger.error(f'Unexpected error during token refresh: {str(error)}', exc_info=True)
        db.session.rollback()
        return APIResponse.error(
            message='Token refresh failed',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@auth_bp.route('/logout', methods=['POST'])
@jwt_required()
@log_user_activity('logout', 'User logged out')
def logout():
    """
    Log out the authenticated user by invalidating their sessions.
    
    Marks all active sessions for this user as inactive, effectively
    logging them out from all devices.
    """
    try:
        current_user_id = get_jwt_identity()
        
        # Deactivate all active sessions for this user
        UserSession.query.filter_by(
            user_id=current_user_id, 
            is_active=True
        ).update({'is_active': False})
        
        # P0 Fix: Add current token to blacklist to invalidate it immediately
        from flask_jwt_extended import get_jwt
        from app.utils.token_blacklist import add_to_blacklist
        
        try:
            jwt_data = get_jwt()
            jti = jwt_data.get('jti')  # JWT ID
            if jti:
                # Calculate remaining TTL from token expiration
                exp = jwt_data.get('exp')
                if exp:
                    import time
                    remaining_ttl = max(0, int(exp - time.time()))
                else:
                    remaining_ttl = None  # Will use default
                
                add_to_blacklist(jti, expires_in_seconds=remaining_ttl, is_refresh_token=False)
        except Exception as e:
            # Log but don't fail logout if blacklist fails
            logger.warning(f"Failed to blacklist token on logout: {str(e)}")
        
        db.session.commit()
        
        return APIResponse.success(
            message='Logged out successfully'
        )
        
    except Exception as error:
        db.session.rollback()
        return APIResponse.error(
            message='Logout failed',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )
