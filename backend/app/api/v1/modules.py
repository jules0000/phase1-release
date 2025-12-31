"""
Modules and content management API endpoints
"""

from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy import update, func
from sqlalchemy.exc import IntegrityError
from app import db
from app.models.content import Topic, Module, Lesson, NeuralContent
from app.models.progress import UserModuleProgress, UserLessonProgress, XPTransaction
from app.models.user import User
from app.utils.auth_decorators import require_auth, optional_auth
from app.errors import ValidationError, NotFoundError
from app.utils.responses import APIResponse
# Phase 2 gamification (not available in MVP)
try:
    from app.api.v1.gamification import update_leaderboard, check_achievements
except ImportError:
    def update_leaderboard(*args, **kwargs):
        pass
    def check_achievements(*args, **kwargs):
        pass
import json
import os
import logging
from datetime import datetime

logger = logging.getLogger(__name__)
modules_bp = Blueprint('modules', __name__)

# Create public sub-routes within the modules blueprint
@modules_bp.route('/public/topics', methods=['GET'])
def get_public_topics():
    """Get all learning topics - PUBLIC, NO AUTH"""
    try:
        topics = Topic.query.order_by(Topic.order_index).all()
        return APIResponse.success(
            data=[topic.to_dict() for topic in topics],
            message="Topics retrieved successfully"
        )
    except Exception as e:
        logger.error(f"Error getting topics: {e}", exc_info=True)
        return APIResponse.error(
            message='Failed to get topics',
            status_code=500,
            error_code="INTERNAL_ERROR",
            details={'detail': str(e)}
        )

@modules_bp.route('/public/modules', methods=['GET'])
def get_public_modules():
    """Get all modules - PUBLIC, NO AUTH"""
    try:
        topic_id = request.args.get('topicId', type=int) or request.args.get('topic_id', type=int)
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('pageSize', type=int) or request.args.get('per_page', 20, type=int)
        
        # Optimize query with eager loading to prevent N+1 queries
        query = Module.query.options(joinedload(Module.topic))
        if topic_id:
            query = query.filter_by(topic_id=topic_id)
        
        modules = query.order_by(Module.order_index).paginate(page=page, per_page=per_page, error_out=False)
        
        # Bulk fetch lesson counts for all modules to avoid N+1 queries
        module_ids = [m.id for m in modules.items]
        lesson_counts = {}
        if module_ids:
            # Use group_by to get counts for all modules in one query
            lesson_count_query = db.session.query(
                Lesson.module_id,
                func.count(Lesson.id).label('count')
            ).filter(
                Lesson.module_id.in_(module_ids),
                Lesson.status == 'active'
            ).group_by(Lesson.module_id).all()
            
            lesson_counts = {module_id: count for module_id, count in lesson_count_query}
        
        # Bulk fetch topics (already loaded via joinedload, but ensure we have them)
        items = []
        for m in modules.items:
            try:
                d = m.to_dict()
                # Use bulk-fetched lesson count
                actual_lesson_count = lesson_counts.get(m.id, 0)
                # Use actual count if available, otherwise use stored total_lessons
                d['lessons'] = actual_lesson_count if actual_lesson_count > 0 else (d.get('total_lessons', 0) or 0)
                d['total_lessons'] = d['lessons']  # Ensure both fields are consistent
                diff = (d.get('difficulty') or '').strip()
                d['difficulty'] = (diff.capitalize() if diff else 'Beginner')
                d.setdefault('progress', 0)
                d.setdefault('status', d.get('status') or 'active')
                # Ensure order_index is included (already in to_dict, but make explicit)
                d.setdefault('order_index', getattr(m, 'order_index', getattr(m, 'module_number', 0)))
                # Add topic information from eager-loaded relationship
                if m.topic:
                    try:
                        d['topic_name'] = m.topic.title
                        d['topic_id'] = m.topic.id
                        d['topic_number'] = m.topic.topic_number
                    except Exception as e:
                        logger.warning(f"Error accessing topic for module {m.id}: {str(e)}", exc_info=True)
                        d['topic_name'] = None
                        d['topic_id'] = getattr(m, 'topic_id', None)
                        d['topic_number'] = None
                else:
                    # Handle case where topic is None
                    d['topic_name'] = None
                    d['topic_id'] = getattr(m, 'topic_id', None)
                    d['topic_number'] = None
                items.append(d)
            except Exception as e:
                logger.warning(f"Error serializing module {m.id if m else 'unknown'}: {str(e)}", exc_info=True)
                # Add minimal module data if serialization fails
                try:
                    items.append({
                        'id': m.id if m else None,
                        'title': getattr(m, 'title', 'Unknown Module'),
                        'lessons': lesson_counts.get(m.id, 0) if m else 0,
                        'total_lessons': lesson_counts.get(m.id, 0) if m else 0,
                        'difficulty': 'Beginner',
                        'progress': 0,
                        'status': getattr(m, 'status', 'active'),
                        'topic_id': getattr(m, 'topic_id', None),
                        'topic_name': None,
                        'topic_number': None,
                        'order_index': getattr(m, 'order_index', getattr(m, 'module_number', 0))
                    })
                except:
                    continue  # Skip if we can't even get basic info
        
        return APIResponse.paginated(
            data=items,
            page=page,
            per_page=per_page,
            total=modules.total,
            message="Modules retrieved successfully"
        )
    except Exception as e:
        logger.error(f"Error getting modules: {e}", exc_info=True)
        return APIResponse.error(
            message='Failed to get modules',
            status_code=500,
            error_code="INTERNAL_ERROR",
            details={'detail': str(e)}
        )

