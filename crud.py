from sqlalchemy.orm import Session
from . import models, schemas
from .auth import get_password_hash

# User
def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def create_user(db: Session, user: schemas.UserCreate):
    hashed = get_password_hash(user.password)
    db_user = models.User(email=user.email, hashed_password=hashed)
    db.add(db_user)
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