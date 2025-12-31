"""
Standardized API Response Utilities
Provides consistent response formats across all API endpoints
"""

from flask import jsonify
from datetime import datetime
from typing import Any, Dict, List, Optional, Union
import logging

logger = logging.getLogger(__name__)

class APIResponse:
    """Standardized API response builder"""
    
    @staticmethod
    def success(
        data: Any = None,
        message: str = "Success",
        status_code: int = 200,
        meta: Optional[Dict] = None
    ):
        """
        Create a successful API response
        
        Args:
            data: Response data (can be dict, list, or any serializable type)
            message: Success message
            status_code: HTTP status code
            meta: Additional metadata (pagination, etc.)
        
        Returns:
            Flask response tuple (response, status_code)
        """
        response = {
            'success': True,
            'message': message,
            'data': data,
            'timestamp': datetime.utcnow().isoformat(),
            'status_code': status_code
        }
        
        if meta:
            response['meta'] = meta
        
        return jsonify(response), status_code
    
    @staticmethod
    def error(
        message: str = "An error occurred",
        status_code: int = 400,
        error_code: Optional[str] = None,
        details: Optional[Dict] = None,
        data: Any = None
    ):
        """
        Create an error API response
        
        Args:
            message: Error message
            status_code: HTTP status code
            error_code: Application-specific error code
            details: Additional error details
            data: Any relevant data to include
        
        Returns:
            Flask response tuple (response, status_code)
        """
        response = {
            'success': False,
            'message': message,
            'timestamp': datetime.utcnow().isoformat(),
            'status_code': status_code
        }
        
        if error_code:
            response['error_code'] = error_code
        
        if details:
            response['details'] = details
        
        if data is not None:
            response['data'] = data
        
        # Log error for debugging
        logger.error(f"API Error {status_code}: {message}", extra={
            'error_code': error_code,
            'details': details
        })
        
        return jsonify(response), status_code
    
    @staticmethod
    def paginated(
        data: List[Any],
        page: int,
        per_page: int,
        total: int,
        message: str = "Success",
        additional_data: Optional[Dict] = None
    ):
        """
        Create a paginated API response
        
        Args:
            data: List of items for current page
            page: Current page number
            per_page: Items per page
            total: Total number of items
            message: Success message
            additional_data: Additional data to include
        
        Returns:
            Flask response tuple (response, status_code)
        """
        total_pages = (total + per_page - 1) // per_page
        has_next = page < total_pages
        has_prev = page > 1
        
        pagination = {
            'page': page,
            'per_page': per_page,
            'total': total,
            'total_pages': total_pages,
            'has_next': has_next,
            'has_prev': has_prev,
            'next_page': page + 1 if has_next else None,
            'prev_page': page - 1 if has_prev else None
        }
        
        response_data = {
            'items': data,
            'pagination': pagination
        }
        
        if additional_data:
            response_data.update(additional_data)
        
        return APIResponse.success(
            data=response_data,
            message=message,
            meta={'pagination': pagination}
        )

class ErrorCodes:
    """Standard error codes for the application"""
    
    # Authentication & Authorization
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    TOKEN_INVALID = "TOKEN_INVALID"
    INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS"
    ACCOUNT_DISABLED = "ACCOUNT_DISABLED"
    
    # Validation
    VALIDATION_ERROR = "VALIDATION_ERROR"
    MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD"
    INVALID_FORMAT = "INVALID_FORMAT"
    DUPLICATE_ENTRY = "DUPLICATE_ENTRY"
    
    # Resources
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    RESOURCE_CONFLICT = "RESOURCE_CONFLICT"
    RESOURCE_LOCKED = "RESOURCE_LOCKED"
    
    # Rate Limiting
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    QUOTA_EXCEEDED = "QUOTA_EXCEEDED"
    
    # System
    INTERNAL_ERROR = "INTERNAL_ERROR"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    MAINTENANCE_MODE = "MAINTENANCE_MODE"
    
    # AI Services
    AI_SERVICE_ERROR = "AI_SERVICE_ERROR"
    AI_QUOTA_EXCEEDED = "AI_QUOTA_EXCEEDED"
    AI_MODEL_UNAVAILABLE = "AI_MODEL_UNAVAILABLE"