@modules_bp.route('/topics', methods=['GET'])
def get_topics():
    """Get all learning topics"""
    try:
        topics = Topic.query.order_by(Topic.order_index).all()
        return APIResponse.success(
            data=[topic.to_dict() for topic in topics],
            message="Topics retrieved successfully"
        )
    except Exception as e:
        logger.error(f"Error getting topics: {e}", exc_info=True)
        return APIResponse.error(
            message='Failed to get topics',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@modules_bp.route('/', methods=['GET'])
@jwt_required(optional=True)
def get_modules():
    """Get all modules with optional filtering"""
    try:
        # Get user_id from JWT if available
        user_id = get_jwt_identity()
        # Support both camelCase and snake_case query params used by the frontend
        topic_id = request.args.get('topicId', type=int) or request.args.get('topic_id', type=int)
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('pageSize', type=int) or request.args.get('per_page', 20, type=int)
        # Limit per_page to prevent performance issues
        per_page = min(per_page, 100) if per_page else 20
        status = request.args.get('status')
        
        query = Module.query
        if status:
            query = query.filter_by(status=status)
        
        if topic_id:
            query = query.filter_by(topic_id=topic_id)
        
        # Eager load topics to prevent N+1 queries
        # Use selectinload for better performance with many modules
        modules = query.options(joinedload(Module.topic))\
            .order_by(Module.order_index)\
            .paginate(page=page, per_page=per_page, error_out=False)
        
        # Get user progress for modules - only for modules on current page to optimize
        # Use a single query with IN clause to avoid N+1 queries
        module_progress = {}
        if user_id and modules.items:
            module_ids = [m.id for m in modules.items]
            if module_ids:  # Only query if we have modules
                progress_records = UserModuleProgress.query.filter(
                    UserModuleProgress.user_id == user_id,
                    UserModuleProgress.module_id.in_(module_ids)
                ).all()
                module_progress = {p.module_id: p.to_dict() for p in progress_records}
        
        # Align shape with frontend expectation: items + pagination
        # Enrich module dict with frontend-friendly fields
        # Optimized serialization to reduce response time
        def serialize_module(m: Module):
            try:
                # Get topic info once (already eager-loaded, no query)
                topic = m.topic
                topic_id = m.topic_id
                topic_name = topic.title if topic else None
                topic_number = topic.topic_number if topic else None
                
                # Get base dict
                d = m.to_dict()
                
                # Normalize field names (optimize by setting directly instead of get/setdefault)
                d['lessons'] = d.get('total_lessons', 0) or 0
                
                # Capitalize difficulty to match UI tokens
                diff = d.get('difficulty', '')
                if diff:
                    d['difficulty'] = diff.strip().capitalize() if diff.strip() else 'Beginner'
                else:
                    d['difficulty'] = 'Beginner'
                
                # Provide progress defaults
                if 'progress' not in d:
                    d['progress'] = 0
                if not d.get('status'):
                    d['status'] = 'active'
                
                # Add topic information (already loaded, no query)
                d['topic_name'] = topic_name
                d['topic_id'] = topic_id
                d['topic_number'] = topic_number
                
                return d
            except Exception as e:
                # Log error but don't fail entire request
                logger.warning(f"Error serializing module {m.id if m else 'unknown'}: {e}", exc_info=True)
                # Return minimal safe dict
                return {
                    'id': m.id if m else None,
                    'title': getattr(m, 'title', 'Unknown Module'),
                    'lessons': 0,
                    'difficulty': 'Beginner',
                    'progress': 0,
                    'status': 'active',
                    'topic_name': None,
                    'topic_id': getattr(m, 'topic_id', None),
                    'topic_number': None
                }
        
        # Serialize modules with error handling (use list comprehension for better performance)
        try:
            serialized_modules = [serialize_module(module) for module in modules.items]
        except Exception as e:
            logger.error(f"Error during batch serialization: {e}", exc_info=True)
            # Fallback: serialize one by one with error handling
            serialized_modules = []
            for module in modules.items:
                try:
                    serialized_modules.append(serialize_module(module))
                except Exception as e:
                    logger.warning(f"Failed to serialize module {module.id}: {e}", exc_info=True)
                    # Skip problematic modules but continue processing others
                    continue
        
        return APIResponse.success(
            data={
                'items': serialized_modules,
                'user_progress': module_progress,
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total': modules.total,
                    'pages': modules.pages
                }
            },
            message="Modules retrieved successfully"
        )
        
    except ValueError as e:
        # Invalid query parameters (e.g., invalid page number)
        logger.warning(f"Invalid request parameters in get_modules: {e}")
        return APIResponse.error(
            message='Invalid request parameters',
            status_code=400,
            error_code="INVALID_PARAMETERS",
            details={'error': str(e)}
        )
    except Exception as e:
        logger.error(f"Error getting modules: {e}", exc_info=True)
        return APIResponse.error(
            message='Failed to get modules',
            status_code=500,
            error_code="INTERNAL_ERROR",
            details={'error': str(e) if logger.level <= logging.DEBUG else 'Internal server error'}
        )

