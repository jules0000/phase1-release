"""
User management API endpoints

This module handles all user-related operations including:
- User profiles and settings
- Progress tracking and achievements
- Notifications management
- Admin user management functions
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models.user import User, UserActivityLog
from app.models.progress import UserProgress, XPTransaction
# Phase 2 models (not available in MVP)
try:
    from app.models.achievements import UserAchievement
except ImportError:
    UserAchievement = None
try:
    from app.models.notifications import UserNotification
except ImportError:
    UserNotification = None
try:
    from app.models.settings import UserSettings, UserNotificationPreferences
except ImportError:
    UserSettings = None
    UserNotificationPreferences = None
from app.utils.auth_decorators import require_auth, require_admin, require_super_admin, log_user_activity
from app.errors import ValidationError, NotFoundError
from app.utils.responses import APIResponse
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

users_bp = Blueprint('users', __name__)

# ============================================================================
# USER PROFILE ENDPOINTS
# ============================================================================

@users_bp.route('/profile', methods=['GET'])
@jwt_required()
def get_profile():
    """
    Retrieve the authenticated user's profile information.
    
    Returns all public profile data including username, email,
    level, XP, achievements, and other user details.
    """
    try:
        current_user_id = get_jwt_identity()
        current_user = User.query.get(current_user_id)
        
        if not current_user:
            raise NotFoundError('User not found')
        
        # Refresh user object to ensure we have the latest data from database
        db.session.refresh(current_user)
        
        return APIResponse.success(
            data={'user': current_user.to_dict()},
            message="Profile retrieved successfully"
        )
        
    except NotFoundError as error:
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="USER_NOT_FOUND"
        )
    except Exception as error:
        return APIResponse.error(
            message="Failed to get profile",
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@users_bp.route('/profile', methods=['PUT'])
@jwt_required()
@log_user_activity('update_profile', 'User updated profile')
def update_profile():
    """
    Update the authenticated user's profile information.
    
    Users can update their display name, username, bio, location,
    website, and avatar. Username must be unique across all users.
    """
    try:
        current_user_id = get_jwt_identity()
        current_user = User.query.get(current_user_id)
        
        if not current_user:
            raise NotFoundError('User not found')
        
        update_data = request.get_json()
        
        # Update each field if provided (with validation)
        _update_profile_field(current_user, 'full_name', update_data)
        _update_username_if_provided(current_user, update_data)
        _update_profile_field(current_user, 'bio', update_data)
        _update_profile_field(current_user, 'location', update_data)
        _update_profile_field(current_user, 'website', update_data)
        _update_profile_field(current_user, 'avatar_url', update_data)
        
        current_user.updated_at = datetime.utcnow()
        db.session.commit()
        
        return APIResponse.success(
            data={'user': current_user.to_dict()},
            message="Profile updated successfully"
        )
        
    except (ValidationError, NotFoundError) as error:
        # MEDIUM-001 Fix: Rollback on validation errors to prevent database inconsistency
        db.session.rollback()
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="VALIDATION_ERROR" if isinstance(error, ValidationError) else "USER_NOT_FOUND"
        )
    except Exception as error:
        db.session.rollback()
        return APIResponse.error(
            message="Failed to update profile",
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

def _update_profile_field(user: User, field_name: str, update_data: Dict[str, Any]) -> None:
    """Update a single profile field if it's provided in the request."""
    if field_name in update_data:
        setattr(user, field_name, str(update_data[field_name]).strip())

def _update_username_if_provided(user: User, update_data: Dict[str, Any]) -> None:
    """
    Update username with uniqueness validation.
    
    Ensures the new username isn't already taken by another user.
    CRITICAL-002 Fix: Use database-level locking to prevent race conditions.
    """
    if 'username' in update_data:
        new_username = update_data['username'].strip()
        # CRITICAL-002 Fix: Use with_for_update() to lock row and prevent race conditions
        # This ensures atomic check-and-update operation
        from sqlalchemy import or_
        conflicting_user = User.query.filter(
            User.username == new_username,
            User.id != user.id
        ).with_for_update().first()  # Row-level lock prevents concurrent updates
        
        if conflicting_user:
            raise ValidationError('Username already taken')
        
        user.username = new_username
        # Database unique constraint on username column provides additional protection

