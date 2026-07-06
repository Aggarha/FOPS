"""
JWT Authentication Module.

Provides:
  - Password hashing and verification
  - JWT token generation and verification
  - User login
  - Token validation
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
import bcrypt
from sqlalchemy.orm import Session
from storage.users import User, SessionLocal
import os

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "fops-secret-key-change-in-production-12345")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 hours
REFRESH_TOKEN_EXPIRE_DAYS = 30


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verify a plain password against a hash."""
    return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: Dict[str, Any]) -> str:
    """Create a JWT refresh token (longer expiration)."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """Verify a JWT token and return payload if valid."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def login_user(email: str, password: str, db: Session) -> Optional[Dict[str, Any]]:
    """
    Authenticate user and generate tokens.
    
    Returns:
        {
            "access_token": "...",
            "refresh_token": "...",
            "user": {"id", "email", "role", "full_name"},
            "expires_in": seconds
        }
    """
    user = db.query(User).filter_by(email=email, active=True).first()
    
    if not user or not verify_password(password, user.password_hash):
        return None
    
    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()
    
    # Generate tokens
    access_token_data = {
        "sub": user.email,
        "user_id": user.id,
        "role": user.role,
        "type": "access"
    }
    
    refresh_token_data = {
        "sub": user.email,
        "user_id": user.id,
        "role": user.role,
        "type": "refresh"
    }
    
    access_token = create_access_token(access_token_data)
    refresh_token = create_refresh_token(refresh_token_data)
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "full_name": user.full_name,
        },
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }


def create_user(email: str, password: str, full_name: str = None, role: str = "viewer", db: Session = None) -> Optional[User]:
    """
    Create a new user (for admin setup).
    
    Returns created User object or None if email already exists.
    """
    if db is None:
        db = SessionLocal()
        should_close = True
    else:
        should_close = False
    
    try:
        # Check if user exists
        existing_user = db.query(User).filter_by(email=email).first()
        if existing_user:
            return None
        
        # Create new user
        user = User(
            email=email,
            password_hash=hash_password(password),
            full_name=full_name,
            role=role,
        )
        
        db.add(user)
        db.commit()
        db.refresh(user)
        
        return user
    finally:
        if should_close:
            db.close()


def get_user_by_email(email: str, db: Session = None) -> Optional[User]:
    """Get user by email."""
    if db is None:
        db = SessionLocal()
        should_close = True
    else:
        should_close = False
    
    try:
        return db.query(User).filter_by(email=email).first()
    finally:
        if should_close:
            db.close()


def get_user_by_id(user_id: int, db: Session = None) -> Optional[User]:
    """Get user by ID."""
    if db is None:
        db = SessionLocal()
        should_close = True
    else:
        should_close = False
    
    try:
        return db.query(User).filter_by(id=user_id).first()
    finally:
        if should_close:
            db.close()
