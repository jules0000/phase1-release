"""
Error handling and custom exceptions
"""

from flask import jsonify
from werkzeug.exceptions import HTTPException
import logging

logger = logging.getLogger(__name__)

class APIException(Exception):
    """Base API exception class"""
    status_code = 500
    message = 'An error occurred'
    
    def __init__(self, message=None, status_code=None, payload=None):
        super().__init__()
        if message is not None:
            self.message = message
        if status_code is not None:
            self.status_code = status_code
        self.payload = payload
    
    def to_dict(self):
        rv = dict(self.payload or ())
        rv['error'] = self.message
        rv['message'] = self.message  # Keep for backward compatibility
        rv['code'] = self.__class__.__name__.upper()
        rv['status_code'] = self.status_code
        if self.payload:
            rv['details'] = self.payload
        return rv

class ValidationError(APIException):
    """Validation error exception"""
    status_code = 400
    message = 'Validation error'

class AuthenticationError(APIException):
    """Authentication error exception"""
    status_code = 401
    message = 'Authentication failed'

class AuthorizationError(APIException):
    """Authorization error exception"""
    status_code = 403
    message = 'Access denied'

class NotFoundError(APIException):
    """Not found error exception"""
    status_code = 404
    message = 'Resource not found'

class ConflictError(APIException):
    """Conflict error exception"""
    status_code = 409
    message = 'Resource conflict'

class RateLimitError(APIException):
    """Rate limit error exception"""
    status_code = 429
    message = 'Rate limit exceeded'

class OpenAIError(APIException):
    """OpenAI API error exception"""
    status_code = 502
    message = 'AI service error'

class DatabaseError(APIException):
    """Database error exception"""
    status_code = 500
    message = 'Database error'

class ExternalServiceError(APIException):
    """External service error exception"""
    status_code = 502
    message = 'External service error'

class ConfigurationError(APIException):
    """Configuration error exception"""
    status_code = 500
    message = 'Configuration error'