def handle_validation_error(error):
    """Handle validation errors consistently"""
    if hasattr(error, 'messages'):
        # Marshmallow validation error
        return APIResponse.error(
            message="Validation failed",
            status_code=400,
            error_code=ErrorCodes.VALIDATION_ERROR,
            details={'validation_errors': error.messages}
        )
    else:
        # Generic validation error
        return APIResponse.error(
            message=str(error),
            status_code=400,
            error_code=ErrorCodes.VALIDATION_ERROR
        )

def handle_not_found_error(error):
    """Handle not found errors consistently"""
    return APIResponse.error(
        message=str(error) if str(error) else "Resource not found",
        status_code=404,
        error_code=ErrorCodes.RESOURCE_NOT_FOUND
    )

def handle_authentication_error(error):
    """Handle authentication errors consistently"""
    return APIResponse.error(
        message=str(error) if str(error) else "Authentication required",
        status_code=401,
        error_code=ErrorCodes.INVALID_CREDENTIALS
    )

def handle_authorization_error(error):
    """Handle authorization errors consistently"""
    return APIResponse.error(
        message=str(error) if str(error) else "Insufficient permissions",
        status_code=403,
        error_code=ErrorCodes.INSUFFICIENT_PERMISSIONS
    )

def handle_rate_limit_error(error):
    """Handle rate limiting errors consistently"""
    return APIResponse.error(
        message="Rate limit exceeded. Please try again later.",
        status_code=429,
        error_code=ErrorCodes.RATE_LIMIT_EXCEEDED,
        details={'retry_after': getattr(error, 'retry_after', 60)}
    )

def handle_internal_error(error):
    """Handle internal server errors consistently"""
    # Log the full error for debugging
    logger.exception("Internal server error", exc_info=error)
    
    return APIResponse.error(
        message="An internal server error occurred",
        status_code=500,
        error_code=ErrorCodes.INTERNAL_ERROR
    )

# Convenience functions for common responses
def success(data=None, message="Success", **kwargs):
    """Shorthand for successful response"""
    return APIResponse.success(data=data, message=message, **kwargs)

def error(message="An error occurred", status_code=400, **kwargs):
    """Shorthand for error response"""
    return APIResponse.error(message=message, status_code=status_code, **kwargs)

def not_found(message="Resource not found"):
    """Shorthand for 404 response"""
    return APIResponse.error(
        message=message,
        status_code=404,
        error_code=ErrorCodes.RESOURCE_NOT_FOUND
    )

def unauthorized(message="Authentication required"):
    """Shorthand for 401 response"""
    return APIResponse.error(
        message=message,
        status_code=401,
        error_code=ErrorCodes.INVALID_CREDENTIALS
    )

def forbidden(message="Insufficient permissions"):
    """Shorthand for 403 response"""
    return APIResponse.error(
        message=message,
        status_code=403,
        error_code=ErrorCodes.INSUFFICIENT_PERMISSIONS
    )

def validation_error(message="Validation failed", details=None):
    """Shorthand for validation error response"""
    return APIResponse.error(
        message=message,
        status_code=400,
        error_code=ErrorCodes.VALIDATION_ERROR,
        details=details
    )

def paginated(data, page, per_page, total, **kwargs):
    """Shorthand for paginated response"""
    return APIResponse.paginated(
        data=data,
        page=page,
        per_page=per_page,
        total=total,
        **kwargs
    )

def wrap_response(data: Any, message: str = "Success", status_code: int = 200):
    """
    Helper function to wrap existing responses in standardized format.
    Useful for gradually migrating endpoints to use standardized responses.
    
    Args:
        data: The data to wrap
        message: Optional success message
        status_code: HTTP status code
    
    Returns:
        Flask response tuple (response, status_code)
    """
    return APIResponse.success(data=data, message=message, status_code=status_code)