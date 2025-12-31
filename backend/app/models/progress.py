"""
Progress tracking and gamification models
"""

from datetime import datetime
from app import db

class UserProgress(db.Model):
    """Overall user progress tracking"""
    __tablename__ = 'user_progress'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True)
    
    # Gamification fields
    level = db.Column(db.Integer, default=1)
    xp = db.Column(db.Integer, default=0)
    learning_streak = db.Column(db.Integer, default=0)
    
    # Overall progress metrics
    overall_progress = db.Column(db.Float, default=0.0)  # Percentage
    completed_modules = db.Column(db.JSON, default=list)  # List of completed module IDs
    total_modules = db.Column(db.Integer, default=0)
    completed_lessons = db.Column(db.JSON, default=list)  # List of completed lesson IDs
    total_lessons = db.Column(db.Integer, default=0)
    average_score = db.Column(db.Float, default=0.0)
    
    # Learning statistics
    total_learning_time = db.Column(db.Integer, default=0)  # in minutes
    average_session_duration = db.Column(db.Float, default=0.0)  # in minutes
    last_activity_date = db.Column(db.Date, index=True)  # Indexed for activity queries
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        """Convert progress to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'level': self.level,
            'xp': self.xp,
            'learning_streak': self.learning_streak,
            'overall_progress': self.overall_progress,
            'completed_modules': self.completed_modules,
            'total_modules': self.total_modules,
            'completed_lessons': self.completed_lessons,
            'total_lessons': self.total_lessons,
            'average_score': self.average_score,
            'total_learning_time': self.total_learning_time,
            'average_session_duration': self.average_session_duration,
            'last_activity_date': self.last_activity_date.isoformat() if self.last_activity_date else None,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
    
    def __repr__(self):
        return f'<UserProgress for User {self.user_id}>'

class UserModuleProgress(db.Model):
    """Module-specific progress tracking"""
    __tablename__ = 'user_module_progress'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    module_id = db.Column(db.Integer, db.ForeignKey('modules.id'), nullable=False)
    
    # Progress metrics
    progress_percentage = db.Column(db.Float, default=0.0)
    completed_lessons = db.Column(db.Integer, default=0)
    total_lessons = db.Column(db.Integer, default=0)
    is_completed = db.Column(db.Boolean, default=False)
    
    # Timestamps
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_accessed = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    
    # Relationships
    module = db.relationship('Module', backref='user_progress')
    
    # Unique constraint
    __table_args__ = (db.UniqueConstraint('user_id', 'module_id', name='unique_user_module'),)
    
    def to_dict(self):
        """Convert module progress to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'module_id': self.module_id,
            'progress_percentage': self.progress_percentage,
            'completed_lessons': self.completed_lessons,
            'total_lessons': self.total_lessons,
            'is_completed': self.is_completed,
            'started_at': self.started_at.isoformat(),
            'last_accessed': self.last_accessed.isoformat(),
            'completed_at': self.completed_at.isoformat() if self.completed_at else None
        }
    
    def __repr__(self):
        return f'<UserModuleProgress User {self.user_id} Module {self.module_id}>'

class UserLessonProgress(db.Model):
    """Lesson-specific progress tracking"""
    __tablename__ = 'user_lesson_progress'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    lesson_id = db.Column(db.Integer, db.ForeignKey('lessons.id'), nullable=False)
    
    # Progress status
    status = db.Column(db.String(20), default='not_started')  # not_started, in_progress, completed
    progress_percentage = db.Column(db.Float, default=0.0)
    is_completed = db.Column(db.Boolean, default=False)
    
    # Performance metrics
    score = db.Column(db.Float)
    attempts = db.Column(db.Integer, default=0)
    time_spent = db.Column(db.Integer, default=0)  # in seconds
    xp_earned = db.Column(db.Integer, default=0)
    
    # Timestamps
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_accessed = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    
    # Relationships
    lesson = db.relationship('Lesson', backref='user_progress')
    
    # Unique constraint
    __table_args__ = (db.UniqueConstraint('user_id', 'lesson_id', name='unique_user_lesson'),)
    
    def to_dict(self):
        """Convert lesson progress to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'lesson_id': self.lesson_id,
            'status': self.status,
            'progress_percentage': self.progress_percentage,
            'is_completed': self.is_completed,
            'score': self.score,
            'attempts': self.attempts,
            'time_spent': self.time_spent,
            'xp_earned': self.xp_earned,
            'started_at': self.started_at.isoformat(),
            'last_accessed': self.last_accessed.isoformat(),
            'completed_at': self.completed_at.isoformat() if self.completed_at else None
        }
    
    def __repr__(self):
        return f'<UserLessonProgress User {self.user_id} Lesson {self.lesson_id}>'

class XPTransaction(db.Model):
    """XP transaction history for gamification"""
    __tablename__ = 'xp_transactions'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    # Transaction details
    source = db.Column(db.String(50), nullable=False)  # lesson_completion, quiz, challenge, etc.
    amount = db.Column(db.Integer, nullable=False)
    description = db.Column(db.String(255), nullable=False)
    
    # Additional context
    extra_metadata = db.Column(db.JSON)  # Additional context like lesson_id, module_id, etc.
    
    # Timestamp
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    def to_dict(self):
        """Convert XP transaction to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'source': self.source,
            'amount': self.amount,
            'description': self.description,
            'metadata': self.extra_metadata,
            'timestamp': self.timestamp.isoformat()
        }
    
    def __repr__(self):
        return f'<XPTransaction {self.amount} XP for User {self.user_id}>'
