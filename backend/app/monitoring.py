"""
Monitoring and Observability Configuration
Integrates Sentry, structured logging, and metrics collection
"""

import os
import time
import logging
from flask import request, g
from flask_jwt_extended import get_jwt_identity
from functools import wraps

# Make Sentry optional for local development
try:
    import sentry_sdk
    from sentry_sdk.integrations.flask import FlaskIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
    from sentry_sdk.integrations.redis import RedisIntegration
    
    # Try to import Celery integration, but don't fail if it's not available
    try:
        from sentry_sdk.integrations.celery import CeleryIntegration
        CELERY_INTEGRATION = CeleryIntegration()
    except:
        CELERY_INTEGRATION = None
    
    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False
    CELERY_INTEGRATION = None
    # Sentry is optional - used for production error tracking
    # No warning needed in development mode

logger = logging.getLogger(__name__)


def init_monitoring(app):
    """
    Initialize comprehensive monitoring for the application
    
    Features:
    - Error tracking (Sentry)
    - Request timing
    - Structured logging
    - Performance monitoring
    - Custom metrics
    """
    
    # 1. Initialize Sentry if DSN is configured and Sentry is available
    # Try to get DSN from database first, fallback to environment variable
    sentry_dsn = None
    try:
        from app.services.credential_service import credential_service
        sentry_dsn = credential_service.get_sentry_dsn()
    except Exception as e:
        logger.debug(f"Could not load Sentry DSN from database: {e}")
    
    # Fallback to environment variable if not in database
    if not sentry_dsn:
        sentry_dsn = os.getenv('SENTRY_DSN')
    
    if SENTRY_AVAILABLE and sentry_dsn:
        # Build integrations list, only including available ones
        integrations = [
            FlaskIntegration(),
            SqlalchemyIntegration(),
            RedisIntegration()
        ]
        
        # Add Celery integration only if available
        if CELERY_INTEGRATION:
            integrations.append(CELERY_INTEGRATION)
        
        sentry_sdk.init(
            dsn=sentry_dsn,
            integrations=integrations,
            # Performance monitoring
            traces_sample_rate=float(os.getenv('SENTRY_TRACES_SAMPLE_RATE', '0.1')),
            profiles_sample_rate=float(os.getenv('SENTRY_PROFILES_SAMPLE_RATE', '0.1')),
            
            # Environment configuration
            environment=os.getenv('FLASK_ENV', 'development'),
            release=os.getenv('APP_VERSION', 'unknown'),
            
            # Additional options
            send_default_pii=False,  # Don't send personally identifiable information
            attach_stacktrace=True,
            max_breadcrumbs=50,
        )
        logger.info("Sentry monitoring initialized")
    else:
        # Sentry not configured - this is normal for local development
        # In production, set SENTRY_DSN environment variable to enable error tracking
        pass
    
    # 2. Request timing middleware
    @app.before_request
    def start_timer():
        """Start timer for request duration tracking"""
        g.start_time = time.time()
        g.request_id = request.headers.get('X-Request-ID', generate_request_id())
    
    @app.after_request
    def log_request(response):
        """Log request completion with timing and context"""
        if hasattr(g, 'start_time'):
            duration = time.time() - g.start_time
            duration_ms = duration * 1000
            
            # Get user ID if authenticated
            try:
                user_id = get_jwt_identity()
            except:
                user_id = None
            
            # Structured log entry
            log_data = {
                'request_id': getattr(g, 'request_id', 'unknown'),
                'method': request.method,
                'path': request.path,
                'status': response.status_code,
                'duration_ms': round(duration_ms, 2),
                'user_id': user_id,
                'ip': request.remote_addr,
                'user_agent': request.headers.get('User-Agent', 'unknown')[:100]
            }
            
            # Log at appropriate level
            if response.status_code >= 500:
                logger.error('request_completed', extra=log_data)
            elif response.status_code >= 400:
                logger.warning('request_completed', extra=log_data)
            else:
                logger.info('request_completed', extra=log_data)
            
            # Alert on slow requests
            slow_threshold = float(os.getenv('SLOW_REQUEST_THRESHOLD_MS', '2000'))
            if duration_ms > slow_threshold:
                logger.warning(f'Slow request detected: {request.path} took {duration_ms:.2f}ms', extra=log_data)
                
                # Send to Sentry as performance issue
                if sentry_dsn:
                    with sentry_sdk.push_scope() as scope:
                        scope.set_context("request", log_data)
                        sentry_sdk.capture_message(
                            f"Slow request: {request.method} {request.path}",
                            level="warning"
                        )
            
            # Add custom headers for observability
            response.headers['X-Request-ID'] = log_data['request_id']
            response.headers['X-Response-Time'] = str(duration_ms)
        
        return response
    
    # 3. Error handler integration
    @app.errorhandler(Exception)
    def handle_exception(error):
        """Global error handler with Sentry integration"""
        logger.exception('Unhandled exception', extra={
            'error_type': type(error).__name__,
            'error_message': str(error),
            'request_id': getattr(g, 'request_id', 'unknown'),
            'path': request.path,
            'method': request.method
        })
        
        # Send to Sentry
        if sentry_dsn:
            sentry_sdk.capture_exception(error)
        
        # Return error response
        from flask import jsonify
        return jsonify({
            'error': 'Internal server error',
            'request_id': getattr(g, 'request_id', 'unknown')
        }), 500


