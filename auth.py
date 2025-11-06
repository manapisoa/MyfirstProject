from datetime import datetime, timedelta
from typing import Optional, Union, Dict, Any
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status, WebSocket
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import ValidationError
import bcrypt

import models
import schemas
import crud
from dependencies import get_db

# Configuration
SECRET_KEY = "your-secret-key-here"  # À remplacer par une clé secrète sécurisée
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30 * 24 * 60  # 30 jours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Vérifie si le mot de passe correspond au hash."""
    if isinstance(hashed_password, str):
        hashed_password = hashed_password.encode('utf-8')
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password)
    except ValueError:
        return False

def get_password_hash(password: str) -> str:
    """Hash un mot de passe pour le stockage."""
    # Tronquer le mot de passe à 72 caractères si nécessaire (limite de bcrypt)
    if len(password) > 72:
        password = password[:72]
    # Générer un sel et hacher le mot de passe
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Crée un nouveau token d'accès JWT."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire, "sub": str(to_encode["sub"])})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def authenticate_user(db: Session, username: str, password: str) -> Optional[models.User]:
    """Authentifie un utilisateur avec son email/nom d'utilisateur et mot de passe."""
    # Essayer de trouver l'utilisateur par email ou nom d'utilisateur
    user = None
    if "@" in username:
        user = crud.get_user_by_email(db, email=username)
    else:
        user = crud.get_user_by_username(db, username=username)
    
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    """Obtient l'utilisateur actuel à partir du token JWT."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Impossible de valider les informations d'identification",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_identifier: str = payload.get("sub")
        if not user_identifier:
            raise credentials_exception
            
        # Vérifier si l'identifiant est un email ou un nom d'utilisateur
        if "@" in user_identifier:
            user = crud.get_user_by_email(db, email=user_identifier)
        else:
            user = crud.get_user_by_username(db, username=user_identifier)
            
        if user is None:
            raise credentials_exception
            
        return user
        
    except (JWTError, ValidationError):
        raise credentials_exception

async def get_current_user_ws(token: str, db: Session) -> Optional[models.User]:
    """Version WebSocket de get_current_user qui renvoie None en cas d'échec."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_identifier: str = payload.get("sub")
        if not user_identifier:
            return None
            
        if "@" in user_identifier:
            return crud.get_user_by_email(db, email=user_identifier)
        else:
            return crud.get_user_by_username(db, username=user_identifier)
            
    except (JWTError, ValidationError):
        return None

def get_current_active_user(current_user: models.User = Depends(get_current_user)) -> models.User:
    """Vérifie que l'utilisateur est actif."""
    if not current_user:
        raise HTTPException(status_code=400, detail="Utilisateur inactif")
    return current_user