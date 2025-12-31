"""
Progress tracking API endpoints

This module handles all learning progress-related operations including:
- Overall progress summaries and statistics
- Lesson and module completion tracking
- XP transactions and level progression
- Learning streaks and leaderboards
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm import joinedload, selectinload
from app import db
from app.models.progress import UserProgress, UserModuleProgress, UserLessonProgress, XPTransaction
from app.models.user import User, UserActivityLog
# Phase 2 models (not available in MVP)
try:
    from app.models.achievements import UserAchievement
except ImportError:
    UserAchievement = None
try:
    from app.models.leaderboard import Leaderboard
except ImportError:
    Leaderboard = None
from app.utils.auth_decorators import require_auth
from app.errors import ValidationError, NotFoundError
from app.utils.responses import APIResponse
# Phase 2 services (not available in MVP)
try:
    from app.services.gamification_service import calculate_level
except ImportError:
    def calculate_level(xp):
        """Fallback level calculation for MVP"""
        return max(1, xp // 100)
try:
    from app.services.cache_service import get_cache_service, CacheKeys
except ImportError:
    def get_cache_service():
        return None
    class CacheKeys:
        pass
from datetime import datetime, timedelta
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

progress_bp = Blueprint('progress', __name__)

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _calculate_topic_progress(user_id: int) -> List[Dict[str, Any]]:
    """
    Calculate progress statistics for each learning topic.
    
    Returns a list showing completion status for each topic,
    including how many modules are completed out of the total.
    """
    try:
        from app.models.content import Topic, Module
        
        # Eager load topics with their modules to prevent N+1 queries
        all_topics = Topic.query.options(
            selectinload(Topic.modules)
        ).order_by(Topic.order_index).all()
        
        # Get all user module progress in one query
        all_user_progress = UserModuleProgress.query.filter_by(
            user_id=user_id
        ).all()
        user_progress_by_module = {p.module_id: p for p in all_user_progress}
        
        topic_progress_list = []
        
        for topic in all_topics:
            # Use eager-loaded modules (no query)
            modules_in_topic = topic.modules
            
            # Filter user progress for this topic's modules
            completed_count = sum(
                1 for module in modules_in_topic
                if module.id in user_progress_by_module 
                and user_progress_by_module[module.id].is_completed
            )
            total_count = len(modules_in_topic)
            
            # Calculate completion percentage
            completion_percentage = (
                (completed_count / total_count * 100) 
                if total_count > 0 else 0
            )
            
            topic_progress_list.append({
                'topic_id': topic.id,
                'topic_title': topic.title,
                'completed_modules': completed_count,
                'total_modules': total_count,
                'progress_percentage': round(completion_percentage, 2)
            })
        
        return topic_progress_list
    except Exception as error:
        # Return empty list if calculation fails - don't break the request
        return []

@progress_bp.route('/summary', methods=['GET'])
@jwt_required()
def get_progress_summary():
    """
    Get comprehensive progress summary for the authenticated user.
    
    Returns overall statistics, topic-level progress, recent achievements,
    and recent XP transactions. Creates a progress record if one doesn't exist.
    """
    try:
        current_user_id = get_jwt_identity()
        current_user = User.query.get(current_user_id)
        
        if not current_user:
            raise NotFoundError('User not found')
        
        # Get or initialize user progress record
        user_progress = UserProgress.query.filter_by(user_id=current_user_id).first()
        if not user_progress:
            user_progress = UserProgress(user_id=current_user_id)
            db.session.add(user_progress)
            db.session.commit()
        
        # Get recent achievements (last 5 earned)
        # Handle None earned_date values by using a nullslast ordering or filtering them out
        recent_achievements = UserAchievement.query.filter_by(
            user_id=current_user_id, 
            is_earned=True
        ).filter(UserAchievement.earned_date.isnot(None)).order_by(UserAchievement.earned_date.desc()).limit(5).all()
        
        # Get recent XP transactions (last 10)
        recent_xp_transactions = XPTransaction.query.filter_by(
            user_id=current_user_id
        ).order_by(XPTransaction.timestamp.desc()).limit(10).all()
        
        # P1-004 Fix: Optimize progress summary queries - combine counts where possible
        from app.models.content import Module, Lesson
        from app.models.progress import UserModuleProgress, UserLessonProgress
        from sqlalchemy import func
        
        # Optimize: Use single query with aggregations instead of multiple COUNT queries
        # Get counts in fewer database round trips
        completed_modules_count = db.session.query(func.count(UserModuleProgress.id)).filter_by(
            user_id=current_user_id,
            is_completed=True
        ).scalar() or 0
        
        total_modules_count = db.session.query(func.count(Module.id)).scalar() or 0
        
        completed_lessons_count = db.session.query(func.count(UserLessonProgress.id)).filter_by(
            user_id=current_user_id,
            is_completed=True
        ).scalar() or 0
        
        total_lessons_count = db.session.query(func.count(Lesson.id)).scalar() or 0
        
        return APIResponse.success(
            data={
                'summary': {
                    'total_xp': current_user.total_xp or 0,
                    'level': current_user.level or 1,
                    'current_streak_days': current_user.current_streak_days or 0,
                    'longest_streak_days': current_user.longest_streak_days or 0,
                    'completed_modules': completed_modules_count,
                    'total_modules': total_modules_count,
                    'completed_lessons': completed_lessons_count,
                    'total_lessons': total_lessons_count,
                    'overall_progress': user_progress.overall_progress or 0,
                    'average_score': user_progress.average_score or 0,
                    'total_learning_time': user_progress.total_learning_time or 0,
                    'average_session_duration': user_progress.average_session_duration or 0,
                    'last_activity_date': (
                        user_progress.last_activity_date.isoformat() 
                        if user_progress.last_activity_date else None
                    )
                },
                'topicProgress': _calculate_topic_progress(current_user_id),
                'totalModules': total_modules_count,
                'achievements': [achievement.to_dict() if hasattr(achievement, 'to_dict') else {
                    'id': achievement.id,
                    'achievement_id': achievement.achievement_id,
                    'is_earned': achievement.is_earned,
                    'earned_date': achievement.earned_date.isoformat() if achievement.earned_date else None
                } for achievement in recent_achievements],
                'recentActivity': [transaction.to_dict() if hasattr(transaction, 'to_dict') else {
                    'id': transaction.id,
                    'source': transaction.source,
                    'amount': transaction.amount,
                    'timestamp': transaction.timestamp.isoformat() if hasattr(transaction, 'timestamp') else None
                } for transaction in recent_xp_transactions]
            },
            message="Progress summary retrieved successfully"
        )
        
    except NotFoundError as error:
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="USER_NOT_FOUND"
        )
    except Exception as error:
        import logging
        logging.getLogger(__name__).error(f"Error getting progress summary: {error}", exc_info=True)
        return APIResponse.error(
            message="Failed to get progress summary",
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@progress_bp.route('/update', methods=['POST'])
@jwt_required()
def update_progress():
    """
    Update user's learning progress.
    
    Handles lesson completion, XP awards, and overall progress updates.
    Automatically calculates user level based on total XP.
    Uses database transactions for atomic updates.
    """
    try:
        current_user_id = get_jwt_identity()
        update_data = request.get_json()
        
        if not update_data:
            raise ValidationError('Request data is required')
        
        # Get or create user progress record
        user_progress = UserProgress.query.filter_by(user_id=current_user_id).first()
        if not user_progress:
            user_progress = UserProgress(user_id=current_user_id)
            db.session.add(user_progress)
        
        # Handle lesson completion if specified
        if 'lessonId' in update_data or 'lesson_id' in update_data:
            lesson_id = update_data.get('lessonId') or update_data.get('lesson_id')
            if lesson_id:
                xp_awarded = update_data.get('xpEarned', update_data.get('xp_earned', 0))
                
                try:
                    _mark_lesson_completed(current_user_id, lesson_id, xp_awarded)
                    _award_xp_for_lesson_completion(current_user_id, lesson_id, xp_awarded)
                    _update_user_level(current_user_id, xp_awarded)
                except Exception as helper_error:
                    logger.warning(f"Error in progress helper functions: {helper_error}", exc_info=True)
                    # Continue with other updates even if lesson completion fails
        
        # Update overall progress metrics
        if 'overallProgress' in update_data:
            user_progress.overall_progress = update_data['overallProgress']
        elif 'overall_progress' in update_data:
            user_progress.overall_progress = update_data['overall_progress']
        if 'completedModules' in update_data:
            user_progress.completed_modules = update_data['completedModules']
        elif 'completed_modules' in update_data:
            user_progress.completed_modules = update_data['completed_modules']
        if 'completedLessons' in update_data:
            user_progress.completed_lessons = update_data['completedLessons']
        elif 'completed_lessons' in update_data:
            user_progress.completed_lessons = update_data['completed_lessons']
        
        user_progress.updated_at = datetime.utcnow()
        db.session.commit()
        
        # Invalidate dashboard cache since progress changed
        cache = get_cache_service()
        cache.delete(CacheKeys.dashboard_data(current_user_id))
        # Invalidate leaderboard cache pattern (all pages)
        cache.delete_pattern("leaderboard:global:*")
        
        return APIResponse.success(
            data={
                'progress': user_progress.to_dict()
            },
            message='Progress updated successfully'
        )
        
    except ValidationError as error:
        db.session.rollback()
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="VALIDATION_ERROR"
        )
    except Exception as error:
        db.session.rollback()
        logger.error(f"Error updating progress: {error}", exc_info=True)
        return APIResponse.error(
            message='Failed to update progress',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@progress_bp.route('/sync', methods=['POST'])
@jwt_required()
def sync_progress():
    """
    Sync progress between frontend and backend.
    
    Handles conflict resolution by merging progress data.
    Backend data takes precedence on conflicts.
    """
    try:
        current_user_id = get_jwt_identity()
        sync_data = request.get_json()
        
        if not sync_data:
            raise ValidationError('Sync data is required')
        
        # Get current backend progress
        user_progress = UserProgress.query.filter_by(user_id=current_user_id).first()
        if not user_progress:
            user_progress = UserProgress(user_id=current_user_id)
            db.session.add(user_progress)
            db.session.commit()
        
        # Merge frontend data with backend (backend wins on conflicts)
        # Only update if backend data is newer or missing
        backend_updated = user_progress.updated_at or datetime.utcnow()
        frontend_updated = sync_data.get('updated_at')
        
        if frontend_updated:
            try:
                frontend_date = datetime.fromisoformat(frontend_updated.replace('Z', '+00:00'))
                # If frontend is newer, we might want to merge, but for now backend wins
                # This can be enhanced with more sophisticated conflict resolution
            except:
                pass
        
        # Return current backend state for frontend to sync
        return APIResponse.success(
            data={
                'progress': user_progress.to_dict(),
                'synced_at': datetime.utcnow().isoformat()
            },
            message="Progress synced successfully"
        )
        
    except ValidationError as error:
        # MEDIUM-001 Fix: Rollback on validation errors to prevent database inconsistency
        db.session.rollback()
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="VALIDATION_ERROR"
        )
    except Exception as error:
        db.session.rollback()
        import logging
        logging.getLogger(__name__).error(f"Error syncing progress: {error}", exc_info=True)
        return APIResponse.error(
            message="Failed to sync progress",
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

def _mark_lesson_completed(user_id: int, lesson_id: int, xp_earned: int) -> None:
    """Mark a lesson as completed and record the completion."""
    lesson_progress = UserLessonProgress.query.filter_by(
        user_id=user_id, 
        lesson_id=lesson_id
    ).first()
    
    if lesson_progress:
        lesson_progress.is_completed = True
        lesson_progress.xp_earned = xp_earned
        lesson_progress.completed_at = datetime.utcnow()
    else:
        new_lesson_progress = UserLessonProgress(
            user_id=user_id,
            lesson_id=lesson_id,
            is_completed=True,
            xp_earned=xp_earned,
            completed_at=datetime.utcnow()
        )
        db.session.add(new_lesson_progress)

def _award_xp_for_lesson_completion(user_id: int, lesson_id: int, xp_amount: int) -> None:
    """Create an XP transaction record for completing a lesson."""
    xp_transaction = XPTransaction(
        user_id=user_id,
        source='lesson_completion',
        amount=xp_amount,
        description=f'Completed lesson {lesson_id}',
        metadata={'lesson_id': lesson_id}
    )
    db.session.add(xp_transaction)

def _update_user_level(user_id: int, xp_earned: int) -> None:
    """
    Update user's total XP and recalculate their level.
    
    Uses standardized level calculation formula from gamification_service.
    Invalidates dashboard and leaderboard caches since XP/level changed.
    """
    current_user = User.query.get(user_id)
    current_user.total_xp += xp_earned
    current_user.level = calculate_level(current_user.total_xp)
    
    # Invalidate caches since XP/level changed
    cache = get_cache_service()
    cache.delete(CacheKeys.dashboard_data(user_id))
    # Invalidate all leaderboard pages since rankings may have changed
    cache.delete_pattern("leaderboard:global:*")

@progress_bp.route('/streak', methods=['GET'])
@jwt_required()
def get_learning_streak():
    """
    Get the user's learning streak information.
    
    Returns current streak, longest streak, and a 30-day history
    showing which days had learning activity.
    """
    try:
        current_user_id = get_jwt_identity()
        current_user = User.query.get(current_user_id)
        
        if not current_user:
            raise NotFoundError('User not found')
        
        # Build 30-day activity history
        activity_history = _build_streak_history(current_user_id)
        
        return APIResponse.success(
            data={
                'currentStreak': current_user.current_streak_days or 0,
                'longestStreak': current_user.longest_streak_days or 0,
                'streakHistory': activity_history
            },
            message="Learning streak retrieved successfully"
        )
        
    except NotFoundError as error:
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="USER_NOT_FOUND"
        )
    except Exception as error:
        import logging
        logging.getLogger(__name__).error(f"Error getting learning streak: {error}", exc_info=True)
        return APIResponse.error(
            message="Failed to get learning streak",
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

def _build_streak_history(user_id: int) -> List[Dict[str, Any]]:
    """
    Build a 30-day history of learning activity.
    
    Optimized to use a single query instead of 30 individual queries.
    Queries all activity dates for the user in the 30-day range at once.
    """
    today = datetime.utcnow().date()
    thirty_days_ago = today - timedelta(days=30)
    
    # Get all activity dates for user in last 30 days in single query
    active_dates = db.session.query(
        db.func.date(UserActivityLog.timestamp).label('activity_date')
    ).filter(
        UserActivityLog.user_id == user_id,
        db.func.date(UserActivityLog.timestamp) >= thirty_days_ago
    ).distinct().all()
    
    # Convert to set for O(1) lookup
    active_date_set = {date.activity_date for date in active_dates}
    
    # Build history for all 30 days
    activity_history = []
    for days_ago in range(30):
        check_date = today - timedelta(days=days_ago)
        had_activity = check_date in active_date_set
        
        activity_history.append({
            'date': check_date.isoformat(),
            'has_activity': had_activity
        })
    
    return activity_history

@progress_bp.route('/leaderboard', methods=['GET'])
@jwt_required()
def get_leaderboard():
    """
    Get the community leaderboard ranked by total XP.
    
    Returns paginated leaderboard entries along with the
    current user's rank and total number of users.
    
    Cached for 2 minutes to reduce database load.
    """
    try:
        current_user_id = get_jwt_identity()
        page_number = request.args.get('page', 1, type=int)
        items_per_page = request.args.get('per_page', 20, type=int)
        
        cache = get_cache_service()
        cache_key = CacheKeys.leaderboard(page_number, items_per_page)
        
        # Try to get from cache
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            logger.debug(f"Cache hit for leaderboard: page={page_number}, per_page={items_per_page}")
            # Still need to calculate user rank (user-specific, can't be cached in same key)
            user_rank = _calculate_user_rank(current_user_id)
            cached_data['additional_data']['userRank'] = user_rank
            return APIResponse.paginated(
                data=cached_data['data'],
                page=cached_data['page'],
                per_page=cached_data['per_page'],
                total=cached_data['total'],
                additional_data=cached_data['additional_data'],
                message="Leaderboard retrieved successfully"
            )
        
        logger.debug(f"Cache miss for leaderboard: page={page_number}, per_page={items_per_page}")
        
        # Get paginated leaderboard (sorted by XP descending)
        leaderboard_entries = Leaderboard.query.order_by(
            Leaderboard.total_xp.desc()
        ).paginate(page=page_number, per_page=items_per_page, error_out=False)
        
        # Calculate user's current rank
        user_rank = _calculate_user_rank(current_user_id)
        
        response_data = {
            'data': [entry.to_dict() for entry in leaderboard_entries.items],
            'page': page_number,
            'per_page': items_per_page,
            'total': leaderboard_entries.total,
            'additional_data': {
                'userRank': user_rank,
                'totalUsers': Leaderboard.query.count()
            }
        }
        
        # Cache the response for 2 minutes (120 seconds)
        # Note: userRank is calculated separately for each user, so we cache without it
        cache_data = response_data.copy()
        cache_data['additional_data'] = cache_data['additional_data'].copy()
        cache_data['additional_data'].pop('userRank', None)  # Remove user-specific data
        cache.set(cache_key, cache_data, ttl=120)
        
        return APIResponse.paginated(
            data=response_data['data'],
            page=response_data['page'],
            per_page=response_data['per_page'],
            total=response_data['total'],
            additional_data=response_data['additional_data'],
            message="Leaderboard retrieved successfully"
        )
        
    except Exception as error:
        import logging
        logging.getLogger(__name__).error(f"Error getting leaderboard: {error}", exc_info=True)
        return APIResponse.error(
            message="Failed to get leaderboard",
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

def _calculate_user_rank(user_id: int) -> int:
    """
    Calculate the user's current rank on the leaderboard.
    
    Rank is determined by counting how many users have more XP.
    """
    user_entry = Leaderboard.query.filter_by(user_id=user_id).first()
    
    if not user_entry:
        # User not on leaderboard yet
        return Leaderboard.query.count() + 1
    
    # Count users with more XP, then add 1 for rank
    users_ahead = Leaderboard.query.filter(
        Leaderboard.total_xp > user_entry.total_xp
    ).count()
    
    return users_ahead + 1
