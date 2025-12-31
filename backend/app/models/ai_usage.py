"""
AI usage tracking and prompt grading models
"""

from datetime import datetime
from app import db

class AIUsageLog(db.Model):
    """AI API usage logging"""
    __tablename__ = 'ai_usage_logs'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    model_id = db.Column(db.Integer, db.ForeignKey('ai_models.id'), nullable=True)  # Link to AIModel
    
    # API details
    endpoint = db.Column(db.String(100), nullable=False, index=True)
    model = db.Column(db.String(100), nullable=False)
    model_name = db.Column(db.String(100), nullable=False)  # For compatibility with admin endpoints
    request_tokens = db.Column(db.Integer, default=0)
    response_tokens = db.Column(db.Integer, default=0)
    total_tokens = db.Column(db.Integer, default=0)
    tokens_used = db.Column(db.Integer, default=0)  # Alias for total_tokens
    
    # Cost tracking
    cost = db.Column(db.Float, default=0.0)
    cost_per_token = db.Column(db.Float, default=0.0)
    
    # Request/Response data
    request_data = db.Column(db.JSON)  # Request parameters
    response_data = db.Column(db.JSON)  # Response data
    extra_metadata = db.Column(db.JSON)  # Additional context
    
    # Timestamp
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    user = db.relationship('User', backref='ai_usage_logs')
    
    def to_dict(self):
        """Convert AI usage log to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'endpoint': self.endpoint,
            'model': self.model,
            'model_name': self.model_name,
            'request_tokens': self.request_tokens,
            'response_tokens': self.response_tokens,
            'total_tokens': self.total_tokens,
            'tokens_used': self.tokens_used or self.total_tokens,
            'cost': self.cost,
            'cost_per_token': self.cost_per_token,
            'request_data': self.request_data,
            'response_data': self.response_data,
            'metadata': self.extra_metadata,
            'timestamp': self.timestamp.isoformat()
        }
    
    def __repr__(self):
        return f'<AIUsageLog {self.endpoint} by User {self.user_id}>'

class PromptGradingResult(db.Model):

    """AI prompt grading results"""
    __tablename__ = 'prompt_grading_results'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    # Grading details
    prompt = db.Column(db.Text, nullable=False)
    score = db.Column(db.Float, nullable=False)
    max_score = db.Column(db.Float, default=100.0)
    
    # Feedback
    feedback = db.Column(db.Text)
    suggestions = db.Column(db.JSON)  # Array of suggestions
    breakdown = db.Column(db.JSON)  # Detailed scoring breakdown
    
    # Criteria used
    criteria_used = db.Column(db.JSON)  # Array of criteria
    rubric_used = db.Column(db.String(100))  # Rubric identifier
    
    # AI model info
    model_used = db.Column(db.String(100))
    ai_usage_log_id = db.Column(db.Integer, db.ForeignKey('ai_usage_logs.id'))
    
    # Timestamp
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    user = db.relationship('User', backref='prompt_grading_results')
    ai_usage_log = db.relationship('AIUsageLog', backref='prompt_grading_results')
    
    def to_dict(self):
        """Convert prompt grading result to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'prompt': self.prompt,
            'score': self.score,
            'max_score': self.max_score,
            'feedback': self.feedback,
            'suggestions': self.suggestions,
            'breakdown': self.breakdown,
            'criteria_used': self.criteria_used,
            'rubric_used': self.rubric_used,
            'model_used': self.model_used,
            'ai_usage_log_id': self.ai_usage_log_id,
            'timestamp': self.timestamp.isoformat()
        }
    
    def __repr__(self):
        return f'<PromptGradingResult {self.score}/{self.max_score} for User {self.user_id}>'

# Note: AIModel is imported from app.models.ai_models at the top of this file
# to avoid duplicate table definitions
