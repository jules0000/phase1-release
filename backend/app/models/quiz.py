"""
Quiz and assessment models
"""

from datetime import datetime
from app import db

class QuizQuestion(db.Model):

    """Quiz questions for lessons"""
    __tablename__ = 'quiz_questions'
    
    id = db.Column(db.Integer, primary_key=True)
    lesson_id = db.Column(db.Integer, db.ForeignKey('lessons.id'), nullable=False)
    
    # Question details
    question_text = db.Column(db.Text, nullable=False)
    question_type = db.Column(db.String(50), nullable=False)  # multiple_choice, true_false, drag_drop, prompt_grader
    options = db.Column(db.JSON)  # Array of options for multiple choice
    correct_answer = db.Column(db.JSON)  # Correct answer(s)
    explanation = db.Column(db.Text)  # Explanation for the answer
    
    # Metadata
    difficulty = db.Column(db.String(20), default='medium')  # easy, medium, hard
    points = db.Column(db.Integer, default=1)
    order_index = db.Column(db.Integer, default=0)
    
    # Status
    status = db.Column(db.String(20), default='active')  # active, draft, archived
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        """Convert quiz question to dictionary"""
        return {
            'id': self.id,
            'lesson_id': self.lesson_id,
            'question_text': self.question_text,
            'question_type': self.question_type,
            'options': self.options,
            'correct_answer': self.correct_answer,
            'explanation': self.explanation,
            'difficulty': self.difficulty,
            'points': self.points,
            'order_index': self.order_index,
            'status': self.status,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
    
    def __repr__(self):
        return f'<QuizQuestion {self.id} for Lesson {self.lesson_id}>'

class QuizAttempt(db.Model):

    """User quiz attempts"""
    __tablename__ = 'quiz_attempts'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    lesson_id = db.Column(db.Integer, db.ForeignKey('lessons.id'), nullable=False)
    
    # Attempt details
    attempt_number = db.Column(db.Integer, default=1)
    answers = db.Column(db.JSON)  # User's answers
    score = db.Column(db.Float, default=0.0)
    max_score = db.Column(db.Float, default=0.0)
    time_spent = db.Column(db.Integer, default=0)  # in seconds
    
    # Status
    status = db.Column(db.String(20), default='in_progress')  # in_progress, completed, abandoned
    
    # Timestamps
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    submitted_at = db.Column(db.DateTime)
    
    # Relationships
    user = db.relationship('User', backref='quiz_attempts')
    
    def to_dict(self):
        """Convert quiz attempt to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'lesson_id': self.lesson_id,
            'attempt_number': self.attempt_number,
            'answers': self.answers,
            'score': self.score,
            'max_score': self.max_score,
            'time_spent': self.time_spent,
            'status': self.status,
            'started_at': self.started_at.isoformat(),
            'submitted_at': self.submitted_at.isoformat() if self.submitted_at else None
        }
    
    def __repr__(self):
        return f'<QuizAttempt {self.id} by User {self.user_id}>'

class QuizAnswer(db.Model):

    """Individual quiz answers for detailed tracking"""
    __tablename__ = 'quiz_answers'
    
    id = db.Column(db.Integer, primary_key=True)
    quiz_attempt_id = db.Column(db.Integer, db.ForeignKey('quiz_attempts.id'), nullable=False)
    question_id = db.Column(db.Integer, db.ForeignKey('quiz_questions.id'), nullable=False)
    
    # Answer details
    user_answer = db.Column(db.JSON)  # User's answer
    is_correct = db.Column(db.Boolean, default=False)
    points_earned = db.Column(db.Float, default=0.0)
    time_spent = db.Column(db.Integer, default=0)  # in seconds
    
    # Timestamps
    answered_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    quiz_attempt = db.relationship('QuizAttempt')
    question = db.relationship('QuizQuestion', backref='answers')
    
    def to_dict(self):
        """Convert quiz answer to dictionary"""
        return {
            'id': self.id,
            'quiz_attempt_id': self.quiz_attempt_id,
            'question_id': self.question_id,
            'user_answer': self.user_answer,
            'is_correct': self.is_correct,
            'points_earned': self.points_earned,
            'time_spent': self.time_spent,
            'answered_at': self.answered_at.isoformat()
        }
    
    def __repr__(self):
        return f'<QuizAnswer {self.id} for Question {self.question_id}>'
