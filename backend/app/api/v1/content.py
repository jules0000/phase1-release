"""
Content management API endpoints

This module handles all content-related operations including:
- Topic and module content retrieval
- Practice exercises and learning materials
- File uploads and media management
- Admin content management dashboard
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models.content import NeuralContent, ContentUpload, Topic, Module, Lesson, MediaFile
from app.models.user import User
from app.models.progress import UserProgress
from app.utils.auth_decorators import require_auth, optional_auth
from app.errors import ValidationError, NotFoundError
from app.utils.auth_decorators import require_admin as admin_required
from app.utils.responses import APIResponse
# Phase 2 services (not available in MVP)
try:
    from app.utils.logging import log_business_event as log_activity
except ImportError:
    def log_activity(*args, **kwargs):
        pass
try:
    from app.services.realtime_service import get_realtime_service
except ImportError:
    def get_realtime_service():
        return None
import json
import os
import uuid
from datetime import datetime
import logging
from sqlalchemy import func, desc, and_, or_
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)
content_bp = Blueprint('content', __name__)

# ============================================================================
# DEBUG AND UTILITY ENDPOINTS
# ============================================================================

@content_bp.route('/debug/database-status', methods=['GET'])
@jwt_required()
@admin_required
def debug_database_status():
    """
    Admin-only debug endpoint to check database content structure.
    
    Returns a summary of topics, modules, and lessons in the database.
    Useful for troubleshooting content loading issues.
    
    WARNING: This is a debug endpoint. Consider removing or further restricting
    in production environments. Only accessible to admin users.
    """
    try:
        all_topics = Topic.query.all()
        all_modules = Module.query.all()
        all_lessons = Lesson.query.all()
        
        database_summary = {
            'summary': {
                'total_topics': len(all_topics),
                'total_modules': len(all_modules),
                'total_lessons': len(all_lessons)
            },
            'topics': []
        }
        
        # Sample first 5 topics with their structure
        for topic in all_topics[:5]:
            modules_in_topic = Module.query.filter_by(topic_id=topic.id).all()
            topic_structure = {
                'id': topic.id,
                'topic_number': topic.topic_number,
                'title': topic.title,
                'modules_count': len(modules_in_topic),
                'modules': []
            }
            
            # Sample first 3 modules per topic
            for module in modules_in_topic[:3]:
                lessons_in_module = Lesson.query.filter_by(module_id=module.id).all()
                topic_structure['modules'].append({
                    'id': module.id,
                    'module_number': module.module_number,
                    'title': module.title,
                    'lessons_count': len(lessons_in_module)
                })
            
            database_summary['topics'].append(topic_structure)
        
        return APIResponse.success(
            data=database_summary,
            message="Database status retrieved successfully"
        )
        
    except Exception as error:
        logger.exception("Error in debug endpoint")
        return APIResponse.error(
            message="Failed to get database status",
            status_code=500,
            error_code="INTERNAL_ERROR",
            details={'error': str(error)}
        )

@content_bp.route('/practice/exercises', methods=['GET'])
@jwt_required()
def get_practice_exercises():
    """
    Get practice exercises derived from active lessons.
    
    Can be filtered by topic (by ID or title). Returns up to 100
    exercises with their metadata including estimated time and skill focus.
    """
    try:
        topic_filter = request.args.get('topic')
        exercises_query = Lesson.query.filter_by(status='active')
        
        # Apply topic filter if provided
        if topic_filter:
            try:
                # Try to interpret as topic ID (integer)
                topic_id = int(topic_filter)
                exercises_query = exercises_query.join(
                    Module, Lesson.module_id == Module.id
                ).filter(Module.topic_id == topic_id)
            except ValueError:
                # Treat as topic title (text search)
                exercises_query = exercises_query.join(
                    Module, Lesson.module_id == Module.id
                ).join(
                    Topic, Module.topic_id == Topic.id
                ).filter(Topic.title.ilike(f"%{topic_filter}%"))

        active_lessons = exercises_query.order_by(Lesson.order_index).limit(100).all()

        def convert_lesson_to_exercise(lesson: Lesson) -> Dict[str, Any]:
            """Convert a lesson model to exercise format for the API."""
            return {
                'id': f"lesson-{lesson.id}",
                'title': lesson.title,
                'type': getattr(lesson, 'lesson_type', 'practice'),
                'module_id': lesson.module_id,
                'estimated_minutes': getattr(lesson, 'estimated_time', 5),
                'skill_focus': (lesson.content_data or {}).get('skill_focus', []),
            }

        exercises_list = [
            convert_lesson_to_exercise(lesson) 
            for lesson in active_lessons
        ]
        
        return APIResponse.success(
            data=exercises_list,
            message="Practice exercises retrieved successfully"
        )
        
    except Exception as error:
        logger.error(f"Error getting practice exercises: {error}")
        return APIResponse.error(
            message="Failed to get practice exercises",
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@content_bp.route('/topic/<int:topic_number>', methods=['GET'])
@jwt_required()
def get_topic_content(topic_number):
    """
    Get complete learning content for a specific topic.
    
    Returns all modules and lessons organized hierarchically.
    The topic can be identified by topic_number or topic ID.
    """
    try:
        # Find the requested topic
        requested_topic = Topic.query.filter_by(topic_number=topic_number).first()
        
        # Fallback: try finding by ID if topic_number lookup failed
        if not requested_topic:
            requested_topic = Topic.query.get(topic_number)
        
        if not requested_topic:
            # Provide helpful error with available topics
            all_available_topics = Topic.query.all()
            available_topics_info = [
                {
                    'id': topic.id, 
                    'number': topic.topic_number, 
                    'title': topic.title
                } 
                for topic in all_available_topics
            ]
            logger.warning(f"Topic not found for topic_number={topic_number}")
            return APIResponse.error(
                message='Topic not found',
                status_code=404,
                error_code="TOPIC_NOT_FOUND",
                data={
                    'topic_number': topic_number,
                    'available_topics': available_topics_info
                }
            )
        
        logger.info(
            f"Found topic: {requested_topic.title} "
            f"(ID: {requested_topic.id}, Number: {requested_topic.topic_number})"
        )
        
        # Get all modules belonging to this topic
        modules_in_topic = Module.query.filter_by(topic_id=requested_topic.id)\
            .order_by(Module.module_number).all()
        
        logger.info(f"Found {len(modules_in_topic)} modules for topic {requested_topic.title}")
        
        # Build hierarchical content structure
        modules_with_lessons = []
        for module in modules_in_topic:
            # Get all lessons for this module
            lessons_in_module = Lesson.query.filter_by(module_id=module.id)\
                .order_by(Lesson.lesson_number).all()
            
            logger.info(
                f"Module {module.module_number} ({module.title}) "
                f"has {len(lessons_in_module)} lessons"
            )
            
            module_structure = {
                'id': module.id,
                'module_id': module.id,
                'moduleNumber': module.module_number,
                'module_number': module.module_number,
                'title': module.title,
                'description': module.description,
                'difficulty': module.difficulty or 'beginner',
                'estimated_time': module.estimated_time,
                'total_lessons': len(lessons_in_module),
                'lessons': []
            }
            
            # Add lesson details
            for lesson in lessons_in_module:
                lesson_structure = {
                    'id': lesson.id,
                    'lesson_id': lesson.id,
                    'lessonNumber': lesson.lesson_number,
                    'lesson_number': lesson.lesson_number,
                    'type': lesson.lesson_type,
                    'lesson_type': lesson.lesson_type,
                    'title': lesson.title,
                    'description': lesson.description,
                    'content': lesson.content_data or {},
                    'xp_reward': lesson.xp_reward or 50,
                    'estimated_time': lesson.estimated_time or 5
                }
                module_structure['lessons'].append(lesson_structure)
            
            modules_with_lessons.append(module_structure)
        
        # Calculate totals
        total_lessons_count = sum(
            len(module['lessons']) 
            for module in modules_with_lessons
        )
        
        topic_content_response = {
            'modules': modules_with_lessons,
            'topicInfo': {
                'topicNumber': requested_topic.topic_number,
                'topicTitle': requested_topic.title,
                'topicDescription': requested_topic.description,
                'totalModules': len(modules_with_lessons),
                'totalLessons': total_lessons_count
            }
        }
        
        logger.info(
            f"Returning {len(modules_with_lessons)} modules "
            f"with total {total_lessons_count} lessons"
        )
        
        return APIResponse.success(
            data=topic_content_response,
            message="Topic content retrieved successfully"
        )
        
    except Exception as error:
        logger.exception(f"Error getting topic content for topic_number={topic_number}")
        return APIResponse.error(
            message='Failed to get topic content',
            status_code=500,
            error_code="INTERNAL_ERROR",
            details={'error': str(error)}
        )

@content_bp.route('/upload', methods=['POST'])
@require_auth
def upload_content():
    """
    Upload a media file for use in learning content.
    
    Validates file type, generates a unique filename, saves the file,
    and creates a database record. Supports images, PDFs, and documents.
    """
    try:
        from flask import g
        current_user = g.current_user
        current_user_id = current_user.id
        
        # Validate file is present in request
        if 'file' not in request.files:
            raise ValidationError('No file provided')
        
        uploaded_file = request.files['file']
        if uploaded_file.filename == '':
            raise ValidationError('No file selected')
        
        # Validate file type
        allowed_file_extensions = {
            'png', 'jpg', 'jpeg', 'gif', 'pdf', 'doc', 'docx', 'txt'
        }
        file_extension = (
            uploaded_file.filename.rsplit('.', 1)[1].lower() 
            if '.' in uploaded_file.filename else ''
        )
        
        if file_extension not in allowed_file_extensions:
            raise ValidationError('File type not allowed')
        
        # Generate unique filename to prevent conflicts
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        unique_filename = f"{current_user_id}_{timestamp}_{uploaded_file.filename}"
        
        # Ensure upload directory exists
        upload_directory = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), 
            '..', '..', 'uploads'
        )
        os.makedirs(upload_directory, exist_ok=True)
        
        # Save file to disk
        file_save_path = os.path.join(upload_directory, unique_filename)
        uploaded_file.save(file_save_path)
        
        # Create database record for the upload
        new_upload_record = ContentUpload(
            user_id=current_user_id,
            filename=unique_filename,
            original_filename=uploaded_file.filename,
            file_path=file_save_path,
            file_size=os.path.getsize(file_save_path),
            file_type=uploaded_file.content_type,
            file_extension=file_extension,
            title=request.form.get('title', uploaded_file.filename),
            description=request.form.get('description', ''),
            tags=json.loads(request.form.get('tags', '[]'))
        )
        db.session.add(new_upload_record)
        db.session.commit()
        
        return APIResponse.success(
            data={'upload': new_upload_record.to_dict()},
            message='File uploaded successfully',
            status_code=201
        )
        
    except ValidationError as error:
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="VALIDATION_ERROR"
        )
    except Exception as error:
        logger.error(f"Error uploading file: {error}")
        return APIResponse.error(
            message='Failed to upload file',
            status_code=500,
            error_code="UPLOAD_ERROR",
            details={'error': str(error)}
        )

@content_bp.route('/upload/<int:upload_id>', methods=['DELETE'])
@require_auth
def delete_upload(upload_id):
    """
    Delete an uploaded file.
    
    Users can only delete their own uploads unless they are admins.
    Removes both the file from disk and the database record.
    """
    try:
        from flask import g
        current_user = g.current_user
        current_user_id = current_user.id
        
        upload_to_delete = ContentUpload.query.get(upload_id)
        if not upload_to_delete:
            raise NotFoundError('Upload not found')
        
        # Verify user has permission (owner or admin)
        if upload_to_delete.user_id != current_user_id and not current_user.is_admin:
            raise ValidationError('Access denied')
        
        # Remove file from filesystem if it exists
        if os.path.exists(upload_to_delete.file_path):
            os.remove(upload_to_delete.file_path)
        
        # Remove database record
        db.session.delete(upload_to_delete)
        db.session.commit()
        
        return APIResponse.success(
            message='File deleted successfully'
        )
        
    except (ValidationError, NotFoundError) as error:
        return APIResponse.error(
            message=error.message,
            status_code=error.status_code,
            error_code="VALIDATION_ERROR" if isinstance(error, ValidationError) else "NOT_FOUND"
        )
    except Exception as error:
        db.session.rollback()
        logger.error(f"Error deleting file: {error}")
        return APIResponse.error(
            message='Failed to delete file',
            status_code=500,
            error_code="DELETE_ERROR",
            details={'error': str(error)}
        )

@content_bp.route('/admin/uploads', methods=['GET'])
@jwt_required()
@admin_required
def get_content_uploads():
    """Get all content uploads (JSON files) for admin management"""
    try:
        # Get JSON file uploads from MediaFile - check filename extension
        # Use func.lower for case-insensitive matching (works with SQLite and PostgreSQL)
        # Also check mime_type for JSON files
        json_uploads = MediaFile.query.filter(
            or_(
                func.lower(MediaFile.original_filename).like('%.json'),
                func.lower(MediaFile.filename).like('%.json'),
                MediaFile.mime_type == 'application/json',
                MediaFile.mime_type.like('application/json%')
            )
        ).order_by(MediaFile.uploaded_at.desc()).all()
        
        logger.info(f"Found {len(json_uploads)} JSON uploads in database")
        
        # Debug: log all MediaFile records if no JSON files found
        if len(json_uploads) == 0:
            total_files = MediaFile.query.count()
            logger.warning(f"No JSON uploads found. Total MediaFile records: {total_files}")
            if total_files > 0:
                all_files = MediaFile.query.order_by(MediaFile.uploaded_at.desc()).limit(10).all()
                for f in all_files:
                    logger.debug(f"MediaFile: id={f.id}, original={f.original_filename}, filename={f.filename}, type={f.file_type}, mime={f.mime_type}")
        
        uploads_list = []
        for upload in json_uploads:
            # Get uploader info
            uploader = User.query.get(upload.uploaded_by)
            uploader_username = uploader.username if uploader else 'Unknown'
            
            # Extract topic info from metadata or filename
            topic_number = None
            topic_name = None
            if upload.extra_metadata and isinstance(upload.extra_metadata, dict):
                import_info = upload.extra_metadata.get('import', {})
                if import_info and import_info.get('topic_id'):
                    topic_id = import_info.get('topic_id')
                    topic = Topic.query.get(topic_id)
                    if topic:
                        topic_name = topic.title
                        topic_number = topic.topic_number
            
            # Determine status based on metadata
            upload_status = 'completed'
            if upload.extra_metadata and isinstance(upload.extra_metadata, dict):
                if upload.extra_metadata.get('import'):
                    upload_status = 'completed'
                else:
                    upload_status = 'pending'
            
            uploads_list.append({
                'id': upload.id,
                'filename': upload.filename,
                'original_filename': upload.original_filename,
                'topic_name': topic_name or 'Unknown Topic',
                'topic_description': '',
                'topic_number': topic_number or 0,
                'upload_status': upload_status,
                'error_message': None,
                'uploaded_by_username': uploader_username,
                'created_at': upload.uploaded_at.isoformat() if upload.uploaded_at else datetime.utcnow().isoformat(),
                'updated_at': upload.updated_at.isoformat() if upload.updated_at else datetime.utcnow().isoformat(),
                'file_size': upload.file_size,
                'file_type': upload.file_type,
                'mime_type': upload.mime_type
            })
        
        return APIResponse.success(
            data=uploads_list,
            message='Content uploads retrieved successfully'
        )
        
    except Exception as e:
        logger.error(f"Error getting content uploads: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return APIResponse.error(
            message=f'Failed to get content uploads: {str(e)}',
            status_code=500,
            error_code="INTERNAL_ERROR",
            details={'error': str(e), 'traceback': traceback.format_exc()}
        )

@content_bp.route('/admin/dashboard', methods=['GET'])
@jwt_required()
@admin_required
def get_content_admin_dashboard():
    """Get content management dashboard for admins"""
    try:
        # Get content statistics
        total_topics = Topic.query.count()
        total_modules = Module.query.count()
        total_lessons = Lesson.query.count()
        total_uploads = ContentUpload.query.count()
        
        # Get recent content activity
        recent_uploads = ContentUpload.query.order_by(
            ContentUpload.uploaded_at.desc()
        ).limit(10).all()
        
        # Get content performance
        content_performance = db.session.query(
            Lesson.title,
            func.count(UserProgress.id).label('completions'),
            func.avg(UserProgress.xp_earned).label('avg_xp')
        ).join(
            UserProgress, UserProgress.entity_id == Lesson.id
        ).filter(
            UserProgress.progress_type == 'lesson_completion'
        ).group_by(
            Lesson.id, Lesson.title
        ).order_by(
            func.count(UserProgress.id).desc()
        ).limit(10).all()
        
        # Get content by status
        content_by_status = db.session.query(
            Lesson.status,
            func.count(Lesson.id).label('count')
        ).group_by(
            Lesson.status
        ).all()
        
        return APIResponse.success(
            data={
                'statistics': {
                    'total_topics': total_topics,
                    'total_modules': total_modules,
                    'total_lessons': total_lessons,
                    'total_uploads': total_uploads
                },
                'recent_uploads': [upload.to_dict() for upload in recent_uploads],
                'content_performance': [
                    {
                        'title': perf.title,
                        'completions': perf.completions,
                        'average_xp': float(perf.avg_xp or 0)
                    }
                    for perf in content_performance
                ],
                'content_by_status': [
                    {
                        'status': status.status,
                        'count': status.count
                    }
                    for status in content_by_status
                ]
            },
            message="Content admin dashboard retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error getting content admin dashboard: {e}")
        return APIResponse.error(
            message='Failed to get content admin dashboard',
            status_code=500,
            error_code="INTERNAL_ERROR",
            details={'error': str(e)}
        )

@content_bp.route('/admin/topics', methods=['GET'])
@jwt_required()
@admin_required
def get_all_topics():
    """Get all topics for content management"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        
        topics = Topic.query.order_by(Topic.order_index).paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        return APIResponse.paginated(
            data=[topic.to_dict() for topic in topics.items],
            page=page,
            per_page=per_page,
            total=topics.total,
            message="Topics retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error getting all topics: {e}")
        return APIResponse.error(
            message='Failed to get topics',
            status_code=500,
            error_code="INTERNAL_ERROR",
            details={'error': str(e)}
        )

