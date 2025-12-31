"""
Celery Background Tasks
Async operations for email, PDF generation, analytics, etc.
"""

from celery import Celery
import os

# Initialize Celery
celery = Celery(
    'neuralai',
    broker=os.getenv('CELERY_BROKER_URL', 'redis://localhost:6379/0'),
    backend=os.getenv('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')
)

# Celery configuration
celery.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 minutes max
    task_soft_time_limit=240,  # 4 minutes soft limit
)


@celery.task(bind=True, max_retries=3)
def send_email_async(self, to_email, subject, html_body, text_body=None):
    """
    Send email asynchronously
    
    Args:
        to_email: Recipient email
        subject: Email subject
        html_body: HTML email body
        text_body: Plain text email body (optional)
    """
    try:
        from app.services.email_service import get_email_service
        email_service = get_email_service()
        
        success = email_service.send_email(
            to_email=to_email,
            subject=subject,
            html_body=html_body,
            text_body=text_body
        )
        
        if not success:
            raise Exception("Email send failed")
        
        return {'status': 'sent', 'to': to_email}
        
    except Exception as e:
        # Retry with exponential backoff
        raise self.retry(exc=e, countdown=60 * (2 ** self.request.retries))


@celery.task
def generate_certificate_async(user_id, module_id):
    """
    Generate certificate PDF asynchronously
    
    Args:
        user_id: User ID
        module_id: Module ID
    """
    from app.services.certificate_service import generate_certificate
    from app.models.user import User
    from app.models.content import Module
    from app import db
    
    with celery.app.app_context():
        user = User.query.get(user_id)
        module = Module.query.get(module_id)
        
        if not user or not module:
            return {'status': 'error', 'message': 'User or module not found'}
        
        certificate = generate_certificate(user, module)
        
        return {
            'status': 'generated',
            'certificate_id': certificate.id,
            'download_url': certificate.pdf_url
        }


@celery.task
def update_leaderboard_async():
    """
    Update entire leaderboard asynchronously
    Runs periodically (every 5 minutes) instead of on every XP change
    """
    from app.models.leaderboard import Leaderboard
    from app import db
    
    with celery.app.app_context():
        # Fetch all entries ordered by XP
        entries = Leaderboard.query.order_by(
            Leaderboard.total_xp.desc()
        ).all()
        
        # Update ranks
        for rank, entry in enumerate(entries, start=1):
            entry.rank = rank
        
        db.session.commit()
        
        return {'status': 'updated', 'total_users': len(entries)}


@celery.task
def calculate_analytics_async(date=None):
    """
    Calculate analytics data asynchronously
    Heavy computation that shouldn't block requests
    """
    from app.services.analytics_service import calculate_daily_analytics
    from datetime import date as date_type
    
    with celery.app.app_context():
        target_date = date or date_type.today()
        analytics = calculate_daily_analytics(target_date)
        
        return {'status': 'calculated', 'date': str(target_date)}


@celery.task
def cleanup_old_sessions_async():
    """
    Clean up expired sessions
    Runs daily
    """
    from app.models.user import UserSession
    from app import db
    from datetime import datetime
    
    with celery.app.app_context():
        # Delete sessions older than 30 days
        cutoff = datetime.utcnow() - timedelta(days=30)
        deleted = UserSession.query.filter(
            UserSession.created_at < cutoff
        ).delete()
        
        db.session.commit()
        
        return {'status': 'cleaned', 'deleted_sessions': deleted}


@celery.task
def send_notification_batch_async(user_ids, notification_type, data):
    """
    Send notifications to multiple users asynchronously
    
    Args:
        user_ids: List of user IDs
        notification_type: Type of notification
        data: Notification data
    """
    from app.services.notification_service import send_notification
    
    with celery.app.app_context():
        sent = 0
        for user_id in user_ids:
            try:
                send_notification(user_id, notification_type, data)
                sent += 1
            except Exception as e:
                logger.error(f"Failed to send notification to user {user_id}: {e}")
        
        return {'status': 'completed', 'sent': sent, 'total': len(user_ids)}


# Periodic Tasks (Celery Beat)
celery.conf.beat_schedule = {
    'update-leaderboard-every-5-minutes': {
        'task': 'app.tasks.update_leaderboard_async',
        'schedule': 300.0,  # 5 minutes
    },
    'calculate-analytics-daily': {
        'task': 'app.tasks.calculate_analytics_async',
        'schedule': crontab(hour=2, minute=0),  # 2 AM daily
    },
    'cleanup-sessions-daily': {
        'task': 'app.tasks.cleanup_old_sessions_async',
        'schedule': crontab(hour=3, minute=0),  # 3 AM daily
    },
}

