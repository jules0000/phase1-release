"""
P0 Fix: JWT Token Blacklist with Redis and Database Fallback
Persistent token blacklist for revoked tokens with TTL expiration.
Uses Redis when available, falls back to database if Redis is unavailable.
"""

import os
import redis
from datetime import datetime, timedelta
from typing import Optional
from flask import current_app
from app import db
from app.models.token_blacklist import TokenBlacklist
import logging

logger = logging.getLogger(__name__)

# Try to initialize Redis client
_redis_client = None
_redis_enabled = False

try:
    redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    if redis_url and not redis_url.startswith('memory://'):
        _redis_client = redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2
        )
        # Test connection
        _redis_client.ping()
        _redis_enabled = True
        logger.info("Token blacklist using Redis")
    else:
        logger.info("Token blacklist using database (Redis not configured)")
except (redis.ConnectionError, redis.TimeoutError, Exception) as e:
    logger.warning(f"Redis not available for token blacklist, using database fallback: {e}")
    _redis_enabled = False

# Token expiration time (should match JWT token expiration)
# Default to 24 hours for access tokens (matches JWT_ACCESS_TOKEN_EXPIRES)
# For refresh tokens, we use 30 days
def _get_default_ttl(is_refresh_token: bool = False) -> int:
    """Get default TTL based on token type"""
    if is_refresh_token:
        return 30 * 24 * 3600  # 30 days in seconds
    return 24 * 3600  # 24 hours in seconds


def add_to_blacklist(jti: str, expires_in_seconds: Optional[int] = None, is_refresh_token: bool = False) -> bool:
    """
    Add a token JTI (JWT ID) to the blacklist with TTL expiration.
    
    Args:
        jti: The JWT ID (jti claim) from the token
        expires_in_seconds: TTL in seconds (defaults based on token type)
        is_refresh_token: Whether this is a refresh token (affects default TTL)
        
    Returns:
        True if successfully added, False otherwise
    """
    if not jti:
        return False
    
    # Calculate TTL: use provided value, or default based on token type
    if expires_in_seconds is not None:
        ttl = expires_in_seconds
    else:
        # Get expiration from JWT payload if available, otherwise use defaults
        ttl = _get_default_ttl(is_refresh_token)
    
    # Try Redis first
    if _redis_enabled and _redis_client:
        try:
            _redis_client.setex(f"blacklist:token:{jti}", ttl, "1")
            return True
        except Exception as e:
            logger.warning(f"Failed to add token to Redis blacklist, trying database: {e}")
            _redis_enabled = False  # Disable Redis for subsequent operations
    
    # Fallback to database
    try:
        expires_at = datetime.utcnow() + timedelta(seconds=ttl)
        
        # Check if already exists
        existing = TokenBlacklist.query.filter_by(jti=jti).first()
        if existing:
            existing.expires_at = expires_at
        else:
            blacklist_entry = TokenBlacklist(jti=jti, expires_at=expires_at)
            db.session.add(blacklist_entry)
        
        db.session.commit()
        return True
    except Exception as e:
        logger.error(f"Failed to add token to database blacklist: {e}")
        db.session.rollback()
        return False


def is_blacklisted(jti: str) -> bool:
    """
    Check if a token JTI is blacklisted.
    
    Args:
        jti: The JWT ID (jti claim) from the token
        
    Returns:
        True if token is blacklisted, False otherwise
    """
    if not jti:
        return False
    
    # Try Redis first
    if _redis_enabled and _redis_client:
        try:
            result = _redis_client.get(f"blacklist:token:{jti}")
            return result is not None
        except Exception as e:
            logger.warning(f"Failed to check Redis blacklist, trying database: {e}")
            # Don't disable Redis here - might be temporary issue
    
    # Fallback to database
    try:
        entry = TokenBlacklist.query.filter_by(jti=jti).first()
        if entry:
            # Check if expired
            if entry.is_expired():
                # Remove expired entry
                db.session.delete(entry)
                db.session.commit()
                return False
            return True
        return False
    except Exception as e:
        logger.error(f"Error checking database blacklist: {e}")
        # Fail open - don't block requests if blacklist check fails
        return False


def clear_blacklist():
    """
    Clear the blacklist (useful for testing).
    Note: In production, tokens expire automatically via TTL.
    """
    # Clear Redis
    if _redis_enabled and _redis_client:
        try:
            # Delete all blacklist keys (this is expensive, use sparingly)
            keys = _redis_client.keys("blacklist:token:*")
            if keys:
                _redis_client.delete(*keys)
        except Exception as e:
            logger.warning(f"Failed to clear Redis blacklist: {e}")
    
    # Clear database
    try:
        TokenBlacklist.query.delete()
        db.session.commit()
    except Exception as e:
        logger.error(f"Failed to clear database blacklist: {e}")
        db.session.rollback()


def cleanup_expired_tokens():
    """
    Clean up expired tokens from database (for maintenance).
    Redis tokens expire automatically via TTL.
    This should be called periodically (e.g., via cron job).
    """
    return TokenBlacklist.cleanup_expired()

