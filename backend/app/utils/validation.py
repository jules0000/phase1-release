"""
Input validation utilities
"""

import re
from app.errors import ValidationError

# Common weak passwords to reject
COMMON_PASSWORDS = {
    'password', 'password123', '123456', '12345678', 'qwerty', 'abc123',
    'monkey', '1234567', 'letmein', 'trustno1', 'dragon', 'baseball',
    'iloveyou', 'master', 'sunshine', 'ashley', 'bailey', 'passw0rd',
    'shadow', '123123', '654321', 'superman', 'qazwsx', 'michael',
    'football', 'welcome', 'jesus', 'ninja', 'mustang', 'password1'
}

def validate_password(password):
    """
    Validate password strength
    
    Requirements:
    - Minimum 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one number
    - At least one special character
    - Not in common passwords list
    
    Returns:
        tuple: (is_valid, error_message)
    """
    if not password:
        raise ValidationError('Password is required')
    
    # Check minimum length
    if len(password) < 8:
        raise ValidationError('Password must be at least 8 characters long')
    
    # Check maximum length (prevent DoS)
    if len(password) > 128:
        raise ValidationError('Password must be less than 128 characters')
    
    # Check for uppercase
    if not re.search(r'[A-Z]', password):
        raise ValidationError('Password must contain at least one uppercase letter')
    
    # Check for lowercase
    if not re.search(r'[a-z]', password):
        raise ValidationError('Password must contain at least one lowercase letter')
    
    # Check for digit
    if not re.search(r'\d', password):
        raise ValidationError('Password must contain at least one number')
    
    # Check for special character
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        raise ValidationError('Password must contain at least one special character (!@#$%^&*...)')
    
    # Check against common passwords
    if password.lower() in COMMON_PASSWORDS:
        raise ValidationError('This password is too common. Please choose a stronger password')
    
    return True

def validate_email(email):
    """
    Validate email format
    
    Returns:
        bool: True if valid
    """
    if not email:
        raise ValidationError('Email is required')
    
    # Basic email regex
    email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    
    if not re.match(email_regex, email):
        raise ValidationError('Invalid email format')
    
    # Check length
    if len(email) > 255:
        raise ValidationError('Email is too long')
    
    # Check for suspicious patterns
    if '..' in email or email.startswith('.') or email.endswith('.'):
        raise ValidationError('Invalid email format')
    
    return True

def validate_username(username):
    """
    Validate username format
    
    Requirements:
    - 3-30 characters
    - Alphanumeric and underscores only
    - Must start with letter
    """
    if not username:
        raise ValidationError('Username is required')
    
    if len(username) < 3:
        raise ValidationError('Username must be at least 3 characters')
    
    if len(username) > 30:
        raise ValidationError('Username must be less than 30 characters')
    
    if not re.match(r'^[a-zA-Z][a-zA-Z0-9_]*$', username):
        raise ValidationError('Username must start with a letter and contain only letters, numbers, and underscores')
    
    # Reserved usernames
    reserved = {'admin', 'root', 'system', 'administrator', 'moderator', 'support'}
    if username.lower() in reserved:
        raise ValidationError('This username is reserved')
    
    return True

def sanitize_input(text, max_length=1000):
    """
    Sanitize user input to prevent XSS and injection
    
    Args:
        text: Input text
        max_length: Maximum allowed length
        
    Returns:
        str: Sanitized text
    """
    if not text:
        return ''
    
    # Remove null bytes
    text = text.replace('\x00', '')
    
    # Trim to max length
    if len(text) > max_length:
        text = text[:max_length]
    
    # Strip leading/trailing whitespace
    text = text.strip()
    
    return text

def validate_file_upload(filename, file_size, allowed_extensions=None, max_size_mb=10):
    """
    Validate file upload
    
    Args:
        filename: Original filename
        file_size: File size in bytes
        allowed_extensions: List of allowed extensions
        max_size_mb: Maximum file size in MB
    """
    if not filename:
        raise ValidationError('Filename is required')
    
    # Check file size
    max_size_bytes = max_size_mb * 1024 * 1024
    if file_size > max_size_bytes:
        raise ValidationError(f'File size must be less than {max_size_mb}MB')
    
    # Check file extension
    if '.' not in filename:
        raise ValidationError('File must have an extension')
    
    extension = filename.rsplit('.', 1)[1].lower()
    
    # Default allowed extensions
    if allowed_extensions is None:
        allowed_extensions = {
            'jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx',
            'txt', 'csv', 'json', 'xml', 'md'
        }
    
    if extension not in allowed_extensions:
        raise ValidationError(f'File type .{extension} is not allowed')
    
    # Dangerous extensions
    dangerous_extensions = {
        'exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs', 'js',
        'jar', 'sh', 'php', 'py', 'rb', 'pl', 'asp', 'aspx'
    }
    
    if extension in dangerous_extensions:
        raise ValidationError('This file type is not allowed for security reasons')
    
    # Check for path traversal in filename
    if '..' in filename or '/' in filename or '\\' in filename:
        raise ValidationError('Invalid filename')
    
    return True

def is_payment_required():
    """
    Check if payment/subscription is required to access the platform
    Admins can disable this to allow free access and manual subscription management
    
    Returns:
        bool: True if payment is required, False if admin has disabled it
    """
    try:
        from app.models.settings import SystemSetting
        from app import db
        
        setting = SystemSetting.query.filter_by(key='payment_required').first()
        
        if not setting:
            # Default to True (payment required) if setting doesn't exist
            return True
        
        # Check if value is a dict with 'enabled' key
        if isinstance(setting.value, dict):
            return setting.value.get('enabled', True)
        
        # Handle boolean value directly
        return bool(setting.value)
        
    except Exception:
        # If there's any error, default to requiring payment for safety
        return True

