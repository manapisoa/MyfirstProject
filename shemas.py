from pydantic import BaseModel, EmailStr
from typing import List

class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class ProjectBase(BaseModel):
    name: str

class ProjectCreate(ProjectBase):
    pass

class ProjectResponse(ProjectBase):
    id: int
    owner_id: int
    files: List["FileResponse"] = []
    class Config:
        from_attributes = True

class FileBase(BaseModel):
    name: str
    content: str = ""

class FileCreate(FileBase):
    pass

class FileResponse(FileBase):
    id: int
    project_id: int
    class Config:
        from_attributes = True