@content_bp.route('/admin/topics/<int:topic_id>', methods=['PUT'])
@jwt_required()
@admin_required
def update_topic(topic_id):
    """Update a topic"""
    try:
        data = request.get_json() or {}
        topic = Topic.query.get(topic_id)
        if not topic:
            return APIResponse.error(
                message='Topic not found',
                status_code=404,
                error_code="TOPIC_NOT_FOUND"
            )
        for field in ['title', 'description', 'icon', 'color', 'order_index']:
            if field in data:
                setattr(topic, field, data[field])
        db.session.commit()
        return APIResponse.success(
            data={'topic': topic.to_dict()},
            message='Topic updated successfully'
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating topic: {e}")
        return APIResponse.error(
            message='Failed to update topic',
            status_code=500,
            error_code="UPDATE_ERROR",
            details={'error': str(e)}
        )

@content_bp.route('/admin/topics', methods=['POST'])
@jwt_required()
@admin_required
def create_topic():
    """Create a new topic"""
    try:
        data = request.get_json()
        
        if not data or not data.get('title'):
            return APIResponse.error(
                message='Title is required',
                status_code=400,
                error_code="VALIDATION_ERROR"
            )
        
        # Get next topic number
        max_topic_number = db.session.query(func.max(Topic.topic_number)).scalar() or 0
        topic_number = max_topic_number + 1
        
        topic = Topic(
            topic_number=topic_number,
            title=data['title'],
            description=data.get('description'),
            icon=data.get('icon'),
            color=data.get('color'),
            order_index=data.get('order_index', 0)
        )
        
        db.session.add(topic)
        db.session.commit()
        
        # Log activity
        try:
            from flask import g
            current_user_id = g.current_user.id if hasattr(g, 'current_user') and g.current_user else get_jwt_identity()
            log_activity(
                user_id=current_user_id,
                action='topic_created',
                details=f'Created topic: {topic.title}'
            )
        except Exception as log_error:
            logger.warning(f"Failed to log activity: {log_error}")
        
        return APIResponse.success(
            data={'topic': topic.to_dict()},
            message='Topic created successfully',
            status_code=201
        )
        
    except Exception as e:
        logger.error(f"Error creating topic: {e}")
        db.session.rollback()
        return APIResponse.error(
            message='Failed to create topic',
            status_code=500,
            error_code="CREATE_ERROR",
            details={'error': str(e)}
        )

@content_bp.route('/admin/modules', methods=['GET'])
@admin_required
def get_all_modules():
    """Get all modules for content management"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        topic_id = request.args.get('topic_id', type=int)
        
        query = Module.query
        if topic_id:
            query = query.filter_by(topic_id=topic_id)
        
        modules = query.order_by(Module.order_index).paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        return APIResponse.paginated(
            data=[module.to_dict() for module in modules.items],
            page=page,
            per_page=per_page,
            total=modules.total,
            message="Modules retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error getting all modules: {e}")
        return APIResponse.error(
            message='Failed to get modules',
            status_code=500,
            error_code="INTERNAL_ERROR",
            details={'error': str(e)}
        )

@content_bp.route('/admin/modules/<int:module_id>', methods=['PUT'])
@admin_required
def update_module(module_id):
    """Update a module"""
    try:
        data = request.get_json() or {}
        module = Module.query.get(module_id)
        if not module:
            return APIResponse.error(
                message='Module not found',
                status_code=404,
                error_code="MODULE_NOT_FOUND"
            )
        fields = ['title', 'description', 'module_number', 'difficulty', 'estimated_time', 'total_lessons', 'order_index', 'status', 'topic_id', 'learning_objectives', 'prerequisites', 'certificate_name']
        for field in fields:
            if field in data:
                setattr(module, field, data[field])
        db.session.commit()
        return APIResponse.success(
            data={'module': module.to_dict()},
            message='Module updated successfully'
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating module: {e}")
        return APIResponse.error(
            message='Failed to update module',
            status_code=500,
            error_code="UPDATE_ERROR",
            details={'error': str(e)}
        )

@content_bp.route('/admin/lessons', methods=['GET'])
@admin_required
def get_all_lessons():
    """Get all lessons for content management"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        module_id = request.args.get('module_id', type=int)
        
        query = Lesson.query
        if module_id:
            query = query.filter_by(module_id=module_id)
        
        lessons = query.order_by(Lesson.order_index).paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        return APIResponse.paginated(
            data=[lesson.to_dict() for lesson in lessons.items],
            page=page,
            per_page=per_page,
            total=lessons.total,
            message="Lessons retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error getting all lessons: {e}")
        return APIResponse.error(
            message='Failed to get lessons',
            status_code=500,
            error_code="INTERNAL_ERROR",
            details={'error': str(e)}
        )

@content_bp.route('/admin/lessons/<int:lesson_id>', methods=['PUT'])
@admin_required
def update_lesson(lesson_id):
    """Update a lesson, including content_data for quizzes, prompt grader, drag and drop"""
    try:
        data = request.get_json() or {}
        lesson = Lesson.query.get(lesson_id)
        if not lesson:
            return APIResponse.error(
                message='Lesson not found',
                status_code=404,
                error_code="LESSON_NOT_FOUND"
            )
        fields = ['title', 'description', 'lesson_number', 'lesson_type', 'content_data', 'estimated_time', 'xp_reward', 'order_index', 'status', 'module_id']
        for field in fields:
            if field in data:
                setattr(lesson, field, data[field])
        db.session.commit()
        return APIResponse.success(
            data={'lesson': lesson.to_dict()},
            message='Lesson updated successfully'
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating lesson: {e}")
        return APIResponse.error(
            message='Failed to update lesson',
            status_code=500,
            error_code="UPDATE_ERROR",
            details={'error': str(e)}
        )

@content_bp.route('/admin/analytics', methods=['GET'])
@admin_required
def get_content_analytics():
    """Get content analytics for admin dashboard"""
    try:
        # Content completion rates
        total_lessons = Lesson.query.count()
        completed_lessons = UserProgress.query.filter(
            UserProgress.progress_type == 'lesson_completion'
        ).count()
        
        completion_rate = (completed_lessons / total_lessons * 100) if total_lessons > 0 else 0
        
        # Popular content
        popular_content = db.session.query(
            Lesson.title,
            func.count(UserProgress.id).label('completions')
        ).join(
            UserProgress, UserProgress.entity_id == Lesson.id
        ).filter(
            UserProgress.progress_type == 'lesson_completion'
        ).group_by(
            Lesson.id, Lesson.title
        ).order_by(
            func.count(UserProgress.id).desc()
        ).limit(10).all()
        
        # Content by type
        content_by_type = db.session.query(
            Lesson.lesson_type,
            func.count(Lesson.id).label('count')
        ).group_by(
            Lesson.lesson_type
        ).all()
        
        # Content by difficulty
        content_by_difficulty = db.session.query(
            Module.difficulty,
            func.count(Module.id).label('count')
        ).group_by(
            Module.difficulty
        ).all()
        
        return APIResponse.success(
            data={
                'completion_rate': round(completion_rate, 2),
                'total_lessons': total_lessons,
                'completed_lessons': completed_lessons,
                'popular_content': [
                    {
                        'title': content.title,
                        'completions': content.completions
                    }
                    for content in popular_content
                ],
                'content_by_type': [
                    {
                        'type': content.lesson_type,
                        'count': content.count
                    }
                    for content in content_by_type
                ],
                'content_by_difficulty': [
                    {
                        'difficulty': content.difficulty,
                        'count': content.count
                    }
                    for content in content_by_difficulty
                ]
            },
            message="Content analytics retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error getting content analytics: {e}")
        return APIResponse.error(
            message='Failed to get content analytics',
            status_code=500,
            error_code="INTERNAL_ERROR",
            details={'error': str(e)}
        )

# Admin Content Management Endpoints

@content_bp.route('/admin/topics', methods=['GET'])
@jwt_required()
@admin_required
def get_admin_topics():
    """Get all topics for admin management"""
    try:
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 20))
        
        topics_query = Topic.query.order_by(Topic.order_index.asc())
        
        # Pagination
        topics = topics_query.paginate(
            page=page, 
            per_page=per_page, 
            error_out=False
        )
        
        return APIResponse.paginated(
            data=[topic.to_dict() for topic in topics.items],
            page=page,
            per_page=per_page,
            total=topics.total,
            message="Topics retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error getting admin topics: {e}")
        return APIResponse.error(
            message='Failed to get topics',
            status_code=500,
            error_code="INTERNAL_ERROR",
            details={'error': str(e)}
        )

