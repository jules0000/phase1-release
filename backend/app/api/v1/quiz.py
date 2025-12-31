"""
Quiz and assessment API endpoints
"""

from flask import Blueprint, request, jsonify
from app.utils.responses import APIResponse
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models.quiz import QuizQuestion, QuizAttempt, QuizAnswer
from app.models.progress import XPTransaction
from app.models.user import User
# Phase 2 models (not available in MVP)
try:
    from app.models.achievements import UserAchievement, Achievement
except ImportError:
    UserAchievement = None
    Achievement = None
from app.utils.auth_decorators import require_auth
from app.errors import ValidationError, NotFoundError
# Phase 2 services (not available in MVP)
try:
    from app.services.realtime_service import get_realtime_service
except ImportError:
    def get_realtime_service():
        return None
try:
    from app.utils.logging import log_business_event as log_activity
except ImportError:
    def log_activity(*args, **kwargs):
        pass
from datetime import datetime
import json
import random
import statistics
import logging

logger = logging.getLogger(__name__)
quiz_bp = Blueprint('quiz', __name__)

@quiz_bp.route('/review-questions', methods=['GET'])
@jwt_required()
def get_review_questions():
    """Get mixed review questions from various modules"""
    try:
        user_id = get_jwt_identity()
        
        # Get query parameters
        difficulty = request.args.get('difficulty')
        topic = request.args.get('topic')
        limit = request.args.get('limit', 10, type=int)
        
        # Build query
        query = QuizQuestion.query.filter_by(status='active')
        
        if difficulty:
            query = query.filter_by(difficulty=difficulty)
        
        if topic:
            query = query.filter(QuizQuestion.topic.ilike(f'%{topic}%'))
        
        # Get random questions from different modules
        questions = query.order_by(db.func.random()).limit(limit).all()
        
        # If no questions found, create some default ones
        if not questions:
            default_questions = [
                {
                    'id': 1,
                    'module': 'Prompt Basics',
                    'type': 'multiple-choice',
                    'question': 'What makes a prompt more effective?',
                    'options': ['Length', 'Clarity and specificity', 'Complex vocabulary', 'Multiple questions'],
                    'correct': 1,
                    'explanation': 'Clear and specific prompts help AI understand exactly what you want.',
                    'difficulty': 'easy',
                    'topic': 'Fundamentals',
                    'xpReward': 10
                },
                {
                    'id': 2,
                    'module': 'Advanced Techniques',
                    'type': 'true-false',
                    'question': 'Chain-of-thought prompting always requires examples.',
                    'options': ['True', 'False'],
                    'correct': 1,
                    'explanation': 'While examples help, chain-of-thought can work with just instructions to think step by step.',
                    'difficulty': 'medium',
                    'topic': 'Chain-of-thought',
                    'xpReward': 15
                }
            ]
            return APIResponse.success(
                data={'questions': default_questions},
                message="Review questions retrieved successfully"
            )
        
        # Convert to dict format expected by frontend
        questions_data = []
        for q in questions:
            question_dict = q.to_dict()
            # Map database fields to frontend expected format
            questions_data.append({
                'id': question_dict.get('id'),
                'module': question_dict.get('module_name', 'General'),
                'type': question_dict.get('question_type', 'multiple-choice'),
                'question': question_dict.get('question_text'),
                'options': question_dict.get('options', []),
                'correct': question_dict.get('correct_answer'),
                'explanation': question_dict.get('explanation', ''),
                'difficulty': question_dict.get('difficulty', 'medium'),
                'topic': question_dict.get('topic', 'General'),
                'xpReward': question_dict.get('xp_reward', 10)
            })
        
        return APIResponse.success(
            data={'questions': questions_data},
            message="Review questions retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error getting review questions: {e}", exc_info=True)
        return APIResponse.error(
            message='Failed to get review questions',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@quiz_bp.route('/lesson-exercises/<lesson_key>', methods=['GET'])
@jwt_required()
def get_lesson_exercises(lesson_key):
    """Get exercises for a specific lesson"""
    try:
        user_id = get_jwt_identity()
        
        # Parse lesson key (format: "module-id-lesson-id")
        parts = lesson_key.split('-')
        if len(parts) < 4:
            raise ValidationError('Invalid lesson key format')
        
        module_id = parts[0]
        lesson_id = parts[2]
        
        # Get exercises for this lesson
        questions = QuizQuestion.query.filter_by(
            lesson_id=lesson_id,
            status='active'
        ).order_by(QuizQuestion.order_index).all()
        
        # If no questions found, create some default ones based on lesson key
        if not questions:
            default_exercises = []
            if 'prompt-basics' in lesson_key:
                default_exercises = [
                    {
                        'id': 1,
                        'type': 'multiple-choice',
                        'question': 'What is the most important element of an effective AI prompt?',
                        'options': [
                            'Making it as long as possible',
                            'Clear and specific instructions',
                            'Using complex vocabulary',
                            'Adding many examples'
                        ],
                        'correct': 1,
                        'explanation': 'Clear and specific instructions help the AI understand exactly what you want, leading to better results.',
                        'xpReward': 10
                    },
                    {
                        'id': 2,
                        'type': 'true-false',
                        'question': 'Longer prompts always produce better results than shorter ones.',
                        'options': ['True', 'False'],
                        'correct': 1,
                        'explanation': 'Quality matters more than length. A concise, well-structured prompt often works better than a long, unclear one.',
                        'xpReward': 10
                    }
                ]
            
            return APIResponse.success(
                data={'exercises': default_exercises},
                message="Lesson exercises retrieved successfully"
            )
        
        # Convert to expected format
        exercises_data = []
        for q in questions:
            question_dict = q.to_dict()
            exercises_data.append({
                'id': question_dict.get('id'),
                'type': question_dict.get('question_type', 'multiple-choice'),
                'question': question_dict.get('question_text'),
                'options': question_dict.get('options', []),
                'correct': question_dict.get('correct_answer'),
                'explanation': question_dict.get('explanation', ''),
                'prompt': question_dict.get('prompt_text'),
                'context': question_dict.get('context'),
                'xpReward': question_dict.get('xp_reward', 10)
            })
        
        return APIResponse.success(
            data={'exercises': exercises_data},
            message="Lesson exercises retrieved successfully"
        )
        
    except ValidationError as e:
        return APIResponse.error(
            message=e.message,
            status_code=e.status_code,
            error_code="VALIDATION_ERROR"
        )
    except Exception as e:
        logger.error(f"Error getting lesson exercises: {e}", exc_info=True)
        return APIResponse.error(
            message='Failed to get lesson exercises',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@quiz_bp.route('/<int:module_id>/<int:lesson_id>', methods=['GET'])
@jwt_required()
def get_quiz(module_id, lesson_id):
    """Get quiz questions for a lesson"""
    try:
        user_id = get_jwt_identity()
        
        # Get quiz questions
        questions = QuizQuestion.query.filter_by(
            lesson_id=lesson_id, 
            status='active'
        ).order_by(QuizQuestion.order_index).all()
        
        if not questions:
            raise NotFoundError('No quiz questions found for this lesson')
        
        # Get user's previous attempts
        attempts = QuizAttempt.query.filter_by(
            user_id=user_id, 
            lesson_id=lesson_id
        ).order_by(QuizAttempt.attempt_number.desc()).all()
        
        # Calculate quiz statistics
        best_score = max([a.score for a in attempts], default=0)
        average_score = statistics.mean([a.score for a in attempts]) if attempts else 0
        
        # Determine quiz difficulty and time limit
        difficulty = request.args.get('difficulty', 'medium')
        time_limit = 30  # Default 30 minutes
        
        if difficulty == 'easy':
            time_limit = 45
        elif difficulty == 'hard':
            time_limit = 20
        
        # Shuffle questions if requested
        if request.args.get('shuffle', 'false').lower() == 'true':
            random.shuffle(questions)
        
        # Limit questions if requested
        max_questions = request.args.get('max_questions', type=int)
        if max_questions and max_questions < len(questions):
            questions = questions[:max_questions]
        
        return APIResponse.success(
            data={
                'questions': [q.to_dict() for q in questions],
                'timeLimit': time_limit,
                'attempts': len(attempts),
                'bestScore': best_score,
                'averageScore': round(average_score, 2),
                'difficulty': difficulty,
                'totalQuestions': len(questions),
                'quizId': f"{module_id}_{lesson_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            },
            message="Quiz retrieved successfully"
        )
        
    except NotFoundError as e:
        return APIResponse.error(
            message=e.message,
            status_code=e.status_code,
            error_code="RESOURCE_NOT_FOUND"
        )
    except Exception as e:
        logger.error(f"Error getting quiz: {e}", exc_info=True)
        return APIResponse.error(
            message='Failed to get quiz',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@quiz_bp.route('/<int:module_id>/<int:lesson_id>/submit', methods=['POST'])
@jwt_required()
def submit_quiz(module_id, lesson_id):
    """Submit quiz answers"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or 'answers' not in data:
            raise ValidationError('Quiz answers are required')
        
        answers = data['answers']
        time_spent = data.get('timeSpent', 0)
        
        # Get quiz questions
        questions = QuizQuestion.query.filter_by(
            lesson_id=lesson_id, 
            status='active'
        ).all()
        
        if not questions:
            raise NotFoundError('No quiz questions found')
        
        # Calculate score
        correct_answers = 0
        total_questions = len(questions)
        question_scores = []
        
        for question in questions:
            user_answer = answers.get(str(question.id))
            is_correct = False
            
            if user_answer is not None:
                if question.question_type == 'multiple_choice':
                    is_correct = user_answer == question.correct_answer
                elif question.question_type == 'true_false':
                    is_correct = user_answer == question.correct_answer
                # Add more question types as needed
            
            if is_correct:
                correct_answers += 1
            
            question_scores.append({
                'question_id': question.id,
                'is_correct': is_correct,
                'points_earned': question.points if is_correct else 0
            })
        
        # Calculate final score
        score = (correct_answers / total_questions) * 100
        
        # HIGH-004 Fix: Use database-level locking to prevent race conditions in attempt counting
        # Get max attempt number with row-level lock to ensure atomic read-modify-write
        from sqlalchemy import func
        max_attempt = db.session.query(
            func.max(QuizAttempt.attempt_number)
        ).filter_by(
            user_id=user_id,
            lesson_id=lesson_id
        ).with_for_update().scalar() or 0
        
        next_attempt = max_attempt + 1
        
        # Create quiz attempt with atomic attempt number
        quiz_attempt = QuizAttempt(
            user_id=user_id,
            lesson_id=lesson_id,
            attempt_number=next_attempt,
            answers=answers,
            score=score,
            max_score=100,
            time_spent=time_spent,
            status='completed',
            submitted_at=datetime.utcnow()
        )
        db.session.add(quiz_attempt)
        
        # Calculate XP earned with bonus for perfect scores
        base_xp = int(score * 0.5)  # 0.5 XP per percentage point
        bonus_xp = 0
        
        if score == 100:
            bonus_xp = 50  # Perfect score bonus
        elif score >= 90:
            bonus_xp = 25  # Excellent score bonus
        elif score >= 80:
            bonus_xp = 10  # Good score bonus
        
        xp_earned = base_xp + bonus_xp
        
        # Create XP transaction
        xp_transaction = XPTransaction(
            user_id=user_id,
            source='quiz_completion',
            amount=xp_earned,
            description=f'Completed quiz for lesson {lesson_id}',
            metadata={
                'lesson_id': lesson_id,
                'module_id': module_id,
                'score': score,
                'correct_answers': correct_answers,
                'total_questions': total_questions,
                'base_xp': base_xp,
                'bonus_xp': bonus_xp,
                'time_spent': time_spent
            }
        )
        db.session.add(xp_transaction)
        
        # Update user XP
        user = User.query.get(user_id)
        user.total_xp += xp_earned
        
        # Check for achievements
        achievements_unlocked = []
        
        # Perfect score achievement
        if score == 100:
            achievement = Achievement.query.filter_by(
                name='Perfect Score',
                category='quiz'
            ).first()
            if achievement:
                existing = UserAchievement.query.filter_by(
                    user_id=user_id,
                    achievement_id=achievement.id
                ).first()
                if not existing:
                    user_achievement = UserAchievement(
                        user_id=user_id,
                        achievement_id=achievement.id,
                        unlocked_at=datetime.utcnow()
                    )
                    db.session.add(user_achievement)
                    achievements_unlocked.append(achievement.to_dict())
        
        # Speed achievement (completed in under 10 minutes)
        if time_spent < 600:  # 10 minutes in seconds
            achievement = Achievement.query.filter_by(
                name='Speed Demon',
                category='quiz'
            ).first()
            if achievement:
                existing = UserAchievement.query.filter_by(
                    user_id=user_id,
                    achievement_id=achievement.id
                ).first()
                if not existing:
                    user_achievement = UserAchievement(
                        user_id=user_id,
                        achievement_id=achievement.id,
                        unlocked_at=datetime.utcnow()
                    )
                    db.session.add(user_achievement)
                    achievements_unlocked.append(achievement.to_dict())
        
        db.session.commit()
        
        # Send real-time updates
        realtime_service = get_realtime_service()
        if realtime_service:
            # Send XP update
            realtime_service.send_xp_update(user_id, {
                'xp_earned': xp_earned,
                'total_xp': user.total_xp,
                'source': 'quiz_completion'
            })
            
            # Send quiz result
            realtime_service.send_quiz_result(user_id, {
                'score': score,
                'correct_answers': correct_answers,
                'total_questions': total_questions,
                'xp_earned': xp_earned,
                'achievements_unlocked': achievements_unlocked
            })
            
            # Send achievement notifications
            for achievement in achievements_unlocked:
                realtime_service.send_achievement_notification(user_id, achievement)
        
        # Log activity
        log_activity(
            user_id=user_id,
            action='quiz_completed',
            details=f'Completed quiz for lesson {lesson_id} with score {score}%'
        )
        
        return APIResponse.success(
            data={
                'score': score,
                'correctAnswers': correct_answers,
                'totalQuestions': total_questions,
                'xpEarned': xp_earned,
                'baseXp': base_xp,
                'bonusXp': bonus_xp,
                'feedback': question_scores,
                'attemptNumber': attempt_count + 1,
                'achievementsUnlocked': achievements_unlocked,
                'timeSpent': time_spent,
                'performance': {
                    'grade': 'A' if score >= 90 else 'B' if score >= 80 else 'C' if score >= 70 else 'D' if score >= 60 else 'F',
                    'message': get_performance_message(score, time_spent)
                }
            },
            message="Quiz submitted successfully"
        )
        
    except (ValidationError, NotFoundError) as e:
        return APIResponse.error(
            message=e.message,
            status_code=e.status_code,
            error_code="VALIDATION_ERROR" if isinstance(e, ValidationError) else "RESOURCE_NOT_FOUND"
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error submitting quiz: {e}", exc_info=True)
        return APIResponse.error(
            message='Failed to submit quiz',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@quiz_bp.route('/attempts', methods=['GET'])
@jwt_required()
def get_all_quiz_attempts():
    """Get all quiz attempts for the authenticated user across all modules/lessons"""
    try:
        user_id = get_jwt_identity()
        
        # Get all attempts for the user
        attempts = QuizAttempt.query.filter_by(
            user_id=user_id
        ).order_by(QuizAttempt.submitted_at.desc() if hasattr(QuizAttempt, 'submitted_at') else QuizAttempt.attempt_number.desc()).all()
        
        best_score = max([a.score for a in attempts], default=0) if attempts else 0
        total_attempts = len(attempts)
        
        return APIResponse.success(
            data={
                'attempts': [a.to_dict() if hasattr(a, 'to_dict') else {
                    'id': a.id,
                    'lesson_id': a.lesson_id,
                    'score': a.score,
                    'attempt_number': a.attempt_number if hasattr(a, 'attempt_number') else 1,
                    'submitted_at': a.submitted_at.isoformat() if hasattr(a, 'submitted_at') and a.submitted_at else None
                } for a in attempts],
                'bestScore': best_score,
                'totalAttempts': total_attempts
            },
            message="Quiz attempts retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error getting quiz attempts: {e}", exc_info=True)
        return APIResponse.error(
            message='Failed to get quiz attempts',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@quiz_bp.route('/<int:module_id>/<int:lesson_id>/attempts', methods=['GET'])
@jwt_required()
def get_quiz_attempts(module_id, lesson_id):
    """Get user's quiz attempt history for a specific lesson"""
    try:
        user_id = get_jwt_identity()
        
        attempts = QuizAttempt.query.filter_by(
            user_id=user_id, 
            lesson_id=lesson_id
        ).order_by(QuizAttempt.attempt_number.desc()).all()
        
        best_score = max([a.score for a in attempts], default=0) if attempts else 0
        
        return APIResponse.success(
            data={
                'attempts': [a.to_dict() for a in attempts],
                'bestScore': best_score,
                'totalAttempts': len(attempts)
            },
            message="Quiz attempts retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error getting quiz attempts: {e}", exc_info=True)
        return APIResponse.error(
            message='Failed to get quiz attempts',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

def get_performance_message(score, time_spent):
    """Get performance message based on score and time"""
    if score == 100:
        return "Perfect! Outstanding work!"
    elif score >= 90:
        return "Excellent! You've mastered this topic."
    elif score >= 80:
        return "Great job! You have a solid understanding."
    elif score >= 70:
        return "Good work! Consider reviewing the material."
    elif score >= 60:
        return "Not bad, but there's room for improvement."
    else:
        return "Keep studying! You'll get there with practice."

@quiz_bp.route('/<int:module_id>/<int:lesson_id>/practice', methods=['GET'])
@jwt_required()
def get_practice_quiz(module_id, lesson_id):
    """Get practice quiz with unlimited attempts"""
    try:
        user_id = get_jwt_identity()
        
        # Get quiz questions
        questions = QuizQuestion.query.filter_by(
            lesson_id=lesson_id, 
            status='active'
        ).order_by(QuizQuestion.order_index).all()
        
        if not questions:
            raise NotFoundError('No quiz questions found for this lesson')
        
        # Shuffle questions for practice
        random.shuffle(questions)
        
        # Limit to 5 questions for practice
        practice_questions = questions[:5]
        
        return APIResponse.success(
            data={
                'questions': [q.to_dict() for q in practice_questions],
                'mode': 'practice',
                'unlimitedAttempts': True,
                'showAnswers': True,
                'totalQuestions': len(practice_questions)
            },
            message="Practice quiz retrieved successfully"
        )
        
    except NotFoundError as e:
        return APIResponse.error(
            message=e.message,
            status_code=e.status_code,
            error_code="RESOURCE_NOT_FOUND"
        )
    except Exception as e:
        logger.error(f"Error getting practice quiz: {e}", exc_info=True)
        return APIResponse.error(
            message='Failed to get practice quiz',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@quiz_bp.route('/<int:module_id>/<int:lesson_id>/practice/submit', methods=['POST'])
@jwt_required()
def submit_practice_quiz(module_id, lesson_id):
    """Submit practice quiz answers with immediate feedback"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or 'answers' not in data:
            raise ValidationError('Quiz answers are required')
        
        answers = data['answers']
        
        # Get quiz questions
        questions = QuizQuestion.query.filter_by(
            lesson_id=lesson_id, 
            status='active'
        ).all()
        
        if not questions:
            raise NotFoundError('No quiz questions found')
        
        # Calculate score and provide detailed feedback
        correct_answers = 0
        total_questions = len(questions)
        detailed_feedback = []
        
        for question in questions:
            user_answer = answers.get(str(question.id))
            is_correct = False
            
            if user_answer is not None:
                if question.question_type == 'multiple_choice':
                    is_correct = user_answer == question.correct_answer
                elif question.question_type == 'true_false':
                    is_correct = user_answer == question.correct_answer
            
            if is_correct:
                correct_answers += 1
            
            detailed_feedback.append({
                'question_id': question.id,
                'question_text': question.question_text,
                'user_answer': user_answer,
                'correct_answer': question.correct_answer,
                'is_correct': is_correct,
                'explanation': question.explanation if hasattr(question, 'explanation') else None
            })
        
        score = (correct_answers / total_questions) * 100
        
        return APIResponse.success(
            data={
                'score': score,
                'correctAnswers': correct_answers,
                'totalQuestions': total_questions,
                'feedback': detailed_feedback,
                'mode': 'practice',
                'showAnswers': True
            },
            message="Practice quiz submitted successfully"
        )
        
    except (ValidationError, NotFoundError) as e:
        return APIResponse.error(
            message=e.message,
            status_code=e.status_code,
            error_code="VALIDATION_ERROR" if isinstance(e, ValidationError) else "RESOURCE_NOT_FOUND"
        )
    except Exception as e:
        logger.error(f"Error submitting practice quiz: {e}", exc_info=True)
        return APIResponse.error(
            message='Failed to submit practice quiz',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@quiz_bp.route('/<int:module_id>/<int:lesson_id>/analytics', methods=['GET'])
@jwt_required()
def get_quiz_analytics(module_id, lesson_id):
    """Get detailed quiz analytics for a lesson"""
    try:
        user_id = get_jwt_identity()
        
        # Get all attempts for this lesson
        attempts = QuizAttempt.query.filter_by(
            user_id=user_id, 
            lesson_id=lesson_id
        ).order_by(QuizAttempt.attempt_number).all()
        
        if not attempts:
            return APIResponse.success(
                data={'analytics': {}},
                message="No quiz attempts found"
            )
        
        # Calculate analytics
        scores = [attempt.score for attempt in attempts]
        times = [attempt.time_spent for attempt in attempts]
        
        analytics = {
            'totalAttempts': len(attempts),
            'bestScore': max(scores),
            'worstScore': min(scores),
            'averageScore': round(statistics.mean(scores), 2),
            'medianScore': round(statistics.median(scores), 2),
            'scoreImprovement': scores[-1] - scores[0] if len(scores) > 1 else 0,
            'averageTime': round(statistics.mean(times), 2),
            'fastestTime': min(times),
            'slowestTime': max(times),
            'attempts': [attempt.to_dict() for attempt in attempts],
            'trend': 'improving' if len(scores) > 1 and scores[-1] > scores[0] else 'stable'
        }
        
        return APIResponse.success(
            data=analytics,
            message="Quiz analytics retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error getting quiz analytics: {e}", exc_info=True)
        return APIResponse.error(
            message='Failed to get quiz analytics',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )

@quiz_bp.route('/leaderboard/<int:lesson_id>', methods=['GET'])
@jwt_required()
def get_quiz_leaderboard(lesson_id):
    """Get leaderboard for a specific quiz"""
    try:
        # Get top 10 scores for this lesson
        top_attempts = QuizAttempt.query.filter_by(
            lesson_id=lesson_id
        ).order_by(QuizAttempt.score.desc(), QuizAttempt.time_spent.asc()).limit(10).all()
        
        leaderboard = []
        for i, attempt in enumerate(top_attempts):
            user = User.query.get(attempt.user_id)
            leaderboard.append({
                'rank': i + 1,
                'username': user.username,
                'score': attempt.score,
                'timeSpent': attempt.time_spent,
                'attemptNumber': attempt.attempt_number,
                'submittedAt': attempt.submitted_at.isoformat()
            })
        
        return APIResponse.success(
            data={
                'lessonId': lesson_id,
                'leaderboard': leaderboard,
                'totalParticipants': QuizAttempt.query.filter_by(lesson_id=lesson_id).count()
            },
            message="Quiz leaderboard retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error getting quiz leaderboard: {e}", exc_info=True)
        return APIResponse.error(
            message='Failed to get quiz leaderboard',
            status_code=500,
            error_code="INTERNAL_ERROR"
        )