def register_error_handlers(app):
    """Register error handlers for the Flask app"""
    
    @app.errorhandler(APIException)
    def handle_api_exception(error):
        """Handle custom API exceptions"""
        logger.error(f"API Exception: {error.message}", exc_info=True)
        error_dict = error.to_dict()
        # Ensure error field exists
        if 'error' not in error_dict:
            error_dict['error'] = error.message
        response = jsonify(error_dict)
        response.status_code = error.status_code
        return response
    
    @app.errorhandler(HTTPException)
    def handle_http_exception(error):
        """Handle HTTP exceptions"""
        logger.error(f"HTTP Exception: {error.code} - {error.description}")
        response = jsonify({
            'error': error.description,
            'message': error.description,  # Keep for backward compatibility
            'code': f'HTTP_{error.code}',
            'status_code': error.code,
            'details': {}
        })
        response.status_code = error.code
        return response
    
    @app.errorhandler(ValidationError)
    def handle_validation_error(error):
        """Handle validation errors"""
        logger.warning(f"Validation Error: {error.message}")
        response = jsonify({
            'error': error.message,
            'message': error.message,  # Keep for backward compatibility
            'code': 'VALIDATION_ERROR',
            'status_code': 400,
            'type': 'validation_error',
            'details': error.payload or {}
        })
        response.status_code = 400
        return response
    
    @app.errorhandler(AuthenticationError)
    def handle_authentication_error(error):
        """Handle authentication errors"""
        logger.warning(f"Authentication Error: {error.message}")
        response = jsonify({
            'error': error.message,
            'message': error.message,
            'code': 'AUTHENTICATION_ERROR',
            'status_code': 401,
            'type': 'authentication_error',
            'details': error.payload or {}
        })
        response.status_code = 401
        return response
    
    @app.errorhandler(AuthorizationError)
    def handle_authorization_error(error):
        """Handle authorization errors"""
        logger.warning(f"Authorization Error: {error.message}")
        response = jsonify({
            'error': error.message,
            'message': error.message,
            'code': 'AUTHORIZATION_ERROR',
            'status_code': 403,
            'type': 'authorization_error',
            'details': error.payload or {}
        })
        response.status_code = 403
        return response
    
    @app.errorhandler(NotFoundError)
    def handle_not_found_error(error):
        """Handle not found errors"""
        logger.warning(f"Not Found Error: {error.message}")
        response = jsonify({
            'error': error.message,
            'message': error.message,
            'code': 'NOT_FOUND_ERROR',
            'status_code': 404,
            'type': 'not_found_error',
            'details': error.payload or {}
        })
        response.status_code = 404
        return response
    
    @app.errorhandler(ConflictError)
    def handle_conflict_error(error):
        """Handle conflict errors"""
        logger.warning(f"Conflict Error: {error.message}")
        response = jsonify({
            'error': error.message,
            'message': error.message,
            'code': 'CONFLICT_ERROR',
            'status_code': 409,
            'type': 'conflict_error',
            'details': error.payload or {}
        })
        response.status_code = 409
        return response
    
    @app.errorhandler(RateLimitError)
    def handle_rate_limit_error(error):
        """Handle rate limit errors"""
        logger.warning(f"Rate Limit Error: {error.message}")
        response = jsonify({
            'error': error.message,
            'message': error.message,
            'code': 'RATE_LIMIT_ERROR',
            'status_code': 429,
            'type': 'rate_limit_error',
            'details': error.payload or {}
        })
        response.status_code = 429
        return response
    
    @app.errorhandler(OpenAIError)
    def handle_openai_error(error):
        """Handle OpenAI API errors"""
        logger.error(f"OpenAI Error: {error.message}", exc_info=True)
        response = jsonify({
            'error': error.message,
            'message': error.message,
            'code': 'OPENAI_ERROR',
            'status_code': 502,
            'type': 'openai_error',
            'details': error.payload or {}
        })
        response.status_code = 502
        return response
    
    @app.errorhandler(DatabaseError)
    def handle_database_error(error):
        """Handle database errors"""
        logger.error(f"Database Error: {error.message}", exc_info=True)
        response = jsonify({
            'error': 'Database operation failed',
            'message': 'Database operation failed',
            'code': 'DATABASE_ERROR',
            'status_code': 500,
            'type': 'database_error',
            'details': error.payload or {}
        })
        response.status_code = 500
        return response
    
    @app.errorhandler(ExternalServiceError)
    def handle_external_service_error(error):
        """Handle external service errors"""
        logger.error(f"External Service Error: {error.message}", exc_info=True)
        response = jsonify({
            'error': 'External service unavailable',
            'message': 'External service unavailable',
            'code': 'EXTERNAL_SERVICE_ERROR',
            'status_code': 502,
            'type': 'service_error',
            'details': error.payload or {}
        })
        response.status_code = 502
        return response
    
    @app.errorhandler(ConfigurationError)
    def handle_configuration_error(error):
        """Handle configuration errors"""
        logger.error(f"Configuration Error: {error.message}", exc_info=True)
        response = jsonify({
            'error': 'System configuration error',
            'message': 'System configuration error',
            'code': 'CONFIGURATION_ERROR',
            'status_code': 500,
            'type': 'configuration_error',
            'details': error.payload or {}
        })
        response.status_code = 500
        return response
    
    @app.errorhandler(Exception)
    def handle_generic_exception(error):
        """Handle generic exceptions"""
        logger.error(f"Unhandled Exception: {str(error)}", exc_info=True)
        response = jsonify({
            'error': 'An internal server error occurred',
            'message': 'An internal server error occurred',  # Keep for backward compatibility
            'code': 'INTERNAL_ERROR',
            'status_code': 500,
            'type': 'internal_error',
            'details': {}
        })
        response.status_code = 500
        return response
