from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime

# User schemas
class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    
    class Config:
        from_attributes = True

# Project schemas
class ProjectBase(BaseModel):
    name: str

class ProjectCreate(ProjectBase):
    pass

class ProjectResponse(ProjectBase):
    id: int
    owner_id: int
    
    class Config:
        from_attributes = True

# File schemas
class FileBase(BaseModel):
    name: str
    content: str = ""

class FileCreate(FileBase):
    project_id: int

class FileResponse(FileBase):
    id: int
    project_id: int
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Authentication
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# WebSocket
class WebSocketMessage(BaseModel):
    type: str
    content: str
    user_id: Optional[int] = None
