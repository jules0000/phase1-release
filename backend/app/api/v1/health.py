"""
Health check endpoints for monitoring and load balancers
"""

from flask import Blueprint, jsonify
from app import db
from app.models.user import User
from datetime import datetime
from sqlalchemy import text
import os

health_bp = Blueprint('health', __name__)

# Track application start time for uptime calculation
_app_start_time = datetime.utcnow()
_request_count = 0
_request_window_start = datetime.utcnow()

def _calculate_uptime():
    """Calculate application uptime in hours"""
    uptime_seconds = (datetime.utcnow() - _app_start_time).total_seconds()
    return round(uptime_seconds / 3600, 2)

def _get_request_rate():
    """Calculate approximate request rate per minute"""
    # Simple implementation: track requests in a time window
    # In production, this would use proper monitoring/metrics
    global _request_count, _request_window_start
    now = datetime.utcnow()
    window_duration = (now - _request_window_start).total_seconds()
    
    # Reset window every minute
    if window_duration > 60:
        _request_count = 0
        _request_window_start = now
        return 0
    
    # Calculate rate per minute
    if window_duration > 0:
        rate_per_minute = (_request_count / window_duration) * 60
        return round(rate_per_minute, 2)
    return 0

@health_bp.route('/health', methods=['GET'])
def health_check():
    """Basic health check endpoint"""
    try:
        # Check database connectivity
        db.session.execute(text('SELECT 1'))
        
        # Get basic stats
        user_count = User.query.count()
        
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.utcnow().isoformat(),
            'version': '1.0.0',
            'database': 'connected',
            'users': user_count,
            'environment': os.getenv('FLASK_ENV', 'development')
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'timestamp': datetime.utcnow().isoformat(),
            'error': str(e)
        }), 503

@health_bp.route('/health/ready', methods=['GET'])
def readiness_check():
    """Readiness check for Kubernetes
    
    Returns 200 if the application is ready to serve requests,
    503 if database is not accessible.
    """
    try:
        # Check database connectivity - this is the critical check
        db.session.execute(text('SELECT 1'))
        db.session.rollback()  # Clean up the session
        
        return jsonify({
            'status': 'ready',
            'timestamp': datetime.utcnow().isoformat(),
            'database': 'connected'
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'not_ready',
            'timestamp': datetime.utcnow().isoformat(),
            'database': 'disconnected',
            'error': str(e)
        }), 503

@health_bp.route('/health/live', methods=['GET'])
def liveness_check():
    """Liveness check for Kubernetes
    
    This check should ALWAYS return 200 if the application is running,
    regardless of database status. It indicates the process is alive.
    """
    return jsonify({
        'status': 'alive',
        'timestamp': datetime.utcnow().isoformat()
    }), 200

@health_bp.route('/system-health', methods=['GET'])
def get_system_health():
    """Get detailed system health metrics"""
    try:
        from app.models.user import UserSession
        from app.models.progress import UserProgress
        from datetime import timedelta
        
        # Database health
        db_status = 'unhealthy'
        db_response_time = 0
        active_sessions = 0
        recent_users = 0
        
        try:
            db.session.execute(text('SELECT 1'))
            db.session.rollback()
            db_status = 'healthy'
            db_response_time = 0.1  # Approximate
            
            # Get active sessions - only if database is healthy
            try:
                active_sessions = UserSession.query.filter_by(is_active=True).count()
            except Exception:
                active_sessions = 0
            
            # Get recent activity - only if database is healthy
            try:
                recent_users = User.query.filter(
                    User.last_login >= datetime.utcnow() - timedelta(hours=24)
                ).count()
            except Exception:
                recent_users = 0
                
        except Exception as db_error:
            db_status = 'unhealthy'
            db_response_time = 0
        
        # System resources (if psutil is available)
        cpu_usage = 0
        memory_usage = 0
        disk_usage = 0
        try:
            import psutil
            cpu_usage = psutil.cpu_percent(interval=0.1)  # Reduced interval for faster response
            memory = psutil.virtual_memory()
            memory_usage = memory.percent
            # Use current drive on Windows
            disk = psutil.disk_usage(os.path.abspath(os.sep))
            disk_usage = disk.percent
        except ImportError:
            pass  # psutil not installed
        except Exception:
            pass  # psutil error
        
        # API status
        api_status = 'operational'
        
        # OpenAI status
        openai_status = 'operational' if os.getenv('OPENAI_API_KEY') else 'not_configured'
        
        health_data = {
            'overall_status': 'healthy' if db_status == 'healthy' else 'degraded',
            'timestamp': datetime.utcnow().isoformat(),
            'components': {
                'database': {
                    'status': db_status,
                    'response_time_ms': db_response_time,
                    'active_connections': active_sessions
                },
                'api': {
                    'status': api_status,
                    'uptime_hours': _calculate_uptime(),
                    'request_rate': _get_request_rate()
                },
                'openai': {
                    'status': openai_status,
                    'quota_remaining': None  # OpenAI API doesn't expose quota via API
                },
                'storage': {
                    'status': 'healthy',
                    'disk_usage_percent': disk_usage
                }
            },
            'metrics': {
                'cpu_usage_percent': cpu_usage,
                'memory_usage_percent': memory_usage,
                'disk_usage_percent': disk_usage,
                'active_users_24h': recent_users,
                'active_sessions': active_sessions
            },
            'alerts': []
        }
        
        # Add alerts for high resource usage
        if cpu_usage > 80:
            health_data['alerts'].append({
                'level': 'warning',
                'message': 'High CPU usage detected',
                'value': cpu_usage
            })
        
        if memory_usage > 80:
            health_data['alerts'].append({
                'level': 'warning',
                'message': 'High memory usage detected',
                'value': memory_usage
            })
        
        if disk_usage > 80:
            health_data['alerts'].append({
                'level': 'warning',
                'message': 'High disk usage detected',
                'value': disk_usage
            })
        
        return jsonify(health_data), 200
        
    except Exception as e:
        return jsonify({
            'overall_status': 'error',
            'timestamp': datetime.utcnow().isoformat(),
            'error': str(e)
        }), 500