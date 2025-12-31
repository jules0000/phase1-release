"""
WSGI entry point for production deployment
"""

import os
from app import create_app, socketio

# Create Flask application
application = create_app()

if __name__ == '__main__':
    # Run with SocketIO on port 8085
    # CRITICAL-001 Fix: Use environment variable for debug mode, default to False for production
    debug_mode = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    print("Starting Backend Server on port 8085...")
    socketio.run(application, host='0.0.0.0', port=8085, debug=debug_mode)
