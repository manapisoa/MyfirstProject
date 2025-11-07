from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from typing import List, Optional, Dict, Any

import models
import schemas
from auth import get_password_hash

# User
def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()

def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def create_user(db: Session, user: schemas.UserCreate):
    # Vérifier si l'email ou le nom d'utilisateur existe déjà
    if get_user_by_email(db, user.email):
        raise ValueError("Email already registered")
    if get_user_by_username(db, user.username):
        raise ValueError("Username already taken")
    
    hashed = get_password_hash(user.password)
    user_data = user.dict()
    user_data.pop('password')
    user_data['hashed_password'] = hashed
    
    db_user = models.User(**user_data)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user(db: Session, user_id: int, user_data: dict):
    db_user = get_user(db, user_id)
    if not db_user:
        raise ValueError("User not found")
    
    # Check if new username is taken
    if 'username' in user_data and user_data['username'] != db_user.username:
        if get_user_by_username(db, user_data['username']):
            raise ValueError("Username already taken")
    
    # Check if new email is taken
    if 'email' in user_data and user_data['email'] != db_user.email:
        if get_user_by_email(db, user_data['email']):
            raise ValueError("Email already registered")
    
    # Update user fields
    for field, value in user_data.items():
        setattr(db_user, field, value)
    
    db.commit()
    db.refresh(db_user)
    return db_user

# Project
def create_project(db: Session, project: schemas.ProjectCreate, owner_id: int):
    db_project = models.Project(name=project.name, owner_id=owner_id)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

def get_user_projects(db: Session, user_id: int):
    return db.query(models.Project).filter(models.Project.owner_id == user_id).all()

# File
def create_file(db: Session, file: schemas.FileCreate, project_id: int):
    db_file = models.File(**file.dict(), project_id=project_id)
    db.add(db_file)
    db.commit()
    db.refresh(db_file)
    return db_file

def get_file(db: Session, file_id: int):
    return db.query(models.File).filter(models.File.id == file_id).first()

def update_file_content(db: Session, file_id: int, content: str):
    file = get_file(db, file_id)
    if file:
        file.content = content
        db.commit()
        db.refresh(file)
    return file

# Chat Groups
def get_chat_group(db: Session, group_id: int):
    return db.query(models.ChatGroup).filter(models.ChatGroup.id == group_id).first()

def get_chat_group_by_code(db: Session, join_code: str):
    return db.query(models.ChatGroup).filter(models.ChatGroup.join_code == join_code).first()

def get_user_chat_groups(db: Session, user_id: int):
    user = db.query(models.User).options(joinedload(models.User.chat_groups)).get(user_id)
    return user.chat_groups if user else []

def add_user_to_chat_group(db: Session, user_id: int, group_id: int):
    user = db.query(models.User).get(user_id)
    group = db.query(models.ChatGroup).get(group_id)
    
    if not user or not group:
        return False
    
    if user not in group.members:
        group.members.append(user)
        db.commit()
    
    return True

def remove_user_from_chat_group(db: Session, user_id: int, group_id: int):
    user = db.query(models.User).get(user_id)
    group = db.query(models.ChatGroup).get(group_id)
    
    if not user or not group:
        return False
    
    if user in group.members:
        group.members.remove(user)
        db.commit()
    
    return True

# Chat Messages
def create_chat_message(db: Session, message: schemas.MessageCreate, sender_id: int, group_id: int):
    db_message = models.ChatMessage(
        content=message.content,
        message_type=message.message_type,
        sender_id=sender_id,
        group_id=group_id
    )
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    return db_message

def get_chat_messages(db: Session, group_id: int, skip: int = 0, limit: int = 100):
    return db.query(models.ChatMessage)\
        .filter(models.ChatMessage.group_id == group_id)\
        .order_by(models.ChatMessage.timestamp.desc())\
        .offset(skip)\
        .limit(limit)\
        .all()

def search_chat_messages(db: Session, group_id: int, query: str):
    return db.query(models.ChatMessage)\
        .filter(
            models.ChatMessage.group_id == group_id,
            models.ChatMessage.content.ilike(f"%{query}%")
        )\
        .order_by(models.ChatMessage.timestamp.desc())\
        .all()