"""
Lessons API endpoints
Handles lesson-specific operations including completion tracking
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models.content import Lesson, Module
from app.models.progress import UserLessonProgress, UserModuleProgress
from app.models.user import User
from app.models.progress import XPTransaction
from app.utils.auth_decorators import require_auth
from app.errors import NotFoundError
from app.utils.responses import APIResponse
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

lessons_bp = Blueprint('lessons_bp', __name__, url_prefix='/api/v1/lessons')

@lessons_bp.route('/<int:lesson_id>/complete', methods=['POST'])
@jwt_required()
@require_auth
def complete_lesson(lesson_id):
    """Mark a lesson as completed and award XP with transaction and locking"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json() or {}
        
        logger.info(f"Lesson completion request: user_id={user_id}, lesson_id={lesson_id}, data={data}")
        
        # Use transaction with row-level locking to prevent race conditions
        with db.session.begin():
            # Get lesson and module with lock
            from sqlalchemy import select
            from sqlalchemy.orm import with_for_update
            
            lesson = db.session.query(Lesson).filter_by(id=lesson_id).with_for_update().first()
            if not lesson:
                raise NotFoundError('Lesson not found')
            
            module = db.session.query(Module).filter_by(id=lesson.module_id).with_for_update().first()
            if not module:
                raise NotFoundError('Module not found')
            
            logger.info(f"Found lesson: {lesson.title}, module: {module.title}")
            
            # Get or create user lesson progress with lock to prevent concurrent updates
            user_lesson_progress = db.session.query(UserLessonProgress).filter_by(
                user_id=user_id, 
                lesson_id=lesson_id
            ).with_for_update(nowait=True).first()
            
            already_completed = False
            if not user_lesson_progress:
                user_lesson_progress = UserLessonProgress(
                    user_id=user_id,
                    lesson_id=lesson_id
                )
                db.session.add(user_lesson_progress)
            else:
                already_completed = bool(user_lesson_progress.is_completed)
                
                # ANTI-CHEAT: Prevent duplicate XP awards
                if already_completed:
                    return APIResponse.success(
                        data={
                            'lesson_progress': user_lesson_progress.to_dict(),
                            'module_progress': None,
                            'xp_earned': 0,
                            'already_completed': True
                        },
                        message='Lesson already completed'
                    )
        
            # Update lesson progress
            user_lesson_progress.is_completed = True
            user_lesson_progress.status = 'completed'
            user_lesson_progress.progress_percentage = 100.0
            user_lesson_progress.completed_at = datetime.utcnow()
            
            if 'score' in data:
                user_lesson_progress.score = data['score']
            if 'time_spent' in data:
                user_lesson_progress.time_spent = data['time_spent']
            if 'xp_earned' in data:
                user_lesson_progress.xp_earned = data['xp_earned']
            
            # Update module progress with lock
            module_progress = db.session.query(UserModuleProgress).filter_by(
                user_id=user_id,
                module_id=module.id
            ).with_for_update(nowait=True).first()
            
            if not module_progress:
                module_progress = UserModuleProgress(
                    user_id=user_id,
                    module_id=module.id,
                    total_lessons=module.total_lessons,
                    completed_lessons=0,
                    progress_percentage=0.0
                )
                db.session.add(module_progress)
            
            # Calculate actual completed lessons count for this module
            completed_lesson_count = db.session.query(UserLessonProgress).filter_by(
                user_id=user_id,
                is_completed=True
            ).join(Lesson).filter(Lesson.module_id == module.id).count()
            
            module_progress.completed_lessons = completed_lesson_count
            module_progress.total_lessons = module.total_lessons
            module_progress.progress_percentage = (completed_lesson_count / module.total_lessons) * 100 if module.total_lessons > 0 else 0
            module_progress.last_accessed = datetime.utcnow()
            
            if completed_lesson_count >= module.total_lessons:
                module_progress.is_completed = True
                if not module_progress.completed_at:
                    module_progress.completed_at = datetime.utcnow()
            
            # Credit XP once on first completion (within the same transaction for atomicity)
            credited_xp = 0
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
                        extra_metadata={'module_id': module.id, 'lesson_id': lesson_id}
                    )
                    db.session.add(xp_tx)

                    user = db.session.query(User).filter_by(id=user_id).with_for_update().first()
                    if user:
                        user.total_xp = (user.total_xp or 0) + credited_xp
                        user_lesson_progress.xp_earned = credited_xp
            
            # Transaction commits automatically with context manager
        
        return APIResponse.success(
            data={
                'lesson_progress': user_lesson_progress.to_dict(),
                'module_progress': module_progress.to_dict() if module_progress else None,
                'xp_earned': credited_xp if not already_completed else 0,
                'already_completed': False
            },
            message='Lesson completed successfully'
        )
        
    except NotFoundError as e:
        db.session.rollback()
        return APIResponse.error(
            message=e.message,
            status_code=e.status_code,
            error_code="NOT_FOUND"
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error completing lesson: {e}", exc_info=True)
        return APIResponse.error(
            message="Failed to complete lesson",
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@lessons_bp.route('/<int:lesson_id>', methods=['GET'])
@jwt_required(optional=True)
def get_lesson(lesson_id):
    """Get lesson details - publicly accessible"""
    try:
        lesson = Lesson.query.get(lesson_id)
        if not lesson:
            return APIResponse.error(
                message="Lesson not found",
                status_code=404,
                error_code="LESSON_NOT_FOUND"
            )
        return APIResponse.success(
            data=lesson.to_dict(),
            message="Lesson retrieved successfully"
        )
    except Exception as e:
        logger.error(f"Error getting lesson: {e}", exc_info=True)
        return APIResponse.error(
            message="Failed to get lesson",
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@lessons_bp.route('/<int:lesson_id>/progress', methods=['GET'])
@jwt_required()
@require_auth
def get_lesson_progress(lesson_id):
    """Get user's progress for a specific lesson"""
    try:
        user_id = get_jwt_identity()
        progress = UserLessonProgress.query.filter_by(
            user_id=user_id,
            lesson_id=lesson_id
        ).first()
        
        if not progress:
            return APIResponse.success(
                data={
                    'lesson_id': lesson_id,
                    'progress_percentage': 0,
                    'is_completed': False,
                    'status': 'not_started'
                },
                message="Lesson progress retrieved successfully"
            )
        
        return APIResponse.success(
            data=progress.to_dict(),
            message="Lesson progress retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error getting lesson progress: {e}", exc_info=True)
        return APIResponse.error(
            message="Failed to get lesson progress",
            status_code=500,
            error_code="INTERNAL_ERROR"
        )