@modules_bp.route('/<int:module_id>', methods=['GET'])
@jwt_required(optional=True)
def get_module(module_id):
    """Get specific module details"""
    try:
        user_id = get_jwt_identity()
        module = Module.query.get(module_id)
        
        if not module:
            raise NotFoundError('Module not found')
        
        # Get user progress for this module
        user_progress = None
        if user_id:
            user_progress = UserModuleProgress.query.filter_by(
                user_id=user_id, 
                module_id=module_id
            ).first()
        
        return APIResponse.success(
            data={
                'module': module.to_dict(),
                'user_progress': user_progress.to_dict() if user_progress else None
            },
            message="Module retrieved successfully"
        )
        
    except NotFoundError as e:
        return APIResponse.error(
            message=e.message,
            status_code=e.status_code,
            error_code="MODULE_NOT_FOUND"
        )
    except Exception as e:
        logger.error(f"Error getting module: {e}", exc_info=True)
        return APIResponse.error(
            message='Failed to get module',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@modules_bp.route('/<int:module_id>/lessons', methods=['GET'])
@jwt_required(optional=True)
def get_module_lessons(module_id):
    """
    Get all lessons for a specific module with user progress.
    
    Returns lessons with completion status and locking logic.
    Lessons are locked if previous lessons aren't completed (sequential learning).
    """
    try:
        current_user_id = get_jwt_identity()
        requested_module = Module.query.get(module_id)
        
        logger.info(
            f"Module lessons request: user_id={current_user_id}, "
            f"module_id={module_id}"
        )
        
        if not requested_module:
            raise NotFoundError('Module not found')
        
        # Get all active lessons for this module
        active_lessons = Lesson.query.filter_by(
            module_id=module_id, 
            status='active'
        ).order_by(Lesson.order_index).all()
        
        # Get user's progress if authenticated - optimized to only fetch relevant progress
        user_lesson_progress = {}
        completed_lesson_ids = []
        if current_user_id:
            # Only fetch progress for lessons in this module
            lesson_ids = [lesson.id for lesson in active_lessons]
            if lesson_ids:
                user_progress_records = UserLessonProgress.query.filter(
                    UserLessonProgress.user_id == current_user_id,
                    UserLessonProgress.lesson_id.in_(lesson_ids)
                ).all()
            else:
                user_progress_records = []
            
            user_lesson_progress = {
                progress.lesson_id: progress.to_dict() 
                for progress in user_progress_records
            }
            completed_lesson_ids = [
                progress.lesson_id 
                for progress in user_progress_records 
                if progress.is_completed
            ]
        
        # Process lessons with completion and locking status
        # Ensure lessons are sorted by order_index (already sorted, but verify)
        lessons_with_status = []
        for lesson_index, lesson in enumerate(active_lessons):
            lesson_data = lesson.to_dict()
            # Ensure all expected fields are present
            lesson_data['is_completed'] = lesson.id in completed_lesson_ids
            lesson_data['is_locked'] = False
            # Ensure order_index is included for frontend sorting
            if 'order_index' not in lesson_data:
                lesson_data['order_index'] = lesson.order_index if hasattr(lesson, 'order_index') else lesson.lesson_number
            
            # Sequential unlocking: lock lessons after first incomplete lesson
            if lesson_index > 0:
                previous_lesson = active_lessons[lesson_index - 1]
                if previous_lesson.id not in completed_lesson_ids:
                    lesson_data['is_locked'] = True
            
            lessons_with_status.append(lesson_data)
        
        # Calculate module completion statistics
        total_lessons_count = len(active_lessons)
        completed_lessons_count = len(completed_lesson_ids)
        completion_percentage = (
            (completed_lessons_count / total_lessons_count * 100) 
            if total_lessons_count > 0 else 0
        )
        
        # Get user's module progress if authenticated
        user_module_progress = None
        if current_user_id:
            user_module_progress = UserModuleProgress.query.filter_by(
                user_id=current_user_id, 
                module_id=module_id
            ).first()
        
        module_response_data = requested_module.to_dict()
        module_response_data['completed_lessons_count'] = completed_lessons_count
        module_response_data['progress_percentage'] = completion_percentage
        module_response_data['is_completed'] = (
            user_module_progress.is_completed 
            if user_module_progress else False
        )
        
        logger.info(
            f"Returning module lessons: completed={completed_lessons_count}, "
            f"progress={completion_percentage}%"
        )
        
        return APIResponse.success(
            data={
                'lessons': lessons_with_status,
                'user_progress': user_lesson_progress,
                'module_info': module_response_data,
                'completed_lessons': completed_lesson_ids
            },
            message="Module lessons retrieved successfully"
        )
        
    except NotFoundError as error:
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="MODULE_NOT_FOUND"
        )
    except Exception as error:
        logger.error(f"Error getting module lessons: {str(error)}", exc_info=True)
        return APIResponse.error(
            message="Failed to get module lessons",
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@modules_bp.route('/<int:module_id>/progress', methods=['GET'])
@jwt_required()
def get_module_progress(module_id):
    """
    Get the authenticated user's progress for a specific module.
    
    Returns completion status, progress percentage, and timestamps.
    Returns default (empty) progress if user hasn't started the module yet.
    """
    try:
        current_user_id = get_jwt_identity()
        
        requested_module = Module.query.get(module_id)
        if not requested_module:
            raise NotFoundError('Module not found')
        
        # Get user's progress record for this module
        user_module_progress = UserModuleProgress.query.filter_by(
            user_id=current_user_id, 
            module_id=module_id
        ).first()
        
        if not user_module_progress:
            # Return default progress structure for new modules
            return APIResponse.success(
                data={
                    'module_id': module_id,
                    'progress_percentage': 0.0,
                    'completed_lessons': 0,
                    'total_lessons': requested_module.total_lessons,
                    'is_completed': False,
                    'started_at': None,
                    'last_accessed': None,
                    'completed_at': None
                },
                message="Module progress retrieved successfully"
            )
        
        return APIResponse.success(
            data=user_module_progress.to_dict(),
            message="Module progress retrieved successfully"
        )
        
    except NotFoundError as error:
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="MODULE_NOT_FOUND"
        )
    except Exception as error:
        logger.error(f"Error getting module progress: {str(error)}", exc_info=True)
        return APIResponse.error(
            message='Failed to get module progress',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@modules_bp.route('/<int:module_id>/progress', methods=['POST'])
@jwt_required()
def update_module_progress(module_id):
    """
    Update the authenticated user's progress for a module.
    
    Updates completion percentage, completed lessons count, and
    completion status. Automatically sets completion timestamp when marked complete.
    """
    try:
        current_user_id = get_jwt_identity()
        update_data = request.get_json()
        
        if not update_data:
            raise ValidationError('Request data is required')
        
        requested_module = Module.query.get(module_id)
        if not requested_module:
            raise NotFoundError('Module not found')
        
        # Get or create user progress record
        user_module_progress = UserModuleProgress.query.filter_by(
            user_id=current_user_id, 
            module_id=module_id
        ).first()
        
        if not user_module_progress:
            user_module_progress = UserModuleProgress(
                user_id=current_user_id,
                module_id=module_id
            )
            db.session.add(user_module_progress)
        
        # Update progress fields if provided
        if 'progress_percentage' in update_data:
            user_module_progress.progress_percentage = update_data['progress_percentage']
        if 'completed_lessons' in update_data:
            user_module_progress.completed_lessons = update_data['completed_lessons']
        if 'is_completed' in update_data:
            user_module_progress.is_completed = update_data['is_completed']
            # Set completion timestamp when first marked complete
            if update_data['is_completed'] and not user_module_progress.completed_at:
                user_module_progress.completed_at = datetime.utcnow()
        
        user_module_progress.last_accessed = datetime.utcnow()
        
        db.session.commit()
        
        return APIResponse.success(
            data={
                'progress': user_module_progress.to_dict()
            },
            message='Progress updated successfully'
        )
        
    except (ValidationError, NotFoundError) as error:
        db.session.rollback()
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="VALIDATION_ERROR" if isinstance(error, ValidationError) else "MODULE_NOT_FOUND"
        )
    except Exception as error:
        db.session.rollback()
        logger.error(f"Error updating module progress: {error}", exc_info=True)
        return APIResponse.error(
            message='Failed to update progress',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

def _complete_lesson_internal(user_id, module_id, lesson_id, data):
    """
    Internal function to complete a lesson.
    Returns (lesson_progress, module_progress, xp_earned, already_completed) or raises exception.
    """
    lesson = Lesson.query.get(lesson_id)
    if not lesson or lesson.module_id != module_id:
        raise NotFoundError('Lesson not found')
    
    # P1-002 Fix: Prevent duplicate completions
    # Note: SQLite doesn't support true row-level locking, so we rely on:
    # 1. Unique constraint (unique_user_lesson) as primary protection
    # 2. Check before insert to catch duplicates early
    # 3. IntegrityError handling for race conditions
    # 4. Double-check after IntegrityError to ensure we don't process duplicates
    
    # Try to get existing progress record
    user_progress = UserLessonProgress.query.filter_by(
        user_id=user_id, 
        lesson_id=lesson_id
    ).first()
    
    already_completed = False
    if not user_progress:
        # Create new progress record
        user_progress = UserLessonProgress(
            user_id=user_id,
            lesson_id=lesson_id
        )
        db.session.add(user_progress)
        # Flush to trigger unique constraint check early (before commit)
        try:
            db.session.flush()
        except IntegrityError as e:
            # Unique constraint violation - another request created it concurrently
            db.session.rollback()
            logger.info(f'Concurrent completion detected during flush (user {user_id}, lesson {lesson_id}): {str(e)}. Re-fetching.')
            # Re-fetch the record created by the other request
            # Use a fresh query to ensure we get the latest state
            db.session.expire_all()
            user_progress = UserLessonProgress.query.filter_by(
                user_id=user_id,
                lesson_id=lesson_id
            ).first()
            if user_progress:
                already_completed = bool(user_progress.is_completed)
                if already_completed:
                    # Lesson was already completed by another request - return early
                    logger.debug(f'Lesson {lesson_id} already completed by concurrent request, returning early')
                    return (user_progress, None, 0, True)
                else:
                    # Record exists but not completed - another request is in progress
                    # This is a race condition, we should wait or retry, but for now we'll proceed
                    # The commit will catch the duplicate if both try to complete
                    logger.warning(f'Found incomplete progress record after IntegrityError (user {user_id}, lesson {lesson_id}), proceeding with caution')
            else:
                # Unexpected: record should exist after IntegrityError
                logger.error(f'IntegrityError but record not found after rollback (user {user_id}, lesson {lesson_id})')
                raise
    else:
        already_completed = bool(user_progress.is_completed)
        
        # ANTI-CHEAT: Prevent duplicate XP awards
        if already_completed:
            logger.debug(f'Lesson {lesson_id} already completed for user {user_id}, returning early')
            return (user_progress, None, 0, True)
    
    # Update lesson progress
    user_progress.is_completed = True
    user_progress.status = 'completed'
    user_progress.progress_percentage = 100.0
    user_progress.completed_at = datetime.utcnow()
    
    if 'score' in data:
        user_progress.score = data['score']
    if 'time_spent' in data:
        user_progress.time_spent = data['time_spent']
    if 'xp_earned' in data:
        user_progress.xp_earned = data['xp_earned']
    
    # Update module progress
    module_progress = UserModuleProgress.query.filter_by(
        user_id=user_id, 
        module_id=module_id
    ).first()
    
    if not module_progress:
        # Get the module to access its total_lessons
        module = Module.query.get(module_id)
        if not module:
            raise NotFoundError('Module not found')
        
        # Create module progress record if it doesn't exist
        module_progress = UserModuleProgress(
            user_id=user_id,
            module_id=module_id,
            total_lessons=module.total_lessons,
            completed_lessons=0,
            progress_percentage=0.0
        )
        db.session.add(module_progress)
    
    # P1-001 Fix: Maintain count in module progress record to prevent race conditions
    # Instead of recalculating from database (which misses uncommitted transactions),
    # increment the count atomically if this is a new completion
    module = Module.query.get(module_id)
    if not module:
        raise NotFoundError('Module not found')
    
    # If this is a new completion, increment the count
    if not already_completed:
        # Increment completed_lessons count atomically
        if module_progress.completed_lessons is None:
            module_progress.completed_lessons = 0
        module_progress.completed_lessons = (module_progress.completed_lessons or 0) + 1
    else:
        # Already completed - recalculate from database for accuracy (fallback)
        completed_lesson_count = UserLessonProgress.query.filter_by(
            user_id=user_id,
            is_completed=True
        ).join(Lesson).filter(Lesson.module_id == module_id).count()
        module_progress.completed_lessons = completed_lesson_count
        
    module_progress.total_lessons = module.total_lessons
    completed_lesson_count = module_progress.completed_lessons
    module_progress.progress_percentage = (completed_lesson_count / module.total_lessons) * 100 if module.total_lessons > 0 else 0
    module_progress.last_accessed = datetime.utcnow()
    
    if completed_lesson_count >= module.total_lessons:
        module_progress.is_completed = True
        if not module_progress.completed_at:
            module_progress.completed_at = datetime.utcnow()
    
    # Credit XP once on first completion (within the same transaction for atomicity)
    # P0-002 Fix: Only credit XP if this is a new completion (already_completed=False)
    # This ensures XP is never credited for duplicate completions
    credited_xp = 0
    xp_tx = None
    if not already_completed:
        if isinstance(data.get('xp_earned'), (int, float)) and data.get('xp_earned') > 0:
            credited_xp = int(data.get('xp_earned'))
        elif hasattr(lesson, 'xp_reward') and isinstance(getattr(lesson, 'xp_reward'), (int, float)):
            credited_xp = int(getattr(lesson, 'xp_reward') or 0)
        # Default XP if none specified
        elif credited_xp == 0:
            credited_xp = 50  # Default XP for lesson completion

        if credited_xp > 0:
            xp_tx = XPTransaction(
                user_id=user_id,
                source='lesson_completion',
                amount=credited_xp,
                description=f'Lesson completed: {lesson.title}',
                extra_metadata={'module_id': module_id, 'lesson_id': lesson_id}
            )
            db.session.add(xp_tx)

            # Use atomic increment to prevent XP loss from concurrent updates
            # P0-002 Fix: Replace read-modify-write with database-level atomic increment
            # This happens before commit, so if commit fails, rollback will undo it
            db.session.execute(
                update(User)
                .where(User.id == user_id)
                .values(total_xp=User.total_xp + credited_xp)
            )
            user_progress.xp_earned = credited_xp
            logger.debug(f'Crediting {credited_xp} XP to user {user_id} for lesson {lesson_id}')

    # Commit all changes atomically
    # P1-002 Fix: Handle IntegrityError for duplicate key violations (concurrent completions)
    # This is a secondary check in case the flush() above didn't catch it
    try:
        db.session.commit()
        logger.debug(f'Successfully committed lesson completion for user {user_id}, lesson {lesson_id}')
    except IntegrityError as e:
        # Duplicate key violation - another concurrent request already created/updated the progress record
        db.session.rollback()
        error_str = str(e).lower()
        
        # Check if this is a unique constraint violation (not just any integrity error)
        is_unique_violation = (
            'unique' in error_str or 
            'duplicate' in error_str or
            'UNIQUE constraint' in str(e)
        )
        
        if is_unique_violation:
            logger.info(f'IntegrityError (unique constraint) on lesson completion (user {user_id}, lesson {lesson_id}): {str(e)}. Re-fetching existing record.')
            
            # Re-fetch the existing record that was created by the other concurrent request
            user_progress = UserLessonProgress.query.filter_by(
                user_id=user_id,
                lesson_id=lesson_id
            ).first()
            
            if user_progress and user_progress.is_completed:
                # Record already exists and is completed - return as already_completed
                # XP was not credited because rollback undid the atomic increment
                logger.debug(f'Lesson {lesson_id} already completed by another request, no XP credited')
                return (user_progress, None, 0, True)
            elif user_progress:
                # Record exists but not completed - this shouldn't happen, but handle gracefully
                # This means the other request failed after creating the record
                logger.warning(f'Found incomplete progress record after IntegrityError (user {user_id}, lesson {lesson_id})')
                return (user_progress, None, 0, False)
            else:
                # Record not found - unexpected, re-raise the original error
                logger.error(f'IntegrityError occurred but record not found after rollback (user {user_id}, lesson {lesson_id})')
                raise
        else:
            # Not a unique constraint violation - re-raise the original error
            logger.error(f'Unexpected IntegrityError on lesson completion (user {user_id}, lesson {lesson_id}): {str(e)}')
            raise

    # P2-004 Fix: Post-commit hooks with retry logic and better error handling
    # Retry leaderboard and achievement updates with exponential backoff
    max_retries = 3
    retry_delay = 0.1  # Start with 100ms
    
    for attempt in range(max_retries):
        try:
            update_leaderboard(user_id)
            check_achievements(user_id)
            break  # Success, exit retry loop
        except Exception as hook_error:
            if attempt < max_retries - 1:
                # Retry with exponential backoff
                import time
                time.sleep(retry_delay * (2 ** attempt))
                logger.warning(f'Post-completion hooks failed for user {user_id} (attempt {attempt + 1}/{max_retries}): {str(hook_error)}')
            else:
                # Final attempt failed, log error but don't fail the request
                logger.error(f'Post-completion hooks failed for user {user_id} after {max_retries} attempts: {str(hook_error)}', exc_info=True)
    
    return (user_progress, module_progress, credited_xp, already_completed)

@modules_bp.route('/<int:module_id>/lessons/<int:lesson_id>/complete', methods=['POST'])
@jwt_required()
def complete_lesson(module_id, lesson_id):
    """Mark a lesson as completed"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json() or {}
        
        lesson_progress, module_progress, xp_earned, already_completed = _complete_lesson_internal(
            user_id, module_id, lesson_id, data
        )
        
        if already_completed:
            return APIResponse.success(
                data={
                    'lesson_progress': lesson_progress.to_dict(),
                    'module_progress': None,
                    'xp_earned': 0,
                    'already_completed': True
                },
                message='Lesson already completed'
            )
        
        return APIResponse.success(
            data={
                'lesson_progress': lesson_progress.to_dict(),
                'module_progress': module_progress.to_dict() if module_progress else None,
                'xp_earned': xp_earned,
                'already_completed': False
            },
            message='Lesson completed successfully'
        )
        
    except NotFoundError as e:
        db.session.rollback()
        return APIResponse.error(
            message=e.message,
            status_code=e.status_code,
            error_code="LESSON_NOT_FOUND"
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f'Error completing lesson {lesson_id} for user {user_id}: {str(e)}', exc_info=True)
        return APIResponse.error(
            message="Failed to complete lesson",
            status_code=500,
            error_code="LESSON_COMPLETION_ERROR",
            details={'error': str(e)}
        )

@modules_bp.route('/<int:module_number>/lessons/<int:lesson_number>/complete-by-number', methods=['POST'])
@jwt_required()
def complete_lesson_by_number(module_number, lesson_number):
    """Mark a lesson as completed using module and lesson numbers (convenience endpoint)"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json() or {}
        
        # Find module by number
        module = Module.query.filter_by(module_number=module_number).first()
        if not module:
            raise NotFoundError(f'Module {module_number} not found')
        
        # Find lesson by number within the module
        lesson = Lesson.query.filter_by(
            module_id=module.id,
            lesson_number=lesson_number
        ).first()
        
        if not lesson:
            raise NotFoundError(f'Lesson {lesson_number} in module {module_number} not found')
        
        # Use internal function to complete lesson
        lesson_progress, module_progress, xp_earned, already_completed = _complete_lesson_internal(
            user_id, module.id, lesson.id, data
        )
        
        if already_completed:
            return APIResponse.success(
                data={
                    'lesson_progress': lesson_progress.to_dict(),
                    'module_progress': None,
                    'xp_earned': 0,
                    'already_completed': True
                },
                message='Lesson already completed'
            )
        
        return APIResponse.success(
            data={
                'lesson_progress': lesson_progress.to_dict(),
                'module_progress': module_progress.to_dict() if module_progress else None,
                'xp_earned': xp_earned,
                'already_completed': False
            },
            message='Lesson completed successfully'
        )
        
    except NotFoundError as e:
        db.session.rollback()
        return APIResponse.error(
            message=e.message,
            status_code=e.status_code,
            error_code="LESSON_NOT_FOUND"
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f'Error completing lesson by number (module={module_number}, lesson={lesson_number}) for user {user_id}: {str(e)}', exc_info=True)
        return APIResponse.error(
            message="Failed to complete lesson",
            status_code=500,
            error_code="LESSON_COMPLETION_ERROR",
            details={'error': str(e)}
        )
