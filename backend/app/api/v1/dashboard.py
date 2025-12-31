"""
Dashboard API - Aggregated endpoint for efficient data loading
Reduces 7 API calls to 1 for better performance
"""

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models.user import User
from app.models.content import Topic, Module
from app.models.progress import UserProgress
# Phase 2 models (not available in MVP)
try:
    from app.models.notifications import UserNotification
except ImportError:
    UserNotification = None
from app.utils.responses import APIResponse
# Phase 2 services (not available in MVP)
try:
    from app.services.cache_service import get_cache_service, CacheKeys
except ImportError:
    def get_cache_service():
        return None
    class CacheKeys:
        pass
try:
    from app.services.gamification_service import get_daily_goals
except ImportError:
    def get_daily_goals(*args, **kwargs):
        return []
from sqlalchemy.orm import joinedload, selectinload
import logging

logger = logging.getLogger(__name__)

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('', methods=['GET'])
@dashboard_bp.route('/', methods=['GET'])
@jwt_required()
def get_dashboard():
    """Get dashboard data for the user"""
    try:
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        
        if not user:
            return APIResponse.error(
                message="User not found",
                status_code=404,
                error_code="USER_NOT_FOUND"
            )
        
        user_progress = UserProgress.query.filter_by(user_id=user_id).first()
        
        return APIResponse.success(
            data={
                'level': user.level or 1,
                'total_xp': user.total_xp or 0,
                'streak': user.current_streak_days or 0,
                'progress_percentage': user_progress.overall_progress if user_progress else 0,
                'completed_lessons': user_progress.completed_lessons if user_progress else 0,
                'endpoints': {
                    'data': '/dashboard/data',
                    'summary': '/dashboard/summary'
                }
            },
            message="Dashboard data retrieved successfully"
        )
    except Exception as e:
        logger.error(f"Error fetching dashboard: {e}", exc_info=True)
        return APIResponse.error(
            message="Failed to load dashboard",
            status_code=500,
            error_code="DASHBOARD_ERROR"
        )

@dashboard_bp.route('/data', methods=['GET'])
@jwt_required()
def get_dashboard_data():
    """
    Aggregated dashboard data endpoint
    Returns all data needed for dashboard in single request
    
    Replaces 7 separate API calls:
    - GET /modules/public/topics
    - GET /users/me/progress
    - GET /recommendations/modules
    - GET /users/me/activity
    - GET /learning/daily-goals
    - GET /hearts
    - GET /notifications/unread
    
    Cached for 5 minutes to reduce database load.
    
    Returns:
        dict: Complete dashboard data
    """
    try:
        user_id = get_jwt_identity()
        cache = get_cache_service()
        cache_key = CacheKeys.dashboard_data(user_id)
        
        # Try to get from cache
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            logger.debug(f"Cache hit for dashboard data: user_id={user_id}")
            return APIResponse.success(
                data=cached_data,
                message="Dashboard data retrieved successfully"
            )
        
        logger.debug(f"Cache miss for dashboard data: user_id={user_id}")
        
        user = User.query.get(user_id)
        
        if not user:
            return APIResponse.error(
                message='User not found',
                status_code=404,
                error_code="USER_NOT_FOUND"
            )
        
        # 1. Topics with modules (optimized to prevent N+1 queries)
        # HIGH-002 Fix: Topic.modules is lazy='dynamic', so we can't use selectinload
        # Instead, load all modules in a single query and group by topic_id
        topics = Topic.query.order_by(Topic.order_index).all()
        
        # Load all modules for these topics in a single query
        topic_ids = [topic.id for topic in topics]
        from app.models.content import Module
        all_modules = Module.query.filter(Module.topic_id.in_(topic_ids)).order_by(Module.order_index).all()
        
        # Group modules by topic_id for O(1) lookup
        modules_by_topic = {}
        for module in all_modules:
            if module.topic_id not in modules_by_topic:
                modules_by_topic[module.topic_id] = []
            modules_by_topic[module.topic_id].append(module)
        
        # 2. User Progress
        user_progress = UserProgress.query.filter_by(user_id=user_id).first()
        
        # 3. Recommendations (top 5)
        from app.services.recommendation_service import get_recommendations
        recommendations = get_recommendations(user_id, limit=5)
        
        # 4. Recent Activity (last 5)
        from app.models.user import UserActivityLog
        recent_activity = UserActivityLog.query.filter_by(
            user_id=user_id
        ).order_by(
            UserActivityLog.timestamp.desc()
        ).limit(5).all()
        
        # 5. Daily Goals
        from app.services.gamification_service import get_daily_goals
        daily_goals = get_daily_goals(user_id)
        
        # 6. Hearts
        from app.models.hearts import UserHearts
        hearts = UserHearts.query.filter_by(user_id=user_id).first()
        
        # 7. Unread Notifications (count only for performance)
        unread_count = UserNotification.query.filter_by(
            user_id=user_id,
            is_read=False
        ).count()
        
        # Aggregate response
        # Convert topics to dict, handling modules relationship
        topics_data = []
        for topic in topics:
            topic_dict = topic.to_dict()
            # Add modules from pre-loaded dictionary (prevents N+1 queries)
            topic_dict['modules'] = [m.to_dict() for m in modules_by_topic.get(topic.id, [])]
            topics_data.append(topic_dict)
        
        response_data = {
            'topics': topics_data,
            'user_progress': user_progress.to_dict() if user_progress else None,
            'recommendations': recommendations,
            'recent_activity': [a.to_dict() for a in recent_activity],
            'daily_goals': daily_goals,
            'hearts': hearts.to_dict() if hearts else {
                'current_hearts': 5,
                'max_hearts': 5,
                'unlimited': False
            },
            'notifications': {
                'unread_count': unread_count
            },
            'user_summary': {
                'level': user.level,
                'total_xp': user.total_xp,
                'current_streak': user.current_streak_days
            }
        }
        
        # Cache the response for 5 minutes (300 seconds)
        cache.set(cache_key, response_data, ttl=300)
        
        return APIResponse.success(
            data=response_data,
            message="Dashboard data retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error fetching dashboard data: {e}", exc_info=True)
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return APIResponse.error(
            message=f"Failed to load dashboard data: {str(e)}",
            status_code=500,
            error_code="DASHBOARD_DATA_ERROR",
            details={'error': str(e), 'type': type(e).__name__}
        )


@dashboard_bp.route('/summary', methods=['GET'])
@jwt_required()
def get_dashboard_summary():
    """
    Lightweight dashboard summary for quick loading
    Returns only essential stats
    """
    try:
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        
        if not user:
            return APIResponse.error(
                message="User not found",
                status_code=404,
                error_code="USER_NOT_FOUND"
            )
        
        # Quick stats only
        user_progress = UserProgress.query.filter_by(user_id=user_id).first()
        
        return APIResponse.success(
            data={
                'level': user.level,
                'total_xp': user.total_xp,
                'streak': user.current_streak_days,
                'progress_percentage': user_progress.overall_progress if user_progress else 0,
                'completed_lessons': user_progress.completed_lessons if user_progress else 0
            },
            message="Dashboard summary retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error fetching dashboard summary: {e}", exc_info=True)
        return APIResponse.error(
            message="Failed to load summary",
            status_code=500,
            error_code="DASHBOARD_SUMMARY_ERROR"
        )

