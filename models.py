import secrets
import string
from typing import List, Optional, Dict, Any
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base

# Table de jonction pour la relation many-to-many entre les utilisateurs et les groupes
user_chat_group = Table(
    'user_chat_group',
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('chat_group_id', Integer, ForeignKey('chat_groups.id'), primary_key=True)
)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    username = Column(String, unique=True, index=True)
    projects = relationship("Project", back_populates="owner")
    chat_groups = relationship("ChatGroup", secondary=user_chat_group, back_populates="members")
    messages = relationship("ChatMessage", back_populates="sender")

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="projects")
    files = relationship("File", back_populates="project", cascade="all, delete-orphan")

class File(Base):
    __tablename__ = "files"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    content = Column(Text, default="")
    project_id = Column(Integer, ForeignKey("projects.id"))
    project = relationship("Project", back_populates="files")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class ChatGroup(Base):
    __tablename__ = "chat_groups"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    join_code = Column(String(8), unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"))
    is_private = Column(Boolean, default=False)
    
    # Relations
    members = relationship("User", secondary=user_chat_group, back_populates="chat_groups")
    messages = relationship("ChatMessage", back_populates="group", cascade="all, delete-orphan")
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Générer un code d'adhésion unique de 8 caractères
        self.join_code = self._generate_join_code()
    
    def _generate_join_code(self):
        # Générer un code aléatoire de 8 caractères (chiffres et lettres majuscules)
        alphabet = string.ascii_uppercase + string.digits
        return ''.join(secrets.choice(alphabet) for _ in range(8))

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relations
    sender_id = Column(Integer, ForeignKey("users.id"))
    sender = relationship("User", back_populates="messages")
    
    group_id = Column(Integer, ForeignKey("chat_groups.id"))
    group = relationship("ChatGroup", back_populates="messages")