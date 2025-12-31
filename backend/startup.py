#!/usr/bin/env python3
"""
Complete startup script for the Neural AI Learning Platform backend
This script will:
1. Initialize the database
2. Populate with test data
3. Start the server
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv, find_dotenv
from app import create_app, db, socketio

def ensure_mysql_connection():
    """
    Ensure Flask uses MySQL connection - SQLite is not allowed.
    Checks DATABASE_URL and .env file, fails hard if SQLite is detected.
    """
    print("Checking database configuration...")
    print("-" * 50)
    
    # Load .env file to check what's configured
    backend_dir = Path(__file__).parent
    env_file = backend_dir / ".env"
    
    # First, try to load .env file using dotenv
    load_dotenv(find_dotenv(usecwd=True))
    
    # Also manually read .env file as backup
    env_database_url = None
    if env_file.exists():
        try:
            with open(env_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('DATABASE_URL=') and not line.startswith('#'):
                        env_database_url = line.split('=', 1)[1].strip().strip('"').strip("'")
                        break
        except Exception as e:
            print(f"Warning: Could not read .env file: {e}")
    
    # Check current DATABASE_URL environment variable (may be loaded from .env now)
    current_database_url = os.environ.get('DATABASE_URL', '')
    
    # If not in environment but found in .env file, use it
    if not current_database_url and env_database_url:
        print("Loading DATABASE_URL from .env file...")
        os.environ['DATABASE_URL'] = env_database_url
        current_database_url = env_database_url
    
    # Determine if MySQL or SQLite
    is_mysql = current_database_url and ('mysql' in current_database_url.lower() or 'pymysql' in current_database_url.lower())
    is_sqlite = current_database_url and 'sqlite' in current_database_url.lower()
    
    # If SQLite is detected, fail hard
    if is_sqlite:
        print("=" * 70)
        print("ERROR: SQLite is not supported!")
        print("=" * 70)
        print(f"Detected SQLite database: {current_database_url[:80]}...")
        print()
        print("MySQL connection is REQUIRED. SQLite is not allowed.")
        print()
        print("Solution:")
        print("  Set DATABASE_URL in .env file to MySQL connection string:")
        print("  DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/neural?charset=utf8mb4")
        print("=" * 70)
        sys.exit(1)
    elif is_mysql:
        # Redact password for display
        display_url = current_database_url
        if '@' in display_url:
            parts = display_url.split('@')
            if len(parts) == 2:
                user_part = parts[0]
                if '://' in user_part:
                    scheme_user = user_part.split('://')
                    if len(scheme_user) == 2:
                        scheme = scheme_user[0]
                        user_pass = scheme_user[1]
                        if ':' in user_pass:
                            user, _ = user_pass.split(':', 1)
                            display_url = f"{scheme}://{user}:***@{parts[1]}"
        print(f"✓ MySQL connection configured: {display_url}")
        return True
    elif not current_database_url:
        print("=" * 70)
        print("ERROR: DATABASE_URL is not set!")
        print("=" * 70)
        print("MySQL connection is REQUIRED.")
        print()
        print("Solution:")
        print("  Set DATABASE_URL in .env file:")
        print("  DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/neural?charset=utf8mb4")
        print()
        if env_file.exists():
            print(f"  .env file exists at: {env_file}")
            if not env_database_url:
                print("  But DATABASE_URL is not found in .env file")
            else:
                print(f"  Found in .env but failed to load (value: {env_database_url[:50]}...)")
        else:
            print(f"  .env file not found at: {env_file}")
            print("  Create .env file with DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/neural?charset=utf8mb4")
        print("=" * 70)
        sys.exit(1)
    else:
        print("=" * 70)
        print(f"ERROR: Unknown database type: {current_database_url[:50]}...")
        print("=" * 70)
        print("MySQL connection is REQUIRED.")
        print("Please set DATABASE_URL to a MySQL connection string.")
        print("Example: DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/neural?charset=utf8mb4")
        print("=" * 70)
        sys.exit(1)

def startup():
    """Complete startup sequence"""
    print("Starting Neural AI Learning Platform Backend")
    print("=" * 50)
    
    try:
        # Step 0: Ensure MySQL connection (before creating Flask app)
        ensure_mysql_connection()
        print()
        
        # Step 1: Create Flask app
        print("Creating Flask application...")
        app = create_app()
        try:
            db_uri = app.config.get('SQLALCHEMY_DATABASE_URI', '')
            if '://' in db_uri:
                scheme, rest = db_uri.split('://', 1)
                if '@' in rest:
                    rest = rest.split('@', 1)[1]
                redacted = f"{scheme}://{rest}"
            else:
                redacted = db_uri
            print(f"Using database: {redacted}")
        except Exception:
            pass
        
        with app.app_context():
            # Step 2: Initialize database
            print("Initializing database...")
            try:
                db.create_all()
            except Exception as e:
                print(f"Warning: Some tables may already exist or have schema differences: {e}")
                # Continue anyway - tables might be partially created
            
            # Step 2b: Add missing columns to existing tables (for schema migrations)
            try:
                from sqlalchemy import inspect, text
                from app.models.user import User
                
                inspector = inspect(db.engine)
                table_names = inspector.get_table_names()
                
                # Migrate users table
                if 'users' in table_names:
                    columns = [col['name'] for col in inspector.get_columns('users')]
                    if 'last_check_in_date' not in columns:
                        print("Adding missing column 'last_check_in_date' to users table...")
                        try:
                            db.session.execute(text("ALTER TABLE users ADD COLUMN last_check_in_date DATE"))
                            db.session.commit()
                            print("✓ Column added successfully")
                        except Exception as alter_error:
                            if 'Duplicate column name' in str(alter_error):
                                print("Column already exists (added by another process)")
                            else:
                                raise
                
                # Migrate competition_participations table
                if 'competition_participations' in table_names:
                    columns = [col['name'] for col in inspector.get_columns('competition_participations')]
                    if 'completed_activities' not in columns:
                        print("Adding missing column 'completed_activities' to competition_participations table...")
                        try:
                            # JSON column type for MySQL 5.7+ (or TEXT for older versions)
                            db.session.execute(text("ALTER TABLE competition_participations ADD COLUMN completed_activities JSON"))
                            db.session.commit()
                            print("✓ Column added successfully")
                        except Exception as alter_error:
                            if 'Duplicate column name' in str(alter_error):
                                print("Column already exists (added by another process)")
                            elif 'JSON' in str(alter_error) and 'not supported' in str(alter_error).lower():
                                # Fallback to TEXT for older MySQL versions
                                print("JSON not supported, using TEXT instead...")
                                db.session.execute(text("ALTER TABLE competition_participations ADD COLUMN completed_activities TEXT"))
                                db.session.commit()
                                print("✓ Column added as TEXT")
                            else:
                                raise
                
                # Migrate modules table - add missing columns
                if 'modules' in table_names:
                    columns = [col['name'] for col in inspector.get_columns('modules')]
                    missing_modules_columns = []
                    
                    if 'learning_objectives' not in columns:
                        missing_modules_columns.append(('learning_objectives', 'JSON'))
                    if 'prerequisites' not in columns:
                        missing_modules_columns.append(('prerequisites', 'JSON'))
                    if 'certificate_name' not in columns:
                        missing_modules_columns.append(('certificate_name', 'VARCHAR(255)'))
                    if 'skill_focus' not in columns:
                        missing_modules_columns.append(('skill_focus', 'JSON'))
                    
                    for col_name, col_type in missing_modules_columns:
                        print(f"Adding missing column '{col_name}' to modules table...")
                        try:
                            if col_type == 'JSON':
                                db.session.execute(text(f"ALTER TABLE modules ADD COLUMN {col_name} JSON DEFAULT NULL"))
                            else:
                                db.session.execute(text(f"ALTER TABLE modules ADD COLUMN {col_name} {col_type} DEFAULT NULL"))
                            db.session.commit()
                            print(f"✓ Column '{col_name}' added successfully")
                        except Exception as alter_error:
                            if 'Duplicate column name' in str(alter_error) or 'already exists' in str(alter_error).lower():
                                print(f"Column '{col_name}' already exists (added by another process)")
                            elif col_type == 'JSON' and ('JSON' in str(alter_error) and 'not supported' in str(alter_error).lower()):
                                # Fallback to TEXT for older MySQL versions
                                print(f"JSON not supported, using TEXT instead for '{col_name}'...")
                                db.session.execute(text(f"ALTER TABLE modules ADD COLUMN {col_name} TEXT DEFAULT NULL"))
                                db.session.commit()
                                print(f"✓ Column '{col_name}' added as TEXT")
                            else:
                                db.session.rollback()
                                print(f"Warning: Could not add column '{col_name}': {alter_error}")
            except Exception as e:
                # Ignore errors - column might already exist or table might not exist yet
                if 'does not exist' not in str(e).lower():
                    print(f"Note: Schema migration check: {e}")
                db.session.rollback()
            
            # Check if we have data
            from app.models.user import User
            try:
                user_count = User.query.count()
            except Exception as e:
                print(f"Warning: Could not count users (schema mismatch?): {e}")
                user_count = 0
            
            if user_count == 0:
                print("No users found in database.")
                print("Note: You may want to create an admin user using: python scripts/ensure_admin.py")
            else:
                print(f"Database already has {user_count} users")
            
            # Show database stats (Phase 1 MVP models only)
            from app.models.content import Module, Lesson, Topic
            from app.models.progress import UserProgress
            
            print("\nDatabase Statistics:")
            try:
                print(f"  Users: {User.query.count()}")
            except Exception as e:
                print(f"  Users: Error (schema mismatch: {str(e)[:50]}...)")
            
            try:
                print(f"  Topics: {Topic.query.count()}")
            except Exception as e:
                print(f"  Topics: Error (schema mismatch: {str(e)[:50]}...)")
            
            try:
                print(f"  Modules: {Module.query.count()}")
            except Exception as e:
                print(f"  Modules: Error (schema mismatch: {str(e)[:50]}...)")
            
            try:
                print(f"  Lessons: {Lesson.query.count()}")
            except Exception as e:
                print(f"  Lessons: Error (schema mismatch: {str(e)[:50]}...)")
            
            try:
                print(f"  Progress Records: {UserProgress.query.count()}")
            except Exception as e:
                print(f"  Progress Records: Error (schema mismatch: {str(e)[:50]}...)")
            
        print("\nStarting web server...")
        print("Server will be available at: http://localhost:8085")
        print("API endpoints available at: http://localhost:8085/api/v1/")
        print("Health check: http://localhost:8085/api/v1/health")
        print("\n⏹Press Ctrl+C to stop the server")
        print("=" * 50)
        
        # Start the server using socketio (as configured in wsgi.py)
        socketio.run(app, host='0.0.0.0', port=8085, debug=True)
        
    except KeyboardInterrupt:
        print("\n\nServer stopped by user")
        sys.exit(0)
    except Exception as e:
        print(f"\nError during startup: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    startup()
