#!/usr/bin/env python3
"""
Ensure default users exist (admin and a test learner).
"""

import os
import sys

# Ensure backend app is on path when running as a script
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app, db  # type: ignore
from app.models.user import User  # type: ignore


def ensure_users() -> None:
    app = create_app()
    with app.app_context():
        db.create_all()

        # Admin
        admin_email = 'admin@neuralai.com'
        admin = User.query.filter_by(email=admin_email).first()
        if not admin:
            admin = User(
                email=admin_email,
                username='admin',
                full_name='Neural Admin',
                is_admin=True,
                admin_type='super_admin'
            )
            admin.set_password('Admin123!@#')
            db.session.add(admin)
            print('✓ Admin user created')
        else:
            # Ensure admin privileges and reset password to known value
            admin.is_admin = True
            admin.is_active = True
            admin.admin_type = 'super_admin'
            admin.set_password('Admin123!@#')
            print('✓ Admin user exists (privileges enforced and password reset)')

        # Test learner
        learner_email = 'testuser@neuralai.com'
        learner = User.query.filter_by(email=learner_email).first()
        if not learner:
            learner = User(
                email=learner_email,
                username='testuser',
                full_name='Test User',
                is_admin=False
            )
            learner.set_password('TestUser123!')
            db.session.add(learner)
            print('✓ Test learner created')
        else:
            print('✓ Test learner exists')

        db.session.commit()


if __name__ == '__main__':
    ensure_users()


