#!/usr/bin/env python3
"""
Initialize FOPS authentication system.

This script:
  1. Creates users.db with users and permissions tables
  2. Sets up default role permissions
  3. Creates default admin user
  4. Creates example users for testing

Usage:
  python3 setup_auth.py
  python3 setup_auth.py --admin-email user@example.com --admin-password password123
"""

import sys
import os
from pathlib import Path

# Add parent directory to path so we can import fops modules
sys.path.insert(0, str(Path(__file__).parent))

from storage.users import init_db, SessionLocal, User, Permission
from auth.auth import hash_password, create_user
import argparse


def main():
    parser = argparse.ArgumentParser(description="Initialize FOPS authentication system")
    parser.add_argument("--admin-email", default="admin@fops.local", help="Admin email address")
    parser.add_argument("--admin-password", default="admin123", help="Admin password")
    parser.add_argument("--skip-demo-users", action="store_true", help="Skip creating demo users")
    
    args = parser.parse_args()
    
    print("🔐 Initializing FOPS Authentication System...")
    print()
    
    # Initialize database
    print("✓ Creating database schema...")
    init_db()
    
    db = SessionLocal()
    
    # Check if admin user already exists
    admin_user = db.query(User).filter_by(email=args.admin_email).first()
    
    if admin_user:
        print(f"✓ Admin user already exists: {args.admin_email}")
    else:
        # Create admin user
        print(f"✓ Creating admin user: {args.admin_email}")
        admin = User(
            email=args.admin_email,
            password_hash=hash_password(args.admin_password),
            full_name="Administrator",
            role="admin",
            active=True
        )
        db.add(admin)
        db.commit()
        print(f"  → Password: {args.admin_password}")
    
    # Check for existing demo users
    analyst_user = db.query(User).filter_by(email="analyst@fops.local").first()
    
    if not args.skip_demo_users and not analyst_user:
        print("✓ Creating demo users for testing...")
        
        # Analyst user
        analyst = User(
            email="analyst@fops.local",
            password_hash=hash_password("analyst123"),
            full_name="Demo Analyst",
            role="analyst",
            active=True
        )
        db.add(analyst)
        
        # Operator user
        operator = User(
            email="operator@fops.local",
            password_hash=hash_password("operator123"),
            full_name="Demo Operator",
            role="operator",
            active=True
        )
        db.add(operator)
        
        # Viewer user
        viewer = User(
            email="viewer@fops.local",
            password_hash=hash_password("viewer123"),
            full_name="Demo Viewer",
            role="viewer",
            active=True
        )
        db.add(viewer)
        
        db.commit()
        
        print("  → analyst@fops.local / analyst123")
        print("  → operator@fops.local / operator123")
        print("  → viewer@fops.local / viewer123")
    
    # Display permissions summary
    print()
    print("✓ Role-based permissions configured:")
    permissions = db.query(Permission).all()
    for perm in permissions:
        print(f"\n  {perm.role.upper()}:")
        print(f"    Approve: {perm.can_approve}")
        print(f"    Reject: {perm.can_reject}")
        print(f"    Run Tools: {perm.can_run_tools}")
        print(f"    Manage Users: {perm.can_manage_users}")
        print(f"    Allowed Tools: {', '.join(perm.allowed_tools) if perm.allowed_tools else 'none'}")
    
    db.close()
    
    print()
    print("✅ Authentication system initialized successfully!")
    print()
    print("📝 Next steps:")
    print("  1. Add authentication endpoints to FastAPI app")
    print("  2. Restart the FOPS service")
    print("  3. Test login at http://localhost:8001/api/login")
    print()
    print(f"🔑 Initial credentials:")
    print(f"  Email: {args.admin_email}")
    print(f"  Password: {args.admin_password}")


if __name__ == "__main__":
    main()
