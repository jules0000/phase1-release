"""
Content management models for modules, lessons, and neural content
"""

from datetime import datetime
from app import db

class Topic(db.Model):

    """Learning topics (AI 101, Text Generation, etc.)"""
    __tablename__ = 'topics'
    
    id = db.Column(db.Integer, primary_key=True)
    topic_number = db.Column(db.Integer, unique=True, nullable=False)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    icon = db.Column(db.String(100))
    color = db.Column(db.String(7))  # Hex color code
    order_index = db.Column(db.Integer, default=0)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    modules = db.relationship('Module', backref='topic', lazy='dynamic')
    
    def to_dict(self):
        """Convert topic to dictionary"""
        return {
            'id': self.id,
            'topic_number': self.topic_number,
            'title': self.title,
            'description': self.description,
            'icon': self.icon,
            'color': self.color,
            'order_index': self.order_index,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def __repr__(self):
        return f'<Topic {self.title}>'

class Module(db.Model):

    """Learning modules within topics"""
    __tablename__ = 'modules'
    
    id = db.Column(db.Integer, primary_key=True)
    topic_id = db.Column(db.Integer, db.ForeignKey('topics.id'), nullable=False)
    
    # Module details
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    module_number = db.Column(db.Integer, nullable=False)
    difficulty = db.Column(db.String(20), default='beginner')  # beginner, intermediate, advanced
    estimated_time = db.Column(db.Integer, default=30)  # in minutes
    
    # Content structure
    total_lessons = db.Column(db.Integer, default=0)
    order_index = db.Column(db.Integer, default=0)
    
    # Learning metadata
    learning_objectives = db.Column(db.JSON)  # Array of learning objectives
    prerequisites = db.Column(db.JSON)  # Array of prerequisites
    certificate_name = db.Column(db.String(255))  # Certificate name for completion
    skill_focus = db.Column(db.JSON)  # Maps skills to levels: {"clarity": 3, "specificity": 2, "context": 1, "structure": 2}
    
    # Status
    status = db.Column(db.String(20), default='active')  # active, draft, archived
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    lessons = db.relationship('Lesson', backref='module', lazy='dynamic', cascade='all, delete-orphan')
    
    # Unique constraint
    __table_args__ = (db.UniqueConstraint('topic_id', 'module_number', name='unique_topic_module'),)
    
    def to_dict(self):
        """Convert module to dictionary"""
        return {
            'id': self.id,
            'topic_id': self.topic_id,
            'title': self.title,
            'description': self.description,
            'module_number': self.module_number,
            'difficulty': self.difficulty,
            'estimated_time': self.estimated_time,
            'total_lessons': self.total_lessons,
            'order_index': self.order_index,
            'learning_objectives': self.learning_objectives,
            'prerequisites': self.prerequisites,
            'certificate_name': self.certificate_name,
            'skill_focus': self.skill_focus,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def __repr__(self):
        return f'<Module {self.title}>'

class Lesson(db.Model):

    """Individual lessons within modules"""
    __tablename__ = 'lessons'
    
    id = db.Column(db.Integer, primary_key=True)
    module_id = db.Column(db.Integer, db.ForeignKey('modules.id'), nullable=False)
    
    # Lesson details
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    lesson_number = db.Column(db.Integer, nullable=False)
    lesson_type = db.Column(db.String(50), nullable=False)  # learn, practice, drag_drop, prompt_grader
    content_data = db.Column(db.JSON)  # Lesson content in JSON format
    
    # Metadata
    estimated_time = db.Column(db.Integer, default=10)  # in minutes
    xp_reward = db.Column(db.Integer, default=10)
    order_index = db.Column(db.Integer, default=0)
    skill_focus = db.Column(db.JSON)  # Maps skills to levels: {"clarity": 3, "specificity": 2, "context": 1, "structure": 2}
    
    # Status
    status = db.Column(db.String(20), default='active')  # active, draft, archived
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    quiz_questions = db.relationship('QuizQuestion', backref='lesson', lazy='dynamic', cascade='all, delete-orphan')
    quiz_attempts = db.relationship('QuizAttempt', backref='lesson', lazy='dynamic')
    
    # Unique constraint
    __table_args__ = (db.UniqueConstraint('module_id', 'lesson_number', name='unique_module_lesson'),)
    
    def to_dict(self):
        """Convert lesson to dictionary"""
        return {
            'id': self.id,
            'module_id': self.module_id,
            'title': self.title,
            'description': self.description,
            'lesson_number': self.lesson_number,
            'lesson_type': self.lesson_type,
            'content_data': self.content_data,
            'estimated_time': self.estimated_time,
            'xp_reward': self.xp_reward,
            'order_index': self.order_index,
            'skill_focus': self.skill_focus,
            'status': self.status,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
    
    def __repr__(self):
        return f'<Lesson {self.title}>'

class NeuralContent(db.Model):

    """Neural content from JSON files"""
    __tablename__ = 'neural_content'
    
    id = db.Column(db.Integer, primary_key=True)
    topic_id = db.Column(db.Integer, nullable=False)
    module_number = db.Column(db.Integer, nullable=False)
    lesson_number = db.Column(db.Integer, nullable=False)
    lesson_type = db.Column(db.String(50), nullable=False)
    content_data = db.Column(db.JSON, nullable=False)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Unique constraint
    __table_args__ = (db.UniqueConstraint('topic_id', 'module_number', 'lesson_number', name='unique_neural_content'),)
    
    def to_dict(self):
        """Convert neural content to dictionary"""
        return {
            'id': self.id,
            'topic_id': self.topic_id,
            'module_number': self.module_number,
            'lesson_number': self.lesson_number,
            'lesson_type': self.lesson_type,
            'content_data': self.content_data,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
    
    def __repr__(self):
        return f'<NeuralContent Topic {self.topic_id} Module {self.module_number} Lesson {self.lesson_number}>'

class ContentUpload(db.Model):

    """User-uploaded content files"""
    __tablename__ = 'content_uploads'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    # File details
    filename = db.Column(db.String(255), nullable=False)
    original_filename = db.Column(db.String(255), nullable=False)
    file_path = db.Column(db.String(500), nullable=False)
    file_size = db.Column(db.Integer, nullable=False)  # in bytes
    file_type = db.Column(db.String(100), nullable=False)  # MIME type
    file_extension = db.Column(db.String(10), nullable=False)
    
    # Metadata
    title = db.Column(db.String(255))
    description = db.Column(db.Text)
    tags = db.Column(db.JSON)  # Array of tags
    
    # Status
    status = db.Column(db.String(20), default='uploaded')  # uploaded, processed, error
    is_public = db.Column(db.Boolean, default=False)
    
    # Timestamps
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    processed_at = db.Column(db.DateTime)
    
    # Relationships
    user = db.relationship('User', backref='uploads')
    
    def to_dict(self):
        """Convert content upload to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'filename': self.filename,
            'original_filename': self.original_filename,
            'file_path': self.file_path,
            'file_size': self.file_size,
            'file_type': self.file_type,
            'file_extension': self.file_extension,
            'title': self.title,
            'description': self.description,
            'tags': self.tags,
            'status': self.status,
            'is_public': self.is_public,
            'uploaded_at': self.uploaded_at.isoformat(),
            'processed_at': self.processed_at.isoformat() if self.processed_at else None
        }
    
    def __repr__(self):
        return f'<ContentUpload {self.original_filename} by User {self.user_id}>'

class MediaFile(db.Model):

    """Media files uploaded by users"""
    __tablename__ = 'media_files'
    
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    original_filename = db.Column(db.String(255), nullable=False)
    file_type = db.Column(db.String(50), nullable=False)  # image, video, audio, document, archive
    file_size = db.Column(db.BigInteger, nullable=False)
    file_hash = db.Column(db.String(64), nullable=False, unique=True)  # SHA-256 hash
    mime_type = db.Column(db.String(100), nullable=False)
    file_path = db.Column(db.String(500), nullable=False)
    uploaded_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    extra_metadata = db.Column(db.JSON)  # Additional file metadata (dimensions, duration, etc.)
    is_public = db.Column(db.Boolean, default=False)
    download_count = db.Column(db.Integer, default=0)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    uploader = db.relationship('User', backref=db.backref('uploaded_files', lazy=True))
    
    def to_dict(self):
        return {
            'id': self.id,
            'filename': self.filename,
            'original_filename': self.original_filename,
            'file_type': self.file_type,
            'file_size': self.file_size,
            'file_hash': self.file_hash,
            'mime_type': self.mime_type,
            'uploaded_by': self.uploaded_by,
            'metadata': self.extra_metadata,
            'is_public': self.is_public,
            'download_count': self.download_count,
            'uploaded_at': self.uploaded_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
    
    def increment_download_count(self):
        """Increment download count"""
        self.download_count += 1
        db.session.commit()
