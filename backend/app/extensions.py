"""
Flask Extensions
Centralized extension initialization
"""

import os
from flask import g, request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_caching import Cache
import logging

logger = logging.getLogger(__name__)

def get_rate_limit_key():
    """
    Get rate limit key - prefer user ID if available, otherwise use IP address
    This allows per-user rate limiting for authenticated users
    """
    if hasattr(g, 'current_user_id') and g.current_user_id:
        return f"user:{g.current_user_id}"
    return get_remote_address()

# Rate Limiter - Use Redis when available, fallback to memory for development
redis_url = os.environ.get('REDIS_URL')
if redis_url and not redis_url.startswith('memory://'):
    try:
        # Try to use Redis for rate limiting
        limiter = Limiter(
            key_func=get_rate_limit_key,
            default_limits=["200 per day", "50 per hour"],
            storage_uri=redis_url,
            strategy="fixed-window",
            headers_enabled=True
        )
        logger.info(f"Rate limiting using Redis: {redis_url}")
    except Exception as e:
        logger.warning(f"Failed to initialize Redis rate limiter, falling back to memory: {e}")
        limiter = Limiter(
            key_func=get_rate_limit_key,
            default_limits=["200 per day", "50 per hour"],
            storage_uri="memory://",
            strategy="fixed-window",
            headers_enabled=True
        )
else:
    # Use memory storage for development
    limiter = Limiter(
        key_func=get_rate_limit_key,
        default_limits=["200 per day", "50 per hour"],
        storage_uri="memory://",
        strategy="fixed-window",
        headers_enabled=True
    )
    if not os.environ.get('REDIS_URL'):
        logger.info("Rate limiting using in-memory storage (Redis not configured)")

# Cache - Use Redis when available, fallback to simple cache for development
if redis_url and not redis_url.startswith('memory://'):
    try:
        cache = Cache(config={
            'CACHE_TYPE': 'RedisCache',
            'CACHE_REDIS_URL': redis_url,
            'CACHE_DEFAULT_TIMEOUT': 300
        })
        logger.info("Cache using Redis")
    except Exception as e:
        logger.warning(f"Failed to initialize Redis cache, falling back to simple cache: {e}")
        cache = Cache(config={
            'CACHE_TYPE': 'SimpleCache',
            'CACHE_DEFAULT_TIMEOUT': 300
        })
else:
    # Use simple cache for development
    cache = Cache(config={
        'CACHE_TYPE': 'SimpleCache',
        'CACHE_DEFAULT_TIMEOUT': 300
    })
    if not os.environ.get('REDIS_URL'):
        logger.info("Cache using simple in-memory storage (Redis not configured)")