@content_bp.route('/admin/modules', methods=['GET'])
@jwt_required()
@admin_required
def get_admin_modules():
    """Get modules for admin management"""
    try:
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 20))
        topic_id = request.args.get('topic_id', type=int)
        
        modules_query = Module.query
        if topic_id:
            modules_query = modules_query.filter_by(topic_id=topic_id)
        
        modules_query = modules_query.order_by(Module.module_number.asc())
        
        # Pagination
        modules = modules_query.paginate(
            page=page, 
            per_page=per_page, 
            error_out=False
        )
        
        # Serialize modules with error handling
        modules_data = []
        for module in modules.items:
            try:
                modules_data.append(module.to_dict())
            except Exception as e:
                logger.warning(f"Error serializing module {module.id if module else 'unknown'}: {str(e)}", exc_info=True)
                # Add minimal module data if serialization fails
                try:
                    modules_data.append({
                        'id': module.id if module else None,
                        'title': getattr(module, 'title', 'Unknown Module'),
                        'topic_id': getattr(module, 'topic_id', None),
                        'status': getattr(module, 'status', 'active'),
                        'module_number': getattr(module, 'module_number', 0)
                    })
                except:
                    continue  # Skip if we can't even get basic info
        
        return APIResponse.paginated(
            data=modules_data,
            page=page,
            per_page=per_page,
            total=modules.total,
            message="Modules retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error getting admin modules: {e}", exc_info=True)
        return APIResponse.error(
            message='Failed to get modules',
            status_code=500,
            error_code="INTERNAL_ERROR",
            details={'error': str(e) if logger.level <= logging.DEBUG else 'Internal server error'}
        )

