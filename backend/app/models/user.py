"""
User-related database models
"""

from datetime import datetime
from app import db
from werkzeug.security import generate_password_hash, check_password_hash
import uuid

class User(db.Model):
    """User model for authentication and profile management"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    full_name = db.Column(db.String(120), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    
    # Profile information
    avatar_url = db.Column(db.String(255))
    bio = db.Column(db.Text)
    location = db.Column(db.String(100))
    website = db.Column(db.String(255))
    
    # Gamification
    level = db.Column(db.Integer, default=1, index=True)  # Indexed for leaderboard and ranking queries
    total_xp = db.Column(db.Integer, default=0, index=True)  # Indexed for leaderboard queries
    current_streak_days = db.Column(db.Integer, default=0, index=True)  # Indexed for streak-based queries
    longest_streak_days = db.Column(db.Integer, default=0)
    last_check_in_date = db.Column(db.Date)  # Tracks daily check-in for streaks
    
    # Admin status
    is_admin = db.Column(db.Boolean, default=False)
    admin_type = db.Column(db.String(50))  # 'super_admin', 'content_admin', 'moderator'
    
    # Account status
    is_active = db.Column(db.Boolean, default=True)
    email_verified = db.Column(db.Boolean, default=False)
    last_login = db.Column(db.DateTime)
    
    # Preferences
    preferred_ai_model = db.Column(db.String(50), default='gpt-4')
    preferred_language = db.Column(db.String(10), default='en')
    timezone = db.Column(db.String(50), default='UTC')
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships - Phase 1 MVP only
    sessions = db.relationship('UserSession', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    progress = db.relationship('UserProgress', backref='user', uselist=False, cascade='all, delete-orphan')
    xp_transactions = db.relationship('XPTransaction', backref='user', lazy='dynamic')
    activity_logs = db.relationship('UserActivityLog', backref='user', lazy='dynamic')
    
    # Phase 2 relationships (commented out for MVP)
    # achievements = db.relationship('UserAchievement', lazy='dynamic', overlaps="user_achievements")
    # notifications = db.relationship('UserNotification', lazy='dynamic')
    # settings = db.relationship('UserSettings', uselist=False, cascade='all, delete-orphan')
    # competition_participations = db.relationship('CompetitionParticipation', back_populates='learner')
    # activities = db.relationship('LearnerActivity', back_populates='learner')
    # login_sessions = db.relationship('LoginSession', back_populates='learner')
    # subscription = db.relationship('UserSubscription', back_populates='user', uselist=False, cascade='all, delete-orphan')
    
    def set_password(self, password):
        """Hash and set password"""
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        """Check password against hash"""
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self, include_sensitive=False):
        """Convert user to dictionary"""
        data = {
            'id': self.id,
            'email': self.email,
            'username': self.username,
            'full_name': self.full_name,
            'avatar_url': self.avatar_url,
            'bio': self.bio,
            'location': self.location,
            'website': self.website,
            'level': self.level,
            'total_xp': self.total_xp,
            'current_streak_days': self.current_streak_days,
            'longest_streak_days': self.longest_streak_days,
            'is_admin': self.is_admin,
            'admin_type': self.admin_type,
            'is_active': self.is_active,
            'email_verified': self.email_verified,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        
        if include_sensitive:
            data['password_hash'] = self.password_hash
            
        return data
    
    # Phase 2 subscription methods (commented out for MVP)
    # def get_subscription(self):
    #     """Get user's subscription, create one if it doesn't exist"""
    #     if not self.subscription:
    #         from app.models.subscriptions import UserSubscription
    #         self.subscription = UserSubscription(user_id=self.id)
    #         db.session.add(self.subscription)
    #         db.session.commit()
    #     return self.subscription
    # 
    # def has_feature_access(self, feature_name):
    #     """Check if user has access to a specific feature"""
    #     subscription = self.get_subscription()
    #     return subscription.has_access_to_feature(feature_name)
    # 
    # def is_trial_user(self):
    #     """Check if user is on trial plan"""
    #     subscription = self.get_subscription()
    #     return subscription.plan_type.value == 'free_trial' and subscription.subscription_status.value == 'trial'
    # 
    # def is_subscriber(self):
    #     """Check if user is a subscriber (Habitual plan)"""
    #     subscription = self.get_subscription()
    #     return subscription.plan_type.value == 'habitual' and subscription.is_subscription_active
    # 
    # def upgrade_to_habitual(self):
    #     """Upgrade user to Habitual plan"""
    #     subscription = self.get_subscription()
    #     subscription.upgrade_to_habitual()
    #     db.session.commit()
    
    def __repr__(self):
        return f'<User {self.username}>'

class UserSession(db.Model):
    """User session management for JWT tokens"""
    __tablename__ = 'user_sessions'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    token_hash = db.Column(db.String(255), nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    ip_address = db.Column(db.String(45))
    user_agent = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def is_expired(self):
        """Check if session is expired"""
        return datetime.utcnow() > self.expires_at
    
    def to_dict(self):
        """Convert session to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'expires_at': self.expires_at.isoformat(),
            'is_active': self.is_active,
            'ip_address': self.ip_address,
            'created_at': self.created_at.isoformat()
        }
    
    def __repr__(self):
        return f'<UserSession {self.id} for User {self.user_id}>'

class UserActivityLog(db.Model):
    __table_args__ = (
        db.Index('ix_user_activity_logs_user_timestamp', 'user_id', 'timestamp'),  # Composite index for activity queries
    )
    """User activity logging for analytics and security"""
    __tablename__ = 'user_activity_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    action = db.Column(db.String(100), nullable=False, index=True)
    description = db.Column(db.Text)
    ip_address = db.Column(db.String(45))
    user_agent = db.Column(db.Text)
    extra_metadata = db.Column(db.JSON)  # Additional context data
    xp_earned = db.Column(db.Integer, default=0)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    def to_dict(self):
        """Convert activity log to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'action': self.action,
            'description': self.description,
            'ip_address': self.ip_address,
            'metadata': self.extra_metadata,
            'xp_earned': self.xp_earned,
            'timestamp': self.timestamp.isoformat()
        }
    
    def __repr__(self):
        return f'<UserActivityLog {self.action} by User {self.user_id}>'
