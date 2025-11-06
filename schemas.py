from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
from enum import Enum

# Enums
class MessageType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    FILE = "file"

# User schemas
class UserBase(BaseModel):
    email: EmailStr
    username: str

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

# Chat Group schemas
class ChatGroupBase(BaseModel):
    name: str
    is_private: bool = False

class ChatGroupCreate(ChatGroupBase):
    pass

class ChatGroupJoin(BaseModel):
    join_code: str = Field(..., min_length=8, max_length=8)

class ChatGroupResponse(ChatGroupBase):
    id: int
    join_code: str
    created_at: datetime
    created_by: int
    member_count: int
    
    class Config:
        from_attributes = True

# Chat Message schemas
class MessageBase(BaseModel):
    content: str
    message_type: MessageType = MessageType.TEXT

class MessageCreate(MessageBase):
    pass

class MessageResponse(MessageBase):
    id: int
    sender_id: int
    sender_username: str
    timestamp: datetime
    group_id: int
    
    class Config:
        from_attributes = True

# WebSocket
class WebSocketMessage(BaseModel):
    type: str
    content: Union[str, Dict[str, Any]]
    user_id: Optional[int] = None
    username: Optional[str] = None
    timestamp: Optional[datetime] = None

# WebSocket event types
class WSEventType(str, Enum):
    CHAT_MESSAGE = "chat_message"
    USER_JOINED = "user_joined"
    USER_LEFT = "user_left"
    GROUP_UPDATE = "group_update"
    ERROR = "error"

class WSEvent(BaseModel):
    event: WSEventType
    data: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.utcnow)
