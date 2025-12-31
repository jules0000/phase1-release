"""
API v1 package initialization - Phase 1 MVP
"""
from flask import Blueprint

api_v1 = Blueprint('api_v1', __name__, url_prefix='/api/v1')

# Import only Phase 1 MVP API modules
from . import auth, users, modules, progress, quiz, openai, content, dashboard, lessons