@users_bp.route('/progress', methods=['GET'])
@jwt_required()
def get_progress():
    """
    Get the authenticated user's learning progress.
    
    Returns progress data including completed lessons, XP earned,
    current level, and learning statistics. Creates a progress
    record if one doesn't exist yet.
    """
    try:
        current_user_id = get_jwt_identity()
        current_user = User.query.get(current_user_id)
        
        if not current_user:
            raise NotFoundError('User not found')
        
        # Get or create progress record
        user_progress = UserProgress.query.filter_by(user_id=current_user_id).first()
        if not user_progress:
            # New user - initialize their progress tracking
            user_progress = UserProgress(user_id=current_user_id)
            db.session.add(user_progress)
            db.session.commit()
        else:
            # Refresh progress object to ensure we have the latest data from database
            db.session.refresh(user_progress)
        
        return APIResponse.success(
            data={'progress': user_progress.to_dict()},
            message="Progress retrieved successfully"
        )
        
    except NotFoundError as error:
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="USER_NOT_FOUND"
        )
    except Exception as error:
        return APIResponse.error(
            message="Failed to get progress",
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@users_bp.route('/xp-transactions', methods=['GET'])
@jwt_required()
def get_xp_transactions():
    """
    Get paginated history of XP transactions for the authenticated user.
    
    Shows when and why XP was earned or spent, helping users
    understand their learning journey and progress.
    """
    try:
        current_user_id = get_jwt_identity()
        page_number = request.args.get('page', 1, type=int)
        items_per_page = request.args.get('per_page', 20, type=int)
        
        # Fetch transactions, most recent first
        xp_transactions = XPTransaction.query.filter_by(user_id=current_user_id)\
            .order_by(XPTransaction.timestamp.desc())\
            .paginate(page=page_number, per_page=items_per_page, error_out=False)
        
        transactions_data = [transaction.to_dict() for transaction in xp_transactions.items]
        
        return APIResponse.paginated(
            data=transactions_data,
            page=page_number,
            per_page=items_per_page,
            total=xp_transactions.total,
            message="XP transactions retrieved successfully"
        )
        
    except Exception as error:
        import logging
        logging.getLogger(__name__).error(f"Error getting XP transactions: {error}", exc_info=True)
        return APIResponse.error(
            message="Failed to get XP transactions",
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@users_bp.route('/achievements', methods=['GET'])
@jwt_required()
def get_achievements():
    """
    Get all achievements earned by the authenticated user.
    
    Returns a list of badges, milestones, and accomplishments
    sorted by most recently earned first.
    """
    try:
        current_user_id = get_jwt_identity()
        
        earned_achievements = UserAchievement.query.filter_by(user_id=current_user_id)\
            .order_by(UserAchievement.earned_date.desc())\
            .all()
        
        return APIResponse.success(
            data={'achievements': [achievement.to_dict() for achievement in earned_achievements]},
            message="Achievements retrieved successfully"
        )
        
    except Exception as error:
        return APIResponse.error(
            message="Failed to get achievements",
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@users_bp.route('/notifications', methods=['GET'])
@jwt_required()
def get_notifications():
    """
    Get paginated notifications for the authenticated user.
    
    Can filter to show only unread notifications. Always includes
    the total count of unread notifications in the response.
    """
    try:
        current_user_id = get_jwt_identity()
        show_only_unread = request.args.get('unread', 'false').lower() == 'true'
        page_number = request.args.get('page', 1, type=int)
        items_per_page = request.args.get('per_page', 20, type=int)
        
        # Build query based on filter
        notification_query = UserNotification.query.filter_by(user_id=current_user_id)
        
        if show_only_unread:
            notification_query = notification_query.filter_by(is_read=False)
        
        # Get paginated results, newest first
        paginated_notifications = notification_query.order_by(
            UserNotification.created_at.desc()
        ).paginate(page=page_number, per_page=items_per_page, error_out=False)
        
        # Count unread notifications (regardless of filter)
        unread_count = UserNotification.query.filter_by(
            user_id=current_user_id, 
            is_read=False
        ).count()
        
        return APIResponse.paginated(
            data=[notification.to_dict() for notification in paginated_notifications.items],
            page=page_number,
            per_page=items_per_page,
            total=paginated_notifications.total,
            additional_data={'unread_count': unread_count},
            message="Notifications retrieved successfully"
        )
        
    except Exception as error:
        return APIResponse.error(
            message="Failed to get notifications",
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@users_bp.route('/notifications/<int:notification_id>/read', methods=['PUT'])
@jwt_required()
def mark_notification_read(notification_id):
    """
    Mark a specific notification as read.
    
    Users can only mark their own notifications as read.
    Updates the read timestamp for tracking purposes.
    """
    try:
        current_user_id = get_jwt_identity()
        target_notification = UserNotification.query.filter_by(
            id=notification_id, 
            user_id=current_user_id
        ).first()
        
        if not target_notification:
            raise NotFoundError('Notification not found')
        
        target_notification.is_read = True
        target_notification.read_at = datetime.utcnow()
        db.session.commit()
        
        return APIResponse.success(
            data={'notification': target_notification.to_dict()},
            message="Notification marked as read"
        )
        
    except NotFoundError as error:
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="RESOURCE_NOT_FOUND"
        )
    except Exception as error:
        db.session.rollback()
        return APIResponse.error(
            message="Failed to mark notification as read",
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@users_bp.route('/settings', methods=['GET'])
@jwt_required()
def get_settings():
    """
    Get the authenticated user's application settings.
    
    Returns preferences for theme, language, notifications, and
    learning preferences. Returns defaults if UserSettings model is not available (Phase 1 MVP).
    """
    current_user_id = None
    try:
        current_user_id = get_jwt_identity()
        
        # Verify user exists
        if not current_user_id:
            return APIResponse.error(
                message="Invalid authentication token",
                status_code=401,
                error_code="AUTHENTICATION_ERROR"
            )
        
        current_user = User.query.get(current_user_id)
        if not current_user:
            raise NotFoundError('User not found')
        
        # Helper function to get default settings
        def get_default_settings():
            # Use user's preferred_ai_model if available
            ai_model = getattr(current_user, 'preferred_ai_model', 'gpt-4')
            return {
                'id': None,
                'user_id': current_user_id,
                'theme': 'light',
                'language': getattr(current_user, 'preferred_language', 'en'),
                'timezone': getattr(current_user, 'timezone', 'UTC'),
                'difficulty_preference': 'medium',
                'ai_model_preference': ai_model,
                'learning_style': 'balanced',
                'email_notifications': True,
                'push_notifications': True,
                'lesson_reminders': True,
                'achievement_alerts': True,
                'weekly_progress': True,
                'profile_visibility': 'public',
                'show_progress': True,
                'show_achievements': True,
                'skill_levels': {},
                'preferences': {},
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }
        
        # Phase 1 MVP: UserSettings model not available, return defaults
        if UserSettings is None:
            return APIResponse.success(
                data={'settings': get_default_settings()},
                message="Settings retrieved successfully (using defaults)"
            )
        
        # Get or create settings with proper error handling
        user_settings = None
        try:
            user_settings = UserSettings.query.filter_by(user_id=current_user_id).first()
        except Exception as query_error:
            # Table might not exist or there's a schema issue
            logger.error(f'Error querying user_settings table for user {current_user_id}: {str(query_error)}', exc_info=True)
            # Return default settings immediately if table can't be accessed
            return APIResponse.success(
                data={'settings': get_default_settings()},
                message="Settings retrieved successfully (using defaults)"
            )
        
        if not user_settings:
            try:
                # First time accessing settings - create defaults
                user_settings = UserSettings(user_id=current_user_id)
                db.session.add(user_settings)
                db.session.commit()
            except Exception as db_error:
                db.session.rollback()
                logger.error(f'Database error creating settings for user {current_user_id}: {str(db_error)}', exc_info=True)
                # Try to get settings again in case it was created by another process
                try:
                    user_settings = UserSettings.query.filter_by(user_id=current_user_id).first()
                except Exception as retry_error:
                    logger.error(f'Error retrying query after create failure: {str(retry_error)}')
                    # Return default settings if we can't create or query
                    return APIResponse.success(
                        data={'settings': get_default_settings()},
                        message="Settings retrieved successfully (using defaults)"
                    )
                if not user_settings:
                    # Return default settings if we can't create
                    return APIResponse.success(
                        data={'settings': get_default_settings()},
                        message="Settings retrieved successfully (using defaults)"
                    )
        
        return APIResponse.success(
            data={'settings': user_settings.to_dict()},
            message="Settings retrieved successfully"
        )
        
    except NotFoundError as error:
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="USER_NOT_FOUND"
        )
    except Exception as error:
        logger.error(f'Error getting user settings for user {current_user_id}: {str(error)}', exc_info=True)
        db.session.rollback()
        return APIResponse.error(
            message="Failed to get settings",
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@users_bp.route('/settings', methods=['PUT'])
@jwt_required()
@log_user_activity('update_settings', 'User updated settings')
def update_settings():
    """
    Update the authenticated user's application settings.
    
    Users can customize their experience including theme, language,
    notification preferences, and learning style. Only whitelisted
    fields can be updated for security.
    
    Phase 1 MVP: Settings are not persisted (UserSettings model not available).
    Updates are accepted and returned but not saved to database.
    """
    current_user_id = None
    try:
        current_user_id = get_jwt_identity()
        
        # Verify user exists
        current_user = User.query.get(current_user_id)
        if not current_user:
            raise NotFoundError('User not found')
        
        update_data = request.get_json() or {}
        
        # Whitelist of fields that users are allowed to update
        updatable_setting_fields = [
            'theme', 'language', 'timezone', 'difficulty_preference',
            'ai_model_preference', 'learning_style', 'email_notifications',
            'push_notifications', 'lesson_reminders', 'achievement_alerts',
            'weekly_progress', 'profile_visibility', 'show_progress', 'show_achievements'
        ]
        
        # Phase 1 MVP: UserSettings model not available, update User model fields and return mock settings
        if UserSettings is None:
            # Update User model fields if provided
            if 'preferred_ai_model' in update_data or 'ai_model_preference' in update_data:
                ai_model = update_data.get('ai_model_preference') or update_data.get('preferred_ai_model')
                if ai_model:
                    current_user.preferred_ai_model = ai_model
            if 'language' in update_data:
                current_user.preferred_language = update_data['language']
            if 'timezone' in update_data:
                current_user.timezone = update_data['timezone']
            
            try:
                db.session.commit()
            except Exception:
                db.session.rollback()
            
            # Build response with updated values (merged with defaults)
            default_settings = {
                'id': None,
                'user_id': current_user_id,
                'theme': update_data.get('theme', 'light'),
                'language': update_data.get('language', getattr(current_user, 'preferred_language', 'en')),
                'timezone': update_data.get('timezone', getattr(current_user, 'timezone', 'UTC')),
                'difficulty_preference': update_data.get('difficulty_preference', 'medium'),
                'ai_model_preference': update_data.get('ai_model_preference', getattr(current_user, 'preferred_ai_model', 'gpt-4')),
                'learning_style': update_data.get('learning_style', 'balanced'),
                'email_notifications': update_data.get('email_notifications', True),
                'push_notifications': update_data.get('push_notifications', True),
                'lesson_reminders': update_data.get('lesson_reminders', True),
                'achievement_alerts': update_data.get('achievement_alerts', True),
                'weekly_progress': update_data.get('weekly_progress', True),
                'profile_visibility': update_data.get('profile_visibility', 'public'),
                'show_progress': update_data.get('show_progress', True),
                'show_achievements': update_data.get('show_achievements', True),
                'skill_levels': update_data.get('skill_levels', {}),
                'preferences': update_data.get('preferences', {}),
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }
            
            return APIResponse.success(
                data={'settings': default_settings},
                message="Settings updated successfully (not persisted in MVP)"
            )
        
        # Phase 2: UserSettings model available, use it
        user_settings = UserSettings.query.filter_by(user_id=current_user_id).first()
        
        if not user_settings:
            # Create settings record if it doesn't exist
            user_settings = UserSettings(user_id=current_user_id)
            db.session.add(user_settings)
        
        # Update only whitelisted fields
        for field_name in updatable_setting_fields:
            if field_name in update_data:
                setattr(user_settings, field_name, update_data[field_name])
        
        user_settings.updated_at = datetime.utcnow()
        db.session.commit()
        
        return APIResponse.success(
            data={'settings': user_settings.to_dict()},
            message="Settings updated successfully"
        )
        
    except NotFoundError as error:
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="USER_NOT_FOUND"
        )
    except Exception as error:
        logger.error(f'Error updating user settings for user {current_user_id}: {str(error)}', exc_info=True)
        db.session.rollback()
        return APIResponse.error(
            message="Failed to update settings",
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@users_bp.route('/change-password', methods=['POST'])
@jwt_required()
@log_user_activity('change_password', 'User changed password')
def change_password():
    """
    Change the authenticated user's password.
    
    Requires the current password for verification, then sets
    the new password. Passwords are securely hashed before storage.
    """
    try:
        current_user_id = get_jwt_identity()
        current_user = User.query.get(current_user_id)
        
        if not current_user:
            raise NotFoundError('User not found')
        
        password_data = request.get_json()
        current_password = password_data.get('current_password')
        new_password = password_data.get('new_password')
        
        # Validate both passwords are provided
        if not current_password or not new_password:
            raise ValidationError('Current password and new password are required')
        
        # Verify current password is correct
        if not current_user.check_password(current_password):
            raise ValidationError('Current password is incorrect')
        
        # P1 Fix: Validate new password strength
        from app.utils.validation import validate_password
        validate_password(new_password)
        
        # Set new password (will be hashed automatically)
        current_user.set_password(new_password)
        current_user.updated_at = datetime.utcnow()
        db.session.commit()
        
        return APIResponse.success(
            message='Password changed successfully'
        )
        
    except (ValidationError, NotFoundError) as error:
        # MEDIUM-001 Fix: Rollback on validation errors to prevent database inconsistency
        db.session.rollback()
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="VALIDATION_ERROR" if isinstance(error, ValidationError) else "NOT_FOUND"
        )
    except Exception as error:
        db.session.rollback()
        return APIResponse.error(
            message='Failed to change password',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

# ============================================================================
# ADMIN USER MANAGEMENT ENDPOINTS
# ============================================================================
# These endpoints are restricted to administrators and provide
# system-wide user management capabilities.

@users_bp.route('/', methods=['GET'])
@jwt_required()
@require_admin
def get_all_users():
    """Get paginated user list with search/filter (admin only)"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        search = request.args.get('search', '')
        status = request.args.get('status', '')
        
        query = User.query
        
        if search:
            query = query.filter(
                db.or_(
                    User.username.contains(search),
                    User.email.contains(search),
                    User.full_name.contains(search)
                )
            )
        
        if status:
            if status == 'active':
                query = query.filter_by(is_active=True)
            elif status == 'inactive':
                query = query.filter_by(is_active=False)
            elif status == 'admin':
                query = query.filter_by(is_admin=True)
        
        users = query.order_by(User.created_at.desc())\
            .paginate(page=page, per_page=per_page, error_out=False)
        
        return APIResponse.paginated(
            data=[user.to_dict() for user in users.items],
            page=page,
            per_page=per_page,
            total=users.total,
            message="Users retrieved successfully"
        )
        
    except Exception as e:
        return APIResponse.error(
            message="Failed to get users",
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@users_bp.route('/<int:user_id>', methods=['GET'])
@jwt_required()
@require_admin
def get_user_details(user_id):
    """Get user details (admin only)"""
    try:
        user = User.query.get(user_id)
        
        if not user:
            raise NotFoundError('User not found')
        
        # Get user activity history
        activity_logs = UserActivityLog.query.filter_by(user_id=user_id)\
            .order_by(UserActivityLog.timestamp.desc())\
            .limit(10).all()
        
        return APIResponse.success(
            data={
                'user': user.to_dict(),
                'recent_activity': [log.to_dict() for log in activity_logs]
            },
            message="User details retrieved successfully"
        )
        
    except NotFoundError as e:
        return APIResponse.error(
            message=e.message,
            status_code=e.status_code,
            error_code="NOT_FOUND"
        )
    except Exception as e:
        return APIResponse.error(
            message='Failed to get user details',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@users_bp.route('/<int:user_id>', methods=['PUT'])
@jwt_required()
@require_admin
@log_user_activity('update_user', 'Admin updated user')
def update_user(user_id):
    """Update user data and permissions (admin only)"""
    try:
        admin_id = get_jwt_identity()
        data = request.get_json()
        
        user = User.query.get(user_id)
        if not user:
            raise NotFoundError('User not found')
        
        # Update allowed fields
        if 'is_active' in data:
            user.is_active = data['is_active']
        if 'is_admin' in data:
            user.is_admin = data['is_admin']
        if 'admin_type' in data:
            user.admin_type = data['admin_type']
        if 'level' in data:
            user.level = data['level']
        if 'total_xp' in data:
            user.total_xp = data['total_xp']
        if 'full_name' in data:
            user.full_name = data['full_name']
        if 'email' in data:
            # Check if email is already taken
            existing_user = User.query.filter_by(email=data['email']).first()
            if existing_user and existing_user.id != user.id:
                raise ValidationError('Email already taken')
            user.email = data['email']
        if 'username' in data:
            # Check if username is already taken
            existing_user = User.query.filter_by(username=data['username']).first()
            if existing_user and existing_user.id != user.id:
                raise ValidationError('Username already taken')
            user.username = data['username']
        
        user.updated_at = datetime.utcnow()
        
        # Log admin action
        from app.models.admin import AdminLog
        admin_log = AdminLog(
            admin_id=admin_id,
            action='update_user',
            target_type='user',
            target_id=user_id,
            details=data,
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent')
        )
        db.session.add(admin_log)
        
        db.session.commit()
        
        return APIResponse.success(
            data={'user': user.to_dict()},
            message='User updated successfully'
        )
        
    except (ValidationError, NotFoundError) as e:
        # MEDIUM-001 Fix: Rollback on validation errors to prevent database inconsistency
        db.session.rollback()
        return APIResponse.error(
            message=e.message,
            status_code=e.status_code,
            error_code="VALIDATION_ERROR" if isinstance(e, ValidationError) else "NOT_FOUND"
        )
    except Exception as e:
        db.session.rollback()
        return APIResponse.error(
            message='Failed to update user',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@users_bp.route('/<int:user_id>', methods=['DELETE'])
@jwt_required()
@require_super_admin
@log_user_activity('delete_user', 'Admin deleted user')
def delete_user(user_id):
    """Delete user account (super admin only)"""
    try:
        admin_id = get_jwt_identity()
        
        user = User.query.get(user_id)
        if not user:
            raise NotFoundError('User not found')
        
        # Log admin action
        from app.models.admin import AdminLog
        admin_log = AdminLog(
            admin_id=admin_id,
            action='delete_user',
            target_type='user',
            target_id=user_id,
            details={'username': user.username, 'email': user.email},
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent')
        )
        db.session.add(admin_log)
        
        # Delete user (cascade will handle related records)
        db.session.delete(user)
        db.session.commit()
        
        return APIResponse.success(
            message='User deleted successfully'
        )
        
    except NotFoundError as e:
        return APIResponse.error(
            message=e.message,
            status_code=e.status_code,
            error_code="NOT_FOUND"
        )
    except Exception as e:
        db.session.rollback()
        return APIResponse.error(
            message='Failed to delete user',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@users_bp.route('/<int:user_id>/reset-password', methods=['POST'])
@jwt_required()
@require_admin
@log_user_activity('reset_user_password', 'Admin reset user password')
def reset_user_password(user_id):
    """Reset user password (admin only)"""
    try:
        admin_id = get_jwt_identity()
        # Always parse JSON safely; default to empty dict when no body is sent
        data = request.get_json(silent=True) or {}
        
        user = User.query.get(user_id)
        if not user:
            raise NotFoundError('User not found')
        
        # If new_password provided, set it directly; otherwise generate a temporary one
        new_password = data.get('new_password') if isinstance(data, dict) else None
        if new_password:
            # P1 Fix: Validate password strength (not just length)
            from app.utils.validation import validate_password
            validate_password(new_password)
            user.set_password(new_password)
            response_payload = {
                'message': 'Password updated successfully'
            }
        else:
            import secrets
            import string
            temp_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(12))
            user.set_password(temp_password)
            response_payload = {
                'message': 'Temporary password generated',
                'temporary_password': temp_password
            }
        user.updated_at = datetime.utcnow()
        
        # Log admin action
        from app.models.admin import AdminLog
        admin_log = AdminLog(
            admin_id=admin_id,
            action='reset_user_password',
            target_type='user',
            target_id=user_id,
            details={'username': user.username, 'mode': 'set' if new_password else 'temporary'},
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent')
        )
        db.session.add(admin_log)
        
        db.session.commit()
        
        # In production, notify via email; here we return a minimal payload
        return APIResponse.success(
            data=response_payload,
            message=response_payload.get('message', 'Password reset successfully')
        )
        
    except NotFoundError as e:
        return APIResponse.error(
            message=e.message,
            status_code=e.status_code,
            error_code="NOT_FOUND"
        )
    except Exception as e:
        db.session.rollback()
        return APIResponse.error(
            message='Failed to reset password',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@users_bp.route('/<int:user_id>/set-password', methods=['POST'])
@jwt_required()
@require_admin
@log_user_activity('set_user_password', 'Admin set user password')
def set_user_password(user_id):
    """Admin: directly set a user's password"""
    try:
        admin_id = get_jwt_identity()
        user = User.query.get(user_id)
        if not user:
            raise NotFoundError('User not found')

        data = request.get_json() or {}
        new_password = data.get('new_password')
        if not new_password:
            raise ValidationError('New password is required')
        
        # P1 Fix: Validate password strength (not just length)
        from app.utils.validation import validate_password
        validate_password(new_password)

        user.set_password(new_password)
        user.updated_at = datetime.utcnow()

        # Log admin action
        from app.models.admin import AdminLog
        admin_log = AdminLog(
            admin_id=admin_id,
            action='set_user_password',
            target_type='user',
            target_id=user_id,
            details={'username': user.username},
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent')
        )
        db.session.add(admin_log)

        db.session.commit()

        return APIResponse.success(
            message='Password updated successfully'
        )

    except (ValidationError, NotFoundError) as e:
        return APIResponse.error(
            message=e.message,
            status_code=e.status_code,
            error_code="VALIDATION_ERROR" if isinstance(e, ValidationError) else "NOT_FOUND"
        )
    except Exception as e:
        db.session.rollback()
        return APIResponse.error(
            message='Failed to set password',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

# ============================================================================
# PUBLIC SYSTEM SETTINGS ENDPOINTS (for learners)
# ============================================================================

@users_bp.route('/public-settings/<key>', methods=['GET'])
@jwt_required()
def get_public_setting(key):
    """Get a public system setting (accessible to all authenticated users)"""
    try:
        # Phase 1 MVP: SystemSetting model not available, return empty/default
        try:
            from app.models.settings import SystemSetting
        except ImportError:
            SystemSetting = None
        
        if SystemSetting is None:
            return APIResponse.success(
                data={
                    'setting': {
                        'key': key,
                        'value': {}
                    }
                },
                message="Setting retrieved successfully (using defaults)"
            )
        
        setting = SystemSetting.query.filter_by(key=key, is_public=True).first()
        
        if not setting:
            # Return empty/default value if setting doesn't exist or isn't public
            return APIResponse.success(
                data={
                    'setting': {
                        'key': key,
                        'value': {}
                    }
                },
                message="Setting retrieved successfully"
            )
        
        return APIResponse.success(
            data={'setting': setting.to_dict()},
            message="Setting retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f'Error getting public setting {key}: {str(e)}', exc_info=True)
        return APIResponse.error(
            message='Failed to get setting',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )
