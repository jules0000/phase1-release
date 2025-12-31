"""
Email Service for Neural AI Learning Platform
Handles all email communications with users
"""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
import logging
import time
import threading
from queue import Queue
from jinja2 import Template, Environment, FileSystemLoader, select_autoescape
from pathlib import Path

logger = logging.getLogger(__name__)

# P2 Fix: Email queue for async sending
_email_queue = Queue()
_email_queue_thread = None
_email_queue_running = False

class EmailService:
    """Email service for sending notifications and updates"""
    
    def __init__(self):
        # Try to load Gmail credentials from database first
        try:
            from app.services.credential_service import credential_service
            gmail_creds = credential_service.get_email_credentials('Gmail')
            
            if gmail_creds and gmail_creds.get('email') and gmail_creds.get('password'):
                self.smtp_user = gmail_creds['email']
                self.smtp_password = gmail_creds['password']
                self.from_email = gmail_creds['email']
            else:
                # Fallback to environment variables if not in database
                self.smtp_user = os.getenv('SMTP_USER', '')
                self.smtp_password = os.getenv('SMTP_PASSWORD', '')
                self.from_email = os.getenv('FROM_EMAIL', 'noreply@neuralai.com')
        except Exception as e:
            logger.warning(f"Could not load email credentials from database: {e}, using environment variables")
            # Fallback to environment variables
            self.smtp_user = os.getenv('SMTP_USER', '')
            self.smtp_password = os.getenv('SMTP_PASSWORD', '')
            self.from_email = os.getenv('FROM_EMAIL', 'noreply@neuralai.com')
        
        self.smtp_host = os.getenv('SMTP_HOST', 'smtp.gmail.com')
        self.smtp_port = int(os.getenv('SMTP_PORT', '587'))
        self.from_name = os.getenv('FROM_NAME', 'Neural AI Learning Platform')
        self.use_tls = os.getenv('SMTP_USE_TLS', 'true').lower() == 'true'
        self.max_retries = int(os.getenv('EMAIL_MAX_RETRIES', '3'))
        self.retry_delay_base = int(os.getenv('EMAIL_RETRY_DELAY_BASE', '2'))  # Base seconds for exponential backoff
        
        # P2 Fix: Initialize template environment
        template_dir = Path(__file__).parent.parent / 'templates' / 'email'
        if template_dir.exists():
            self.template_env = Environment(
                loader=FileSystemLoader(str(template_dir)),
                autoescape=select_autoescape(['html', 'xml'])
            )
        else:
            self.template_env = None
            logger.warning("Email template directory not found, using inline templates")
        
    def _get_smtp_connection(self):
        """Create SMTP connection"""
        try:
            if self.use_tls:
                server = smtplib.SMTP(self.smtp_host, self.smtp_port)
                server.starttls()
            else:
                server = smtplib.SMTP_SSL(self.smtp_host, self.smtp_port)
            
            if self.smtp_user and self.smtp_password:
                server.login(self.smtp_user, self.smtp_password)
            
            return server
        except Exception as e:
            logger.error(f"Failed to connect to SMTP server: {e}")
            raise
    
    def send_email(
        self,
        to_email: str,
        subject: str,
        html_body: Optional[str] = None,
        text_body: Optional[str] = None,
        body_html: Optional[str] = None,  # Backward compatibility
        body_text: Optional[str] = None,  # Backward compatibility
        attachments: Optional[List[Dict[str, Any]]] = None
    ) -> bool:
        """
        Send an email (synchronously)
        
        Args:
            to_email: Recipient email address
            subject: Email subject
            html_body: HTML body content (preferred)
            text_body: Plain text body (preferred)
            body_html: HTML body content (backward compatibility)
            body_text: Plain text body (backward compatibility)
            attachments: List of attachments with 'filename' and 'content'
            
        Returns:
            bool: True if sent successfully
        """
        # Support both naming conventions
        html_body = html_body or body_html
        text_body = text_body or body_text
        """
        Send an email
        
        Args:
            to_email: Recipient email address
            subject: Email subject
            body_html: HTML body content
            body_text: Plain text body (optional)
            attachments: List of attachments with 'filename' and 'content'
            
        Returns:
            bool: True if sent successfully
        """
        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email
            msg['Subject'] = subject
            msg['Date'] = datetime.utcnow().strftime('%a, %d %b %Y %H:%M:%S +0000')
            
            # Add text version
            if text_body:
                msg.attach(MIMEText(text_body, 'plain'))
            
            # Add HTML version
            if html_body:
                msg.attach(MIMEText(html_body, 'html'))
            
            # Add attachments if any
            if attachments:
                for attachment in attachments:
                    part = MIMEBase('application', 'octet-stream')
                    part.set_payload(attachment['content'])
                    encoders.encode_base64(part)
                    part.add_header(
                        'Content-Disposition',
                        f"attachment; filename= {attachment['filename']}"
                    )
                    msg.attach(part)
            
            # P2 Fix: Send email with retry mechanism
            return self._send_email_with_retry(to_email, msg)
            
        except Exception as e:
            logger.error(f"Failed to prepare email to {to_email}: {e}", exc_info=True)
            return False
    
    def _send_email_with_retry(self, to_email: str, msg: MIMEMultipart, retry_count: int = 0) -> bool:
        """Send email with exponential backoff retry mechanism"""
        try:
            server = self._get_smtp_connection()
            server.send_message(msg)
            server.quit()
            
            logger.info(f"Email sent successfully to {to_email}")
            return True
            
        except Exception as e:
            if retry_count < self.max_retries:
                # Exponential backoff: wait 2^retry_count * base_delay seconds
                delay = self.retry_delay_base * (2 ** retry_count)
                logger.warning(f"Failed to send email to {to_email} (attempt {retry_count + 1}/{self.max_retries}), retrying in {delay}s: {e}")
                time.sleep(delay)
                return self._send_email_with_retry(to_email, msg, retry_count + 1)
            else:
                logger.error(f"Failed to send email to {to_email} after {self.max_retries} attempts: {e}", exc_info=True)
                return False
    
    def send_email_async(
        self,
        to_email: str,
        subject: str,
        body_html: str,
        body_text: Optional[str] = None,
        attachments: Optional[List[Dict[str, Any]]] = None
    ) -> bool:
        """
        Queue email for asynchronous sending
        
        Args:
            to_email: Recipient email address
            subject: Email subject
            body_html: HTML body content
            body_text: Plain text body (optional)
            attachments: List of attachments
            
        Returns:
            bool: True if queued successfully
        """
        try:
            # Prepare message (same as send_email)
            msg = MIMEMultipart('alternative')
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email
            msg['Subject'] = subject
            msg['Date'] = datetime.utcnow().strftime('%a, %d %b %Y %H:%M:%S +0000')
            
            if body_text:
                msg.attach(MIMEText(body_text, 'plain'))
            msg.attach(MIMEText(body_html, 'html'))
            
            if attachments:
                for attachment in attachments:
                    part = MIMEBase('application', 'octet-stream')
                    part.set_payload(attachment['content'])
                    encoders.encode_base64(part)
                    part.add_header(
                        'Content-Disposition',
                        f"attachment; filename= {attachment['filename']}"
                    )
                    msg.attach(part)
            
            # Queue for async sending
            _email_queue.put({
                'to_email': to_email,
                'msg': msg,
                'timestamp': datetime.utcnow()
            })
            
            logger.info(f"Email queued for async sending to {to_email}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to queue email to {to_email}: {e}", exc_info=True)
            return False
    
    def render_template(self, template_name: str, context: Dict[str, Any]) -> str:
        """
        Render email template using Jinja2
        
        Args:
            template_name: Name of template file
            context: Template context variables
            
        Returns:
            str: Rendered HTML
        """
        if not self.template_env:
            raise ValueError("Template environment not initialized")
        
        try:
            template = self.template_env.get_template(template_name)
            return template.render(**context)
        except Exception as e:
            logger.error(f"Failed to render template {template_name}: {e}", exc_info=True)
            raise
    
    def send_welcome_email(self, user_email: str, user_name: str) -> bool:
        """Send welcome email to new user"""
        subject = "Welcome to Neural AI Learning Platform!"
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                .button {{ display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
                .footer {{ text-align: center; margin-top: 30px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1> Welcome to Neural AI!</h1>
                </div>
                <div class="content">
                    <h2>Hi {user_name}!</h2>
                    <p>Thank you for joining Neural AI Learning Platform. We're excited to help you master AI prompting!</p>
                    
                    <h3> Get Started:</h3>
                    <ul>
                        <li>Complete your first lesson to earn XP</li>
                        <li>Explore our interactive skill tree</li>
                        <li>Try our AI-powered tools</li>
                        <li>Join daily challenges</li>
                    </ul>
                    
                    <a href="https://neuralai.com/dashboard" class="button">Start Learning</a>
                    
                    <p>If you have any questions, feel free to reach out to our support team.</p>
                    
                    <p>Happy learning!<br>The Neural AI Team</p>
                </div>
                <div class="footer">
                    <p>© 2025 Neural AI Learning Platform. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_body = f"""
        Welcome to Neural AI Learning Platform!
        
        Hi {user_name}!
        
        Thank you for joining Neural AI Learning Platform. We're excited to help you master AI prompting!
        
        Get Started:
        - Complete your first lesson to earn XP
        - Explore our interactive skill tree
        - Try our AI-powered tools
        - Join daily challenges
        
        Visit: https://neuralai.com/dashboard
        
        Happy learning!
        The Neural AI Team
        """
        
        return self.send_email(user_email, subject, html_body, text_body)
    
    def send_password_reset_email(self, user_email: str, user_name: str, reset_token: str) -> bool:
        """Send password reset email"""
        reset_url = f"https://neuralai.com/reset-password?token={reset_token}"
        subject = "Reset Your Password - Neural AI"
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #667eea; color: white; padding: 20px; text-align: center; }}
                .content {{ background: #f9f9f9; padding: 30px; }}
                .button {{ display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; }}
                .warning {{ background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>🔒 Password Reset Request</h2>
                </div>
                <div class="content">
                    <p>Hi {user_name},</p>
                    <p>We received a request to reset your password. Click the button below to create a new password:</p>
                    
                    <a href="{reset_url}" class="button">Reset Password</a>
                    
                    <div class="warning">
                        <strong>⚠️ Security Notice:</strong>
                        <p>This link will expire in 1 hour. If you didn't request this reset, please ignore this email.</p>
                    </div>
                    
                    <p>Or copy and paste this link:<br>{reset_url}</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(user_email, subject, html_body)
    
    def send_achievement_email(self, user_email: str, user_name: str, achievement_name: str) -> bool:
        """Send achievement unlock notification"""
        subject = f"🏆 Achievement Unlocked: {achievement_name}!"
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; }}
                .content {{ background: #f9f9f9; padding: 30px; }}
                .achievement {{ background: white; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }}
                .button {{ display: inline-block; padding: 12px 30px; background: #f5576c; color: white; text-decoration: none; border-radius: 5px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1> Congratulations!</h1>
                </div>
                <div class="content">
                    <p>Hi {user_name},</p>
                    <div class="achievement">
                        <h2>🏆 {achievement_name}</h2>
                        <p>You've unlocked a new achievement!</p>
                    </div>
                    <p>Keep up the great work! Continue your learning journey to unlock more achievements.</p>
                    <a href="https://neuralai.com/profile" class="button">View All Achievements</a>
                </div>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(user_email, subject, html_body)
    
    def send_weekly_progress_email(self, user_email: str, user_name: str, stats: Dict[str, Any]) -> bool:
        """Send weekly progress report"""
        subject = " Your Weekly Progress Report"
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #667eea; color: white; padding: 20px; text-align: center; }}
                .content {{ background: #f9f9f9; padding: 30px; }}
                .stat {{ background: white; padding: 15px; margin: 10px 0; border-radius: 5px; display: flex; justify-content: space-between; }}
                .stat-value {{ font-size: 24px; font-weight: bold; color: #667eea; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2> Your Weekly Progress</h2>
                </div>
                <div class="content">
                    <p>Hi {user_name},</p>
                    <p>Here's your learning progress for this week:</p>
                    
                    <div class="stat">
                        <span>XP Earned:</span>
                        <span class="stat-value">{stats.get('xp_earned', 0)}</span>
                    </div>
                    <div class="stat">
                        <span>Lessons Completed:</span>
                        <span class="stat-value">{stats.get('lessons_completed', 0)}</span>
                    </div>
                    <div class="stat">
                        <span>Current Streak:</span>
                        <span class="stat-value">{stats.get('streak', 0)} days</span>
                    </div>
                    <div class="stat">
                        <span>Achievements Unlocked:</span>
                        <span class="stat-value">{stats.get('achievements', 0)}</span>
                    </div>
                    
                    <p>Keep up the momentum! </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(user_email, subject, html_body)
    
    def send_lesson_reminder_email(self, user_email: str, user_name: str) -> bool:
        """Send lesson reminder"""
        subject = "⏰ Time to Continue Your Learning Journey!"
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #667eea; color: white; padding: 20px; text-align: center; }}
                .content {{ background: #f9f9f9; padding: 30px; }}
                .button {{ display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>⏰ Don't Break Your Streak!</h2>
                </div>
                <div class="content">
                    <p>Hi {user_name},</p>
                    <p>We noticed you haven't completed a lesson today. Keep your learning streak alive!</p>
                    <p>Even 10 minutes of practice can make a difference. 💪</p>
                    <a href="https://neuralai.com/learn" class="button">Continue Learning</a>
                </div>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(user_email, subject, html_body)
    
    def send_certificate_email(self, user_email: str, user_name: str, certificate_name: str, certificate_pdf: bytes) -> bool:
        """Send certificate with PDF attachment"""
        subject = f"🎓 Your Certificate: {certificate_name}"
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }}
                .content {{ background: #f9f9f9; padding: 30px; }}
                .certificate {{ background: white; padding: 20px; border: 3px solid #667eea; border-radius: 10px; text-align: center; margin: 20px 0; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎓 Congratulations!</h1>
                </div>
                <div class="content">
                    <p>Hi {user_name},</p>
                    <div class="certificate">
                        <h2>{certificate_name}</h2>
                        <p>You've successfully completed this course!</p>
                    </div>
                    <p>Your certificate is attached to this email. You can also download it anytime from your profile.</p>
                    <p>Share your achievement with your network! </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        attachments = [{
            'filename': f'{certificate_name.replace(" ", "_")}.pdf',
            'content': certificate_pdf
        }]
        
        return self.send_email(user_email, subject, html_body, attachments=attachments)


# Singleton instance
_email_service = None

def get_email_service() -> EmailService:
    """Get email service singleton"""
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
        _start_email_queue_worker()
    return _email_service


def _start_email_queue_worker():
    """Start background thread for processing email queue"""
    global _email_queue_thread, _email_queue_running
    
    if _email_queue_thread is None or not _email_queue_thread.is_alive():
        _email_queue_running = True
        _email_queue_thread = threading.Thread(target=_process_email_queue, daemon=True)
        _email_queue_thread.start()
        logger.info("Email queue worker thread started")


def _process_email_queue():
    """Background worker to process email queue"""
    email_service = EmailService()
    
    while _email_queue_running:
        try:
            # Get email from queue (blocking with timeout)
            try:
                email_data = _email_queue.get(timeout=1)
            except:
                continue  # Timeout, check if still running
            
            to_email = email_data['to_email']
            msg = email_data['msg']
            
            # Send email with retry
            success = email_service._send_email_with_retry(to_email, msg)
            if not success:
                logger.error(f"Failed to send queued email to {to_email}")
            
            _email_queue.task_done()
            
        except Exception as e:
            logger.error(f"Error processing email queue: {e}", exc_info=True)
            time.sleep(5)  # Wait before retrying