@content_bp.route('/admin/lessons', methods=['GET'])
@jwt_required()
@admin_required
def get_admin_lessons():
    """Get lessons for admin management"""
    try:
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 20))
        module_id = request.args.get('module_id', type=int)
        
        lessons_query = Lesson.query
        if module_id:
            lessons_query = lessons_query.filter_by(module_id=module_id)
        
        lessons_query = lessons_query.order_by(Lesson.lesson_number.asc())
        
        # Pagination
        lessons = lessons_query.paginate(
            page=page, 
            per_page=per_page, 
            error_out=False
        )
        
        return APIResponse.paginated(
            data=[lesson.to_dict() for lesson in lessons.items],
            page=page,
            per_page=per_page,
            total=lessons.total,
            message="Lessons retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error getting admin lessons: {e}")
        return APIResponse.error(
            message='Failed to get lessons',
            status_code=500,
            error_code="INTERNAL_ERROR",
            details={'error': str(e)}
        )

@content_bp.route('/admin/modules', methods=['POST'])
@jwt_required()
@admin_required
def create_module():
    """Create a new module"""
    try:
        data = request.get_json()
        
        required_fields = ['title', 'topic_id']
        for field in required_fields:
            if not data.get(field):
                raise ValidationError(f'Missing required field: {field}')
        
        # Verify topic exists
        topic = Topic.query.get(data['topic_id'])
        if not topic:
            raise ValidationError('Topic not found')
        
        # Get the next module number for this topic
        max_module = db.session.query(func.max(Module.module_number))\
            .filter_by(topic_id=data['topic_id']).scalar() or 0
        
        # Get the next order index
        max_order = db.session.query(func.max(Module.order_index))\
            .filter_by(topic_id=data['topic_id']).scalar() or 0
        
        module = Module(
            title=data['title'],
            description=data.get('description', ''),
            topic_id=data['topic_id'],
            module_number=max_module + 1,
            difficulty=data.get('difficulty', 'beginner'),
            estimated_time=data.get('estimated_time', 30),
            order_index=max_order + 1,
            status=data.get('status', 'draft')
        )
        
        db.session.add(module)
        db.session.commit()
        
        # Log activity
        log_activity('module_created', {
            'module_id': module.id,
            'topic_id': module.topic_id,
            'title': module.title
        })
        
        return APIResponse.success(
            data={'module': module.to_dict()},
            message='Module created successfully',
            status_code=201
        )
        
    except ValidationError as e:
        return APIResponse.error(
            message=e.message,
            status_code=400,
            error_code="VALIDATION_ERROR"
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating module: {e}")
        return APIResponse.error(
            message='Failed to create module',
            status_code=500,
            error_code="CREATE_ERROR",
            details={'error': str(e)}
        )

@content_bp.route('/admin/lessons', methods=['POST'])
@jwt_required()
@admin_required
def create_lesson():
    """Create a new lesson"""
    try:
        data = request.get_json()
        
        required_fields = ['title', 'module_id']
        for field in required_fields:
            if not data.get(field):
                raise ValidationError(f'Missing required field: {field}')
        
        # Verify module exists
        module = Module.query.get(data['module_id'])
        if not module:
            raise ValidationError('Module not found')
        
        # Get the next lesson number for this module
        max_lesson = db.session.query(func.max(Lesson.lesson_number))\
            .filter_by(module_id=data['module_id']).scalar() or 0
        
        # Get the next order index
        max_order = db.session.query(func.max(Lesson.order_index))\
            .filter_by(module_id=data['module_id']).scalar() or 0
        
        lesson = Lesson(
            title=data['title'],
            description=data.get('description', ''),
            module_id=data['module_id'],
            lesson_number=max_lesson + 1,
            lesson_type=data.get('lesson_type', 'learn'),
            content_data=data.get('content_data', {}),
            estimated_time=data.get('estimated_time', 15),
            xp_reward=data.get('xp_reward', 10),
            order_index=max_order + 1,
            status=data.get('status', 'draft')
        )
        
        db.session.add(lesson)
        db.session.commit()
        
        # Log activity
        log_activity('lesson_created', {
            'lesson_id': lesson.id,
            'module_id': lesson.module_id,
            'title': lesson.title
        })
        
        return APIResponse.success(
            data={'lesson': lesson.to_dict()},
            message='Lesson created successfully',
            status_code=201
        )
        
    except ValidationError as e:
        return APIResponse.error(
            message=e.message,
            status_code=400,
            error_code="VALIDATION_ERROR"
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating lesson: {e}")
        return APIResponse.error(
            message='Failed to create lesson',
            status_code=500,
            error_code="CREATE_ERROR",
            details={'error': str(e)}
        )

@content_bp.route('/admin/topics/<int:topic_id>', methods=['DELETE'])
@jwt_required()
@admin_required
def delete_topic(topic_id):
    """Delete a topic and all its modules/lessons"""
    try:
        topic = Topic.query.get(topic_id)
        if not topic:
            raise NotFoundError('Topic not found')
        
        # Get all modules in this topic
        modules = Module.query.filter_by(topic_id=topic_id).all()
        module_ids = [m.id for m in modules]
        
        # Delete all lessons in these modules
        Lesson.query.filter(Lesson.module_id.in_(module_ids)).delete()
        
        # Delete all modules
        Module.query.filter_by(topic_id=topic_id).delete()
        
        # Delete the topic
        db.session.delete(topic)
        db.session.commit()
        
        # Log activity
        log_activity('topic_deleted', {
            'topic_id': topic_id,
            'title': topic.title
        })
        
        return APIResponse.success(
            message='Topic deleted successfully'
        )
        
    except NotFoundError as e:
        return APIResponse.error(
            message=e.message,
            status_code=404,
            error_code="TOPIC_NOT_FOUND"
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting topic: {e}")
        return APIResponse.error(
            message='Failed to delete topic',
            status_code=500,
            error_code="DELETE_ERROR",
            details={'error': str(e)}
        )

@content_bp.route('/admin/modules/<int:module_id>', methods=['DELETE'])
@jwt_required()
@admin_required
def delete_module(module_id):
    """Delete a module and all its lessons"""
    try:
        module = Module.query.get(module_id)
        if not module:
            raise NotFoundError('Module not found')
        
        # Delete all lessons in this module
        Lesson.query.filter_by(module_id=module_id).delete()
        
        # Delete the module
        db.session.delete(module)
        db.session.commit()
        
        # Log activity
        log_activity('module_deleted', {
            'module_id': module_id,
            'title': module.title
        })
        
        return APIResponse.success(
            message='Module deleted successfully'
        )
        
    except NotFoundError as e:
        return APIResponse.error(
            message=e.message,
            status_code=404,
            error_code="MODULE_NOT_FOUND"
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting module: {e}")
        return APIResponse.error(
            message='Failed to delete module',
            status_code=500,
            error_code="DELETE_ERROR",
            details={'error': str(e)}
        )

@content_bp.route('/admin/lessons/<int:lesson_id>', methods=['DELETE'])
@jwt_required()
@admin_required
def delete_lesson(lesson_id):
    """Delete a lesson"""
    try:
        lesson = Lesson.query.get(lesson_id)
        if not lesson:
            raise NotFoundError('Lesson not found')
        
        # Delete the lesson
        db.session.delete(lesson)
        db.session.commit()
        
        # Log activity
        log_activity('lesson_deleted', {
            'lesson_id': lesson_id,
            'title': lesson.title
        })
        
        return APIResponse.success(
            message='Lesson deleted successfully'
        )
        
    except NotFoundError as e:
        return APIResponse.error(
            message=e.message,
            status_code=404,
            error_code="LESSON_NOT_FOUND"
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting lesson: {e}")
        return APIResponse.error(
            message='Failed to delete lesson',
            status_code=500,
            error_code="DELETE_ERROR",
            details={'error': str(e)}
        )

# ============================================================================
# CONTENT MIGRATION ENDPOINTS
# ============================================================================

@content_bp.route('/admin/migrate', methods=['POST'])
@jwt_required()
@admin_required
def migrate_content_from_json():
    """Migrate content from JSON files to database"""
    try:
        # Import the migration function
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', 'scripts'))
        
        from migrate_content_to_database import migrate_neural_content, create_default_system_settings, create_default_badges
        
        # Run the migration
        success = migrate_neural_content()
        
        if success:
            # Also create default settings and badges
            create_default_system_settings()
            create_default_badges()
            
            # Get migration statistics
            topics_count = Topic.query.count()
            modules_count = Module.query.count()
            lessons_count = Lesson.query.count()
            
            return APIResponse.success(
                data={
                    'statistics': {
                        'topics': topics_count,
                        'modules': modules_count,
                        'lessons': lessons_count
                    }
                },
                message="Content migration completed successfully"
            )
        else:
            return APIResponse.error(
                message="Content migration failed",
                status_code=500,
                error_code="MIGRATION_FAILED"
            )
            
    except Exception as e:
        logger.error(f"Error during content migration: {e}", exc_info=True)
        return APIResponse.error(
            message="Migration failed",
            status_code=500,
            error_code="MIGRATION_ERROR",
            details={'error': str(e)}
        )

@content_bp.route('/admin/migration-status', methods=['GET'])
@jwt_required()
@admin_required
def get_migration_status():
    """Get content migration status"""
    try:
        # Check if content exists in database
        topics_count = Topic.query.count()
        modules_count = Module.query.count()
        lessons_count = Lesson.query.count()
        
        # Check if JSON files exist
        data_dir = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'data', 'neural-content')
        json_files = []
        if os.path.exists(data_dir):
            json_files = [f for f in os.listdir(data_dir) if f.endswith('.json')]
        
        # Determine migration status
        has_database_content = topics_count > 0 and modules_count > 0 and lessons_count > 0
        has_json_files = len(json_files) > 0
        
        if has_database_content:
            status = 'completed'
        elif has_json_files:
            status = 'pending'
        else:
            status = 'no_source_data'
        
        return APIResponse.success(
            data={
                'status': status,
                'database_content': {
                    'topics': topics_count,
                    'modules': modules_count,
                    'lessons': lessons_count
                },
                'json_files': {
                    'count': len(json_files),
                    'files': json_files
                },
                'migration_needed': has_json_files and not has_database_content
            },
            message="Migration status retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error getting migration status: {e}", exc_info=True)
        return APIResponse.error(
            message="Failed to get migration status",
            status_code=500,
            error_code="MIGRATION_STATUS_ERROR",
            details={'error': str(e)}
        )

@content_bp.route('/admin/sync-from-json', methods=['POST'])
@jwt_required()
@admin_required
def sync_content_from_json():
    """Sync content from JSON files (update existing content)"""
    try:
        data = request.get_json() or {}
        force_update = data.get('force_update', False)
        
        # Import the migration function
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', 'scripts'))
        
        from migrate_content_to_database import load_json_content, migrate_ai_course_content, migrate_direct_modules_content
        
        # Get the data directory path
        data_dir = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'data', 'neural-content')
        
        if not os.path.exists(data_dir):
            return APIResponse.error(
                message=f'Data directory not found: {data_dir}',
                status_code=404,
                error_code="DATA_DIRECTORY_NOT_FOUND"
            )
        
        # Get all JSON files
        json_files = [f for f in os.listdir(data_dir) if f.endswith('.json')]
        json_files.sort()
        
        updated_topics = []
        
        for json_file in json_files:
            file_path = os.path.join(data_dir, json_file)
            content = load_json_content(file_path)
            if not content:
                continue
            
            # Extract topic number from filename
            try:
                topic_number = int(os.path.splitext(json_file)[0])
            except ValueError:
                continue
            
            # Check if topic exists
            existing_topic = Topic.query.filter_by(topic_number=topic_number).first()
            if existing_topic and not force_update:
                continue  # Skip existing topics unless force_update is True
            
            # Process the content
            if 'ai_course' in content and 'modules' in content['ai_course']:
                migrate_ai_course_content(content['ai_course'], topic_number)
            elif 'modules' in content:
                migrate_direct_modules_content(content, topic_number)
            
            updated_topics.append(topic_number)
        
        return APIResponse.success(
            data={
                'updated_topics': updated_topics,
                'files_processed': len(json_files)
            },
            message="Content sync completed successfully"
        )
        
    except Exception as e:
        logger.error(f"Error during content sync: {e}", exc_info=True)
        return APIResponse.error(
            message="Sync failed",
            status_code=500,
            error_code="SYNC_ERROR",
            details={'error': str(e)}
        )

# ============================================================================
# CONTENT REORDER ENDPOINTS
# ============================================================================

@content_bp.route('/admin/topics/reorder', methods=['PUT'])
@jwt_required()
@admin_required
def reorder_topics():
    """Reorder topics by updating their order_index"""
    try:
        from app.utils.responses import APIResponse
        data = request.get_json()
        if not data or 'order' not in data:
            return APIResponse.error(
                message='Order array is required',
                status_code=400,
                error_code="VALIDATION_ERROR"
            )
        
        order_list = data['order']  # Expected: [{id: 1, order_index: 1}, {id: 2, order_index: 2}, ...]
        
        for item in order_list:
            topic_id = item.get('id')
            order_index = item.get('order_index')
            
            if topic_id is None or order_index is None:
                continue
            
            topic = Topic.query.get(topic_id)
            if topic:
                topic.order_index = order_index
        
        db.session.commit()
        
        return APIResponse.success(
            message='Topics reordered successfully'
        )
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error reordering topics: {e}")
        from app.utils.responses import APIResponse
        return APIResponse.error(
            message='Failed to reorder topics',
            status_code=500,
            error_code="REORDER_TOPICS_ERROR"
        )

@content_bp.route('/admin/modules/reorder', methods=['PUT'])
@jwt_required()
@admin_required
def reorder_modules():
    """Reorder modules by updating their order_index"""
    try:
        from app.utils.responses import APIResponse
        data = request.get_json()
        if not data or 'order' not in data:
            return APIResponse.error(
                message='Order array is required',
                status_code=400,
                error_code="VALIDATION_ERROR"
            )
        
        order_list = data['order']  # Expected: [{id: 1, order_index: 1, module_number: 1}, ...]
        
        for item in order_list:
            module_id = item.get('id')
            order_index = item.get('order_index')
            module_number = item.get('module_number')
            
            if module_id is None or order_index is None:
                continue
            
            module = Module.query.get(module_id)
            if module:
                module.order_index = order_index
                if module_number is not None:
                    module.module_number = module_number
        
        db.session.commit()
        
        return APIResponse.success(
            message='Modules reordered successfully'
        )
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error reordering modules: {e}")
        from app.utils.responses import APIResponse
        return APIResponse.error(
            message='Failed to reorder modules',
            status_code=500,
            error_code="REORDER_MODULES_ERROR"
        )

@content_bp.route('/admin/lessons/reorder', methods=['PUT'])
@jwt_required()
@admin_required
def reorder_lessons():
    """Reorder lessons by updating their order_index"""
    try:
        from app.utils.responses import APIResponse
        data = request.get_json()
        if not data or 'order' not in data:
            return APIResponse.error(
                message='Order array is required',
                status_code=400,
                error_code="VALIDATION_ERROR"
            )
        
        order_list = data['order']  # Expected: [{id: 1, order_index: 1, lesson_number: 1}, ...]
        
        for item in order_list:
            lesson_id = item.get('id')
            order_index = item.get('order_index')
            lesson_number = item.get('lesson_number')
            
            if lesson_id is None or order_index is None:
                continue
            
            lesson = Lesson.query.get(lesson_id)
            if lesson:
                lesson.order_index = order_index
                if lesson_number is not None:
                    lesson.lesson_number = lesson_number
        
        db.session.commit()
        
        return APIResponse.success(
            message='Lessons reordered successfully'
        )
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error reordering lessons: {e}")
        from app.utils.responses import APIResponse
        return APIResponse.error(
            message='Failed to reorder lessons',
            status_code=500,
            error_code="REORDER_LESSONS_ERROR"
        )