def generate_request_id():
    """Generate unique request ID for tracing"""
    import uuid
    return str(uuid.uuid4())


def track_custom_metric(metric_name, value, tags=None):
    """
    Track custom metrics
    
    Args:
        metric_name: Name of the metric
        value: Metric value
        tags: Optional tags dict
    """
    logger.info(f'metric.{metric_name}', extra={
        'metric_name': metric_name,
        'value': value,
        'tags': tags or {}
    })


def track_ai_usage(user_id, model, tokens_used, cost, endpoint):
    """Track AI API usage for cost monitoring"""
    track_custom_metric('ai.usage', tokens_used, tags={
        'user_id': user_id,
        'model': model,
        'endpoint': endpoint
    })
    
    track_custom_metric('ai.cost', cost, tags={
        'user_id': user_id,
        'model': model,
        'endpoint': endpoint
    })


def monitor_database_query(query_type, duration_ms, table=None):
    """Monitor database query performance"""
    if duration_ms > 1000:  # Slow query threshold
        logger.warning(f'Slow database query: {query_type}', extra={
            'query_type': query_type,
            'duration_ms': duration_ms,
            'table': table
        })


def monitor_cache_operation(operation, hit_or_miss, duration_ms=None):
    """Monitor cache hit/miss rates"""
    track_custom_metric(f'cache.{operation}', 1, tags={
        'result': hit_or_miss
    })


def monitor_celery_task(task_name, status, duration_ms=None):
    """Monitor Celery task execution"""
    track_custom_metric('celery.task', 1, tags={
        'task_name': task_name,
        'status': status
    })
    
    if duration_ms:
        track_custom_metric('celery.task.duration', duration_ms, tags={
            'task_name': task_name
        })


# Decorator for monitoring functions
def monitor_function(metric_name=None):
    """
    Decorator to monitor function execution time
    
    Usage:
        @monitor_function('my_function')
        def my_function():
            pass
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            name = metric_name or func.__name__
            
            try:
                result = func(*args, **kwargs)
                duration_ms = (time.time() - start_time) * 1000
                
                track_custom_metric(f'function.{name}.duration', duration_ms)
                track_custom_metric(f'function.{name}.success', 1)
                
                return result
            except Exception as e:
                duration_ms = (time.time() - start_time) * 1000
                
                track_custom_metric(f'function.{name}.duration', duration_ms)
                track_custom_metric(f'function.{name}.error', 1, tags={
                    'error_type': type(e).__name__
                })
                
                raise
        
        return wrapper
    return decorator


# Health check metrics
def get_system_metrics():
    """
    Collect system metrics for health monitoring
    
    Returns:
        dict: System metrics
    """
    import psutil
    
    try:
        metrics = {
            'cpu_percent': psutil.cpu_percent(interval=0.1),
            'memory_percent': psutil.virtual_memory().percent,
            'disk_percent': psutil.disk_usage('/').percent,
            'timestamp': time.time()
        }
        return metrics
    except Exception as e:
        logger.error(f'Failed to collect system metrics: {e}')
        return {}


# Alert thresholds (can be configured via environment variables)
ALERT_THRESHOLDS = {
    'error_rate_percent': float(os.getenv('ALERT_ERROR_RATE', '5.0')),
    'response_time_p95_ms': float(os.getenv('ALERT_RESPONSE_TIME_P95', '2000')),
    'cpu_percent': float(os.getenv('ALERT_CPU_PERCENT', '85')),
    'memory_percent': float(os.getenv('ALERT_MEMORY_PERCENT', '85')),
    'disk_percent': float(os.getenv('ALERT_DISK_PERCENT', '85')),
}


def check_alert_thresholds(metrics):
    """
    Check if metrics exceed alert thresholds
    
    Args:
        metrics: Dict of current metrics
        
    Returns:
        list: List of alerts
    """
    alerts = []
    
    for metric_name, threshold in ALERT_THRESHOLDS.items():
        if metric_name in metrics and metrics[metric_name] > threshold:
            alert = {
                'metric': metric_name,
                'current_value': metrics[metric_name],
                'threshold': threshold,
                'severity': 'critical' if metrics[metric_name] > threshold * 1.2 else 'warning'
            }
            alerts.append(alert)
            
            logger.error(f'Alert: {metric_name} = {metrics[metric_name]} exceeds threshold {threshold}')
    
    return alerts

