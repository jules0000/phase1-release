"""
Security Headers Middleware
Adds comprehensive security headers to all responses
"""

from flask import request, g


def add_security_headers(response):
    """Add security headers to all responses"""
    
    # Content Security Policy
    # HIGH-002 Fix: Removed 'unsafe-inline' and 'unsafe-eval' for better XSS protection
    # Note: If inline scripts/styles are needed, implement CSP nonces instead
    csp_policy = (
        "default-src 'self'; "
        "script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; "
        "style-src 'self' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: https: blob:; "
        "connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.groq.com wss: ws:; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self';"
    )
    response.headers['Content-Security-Policy'] = csp_policy
    
    # HTTP Strict Transport Security (HSTS)
    # Only in production with HTTPS
    if request.is_secure:
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
    
    # Prevent MIME type sniffing
    response.headers['X-Content-Type-Options'] = 'nosniff'
    
    # Prevent clickjacking
    response.headers['X-Frame-Options'] = 'DENY'
    
    # XSS Protection (legacy but still useful)
    response.headers['X-XSS-Protection'] = '1; mode=block'
    
    # Referrer Policy
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    
    # Permissions Policy (formerly Feature Policy)
    permissions_policy = (
        "geolocation=(), "
        "microphone=(), "
        "camera=(), "
        "payment=(), "
        "usb=()"
    )
    response.headers['Permissions-Policy'] = permissions_policy
    
    # Remove server information
    response.headers.pop('Server', None)
    response.headers.pop('X-Powered-By', None)
    
    return response


def init_security_headers(app):
    """Initialize security headers middleware"""
    app.after_request(add_security_headers)
    app.logger.info("Security headers middleware initialized")
