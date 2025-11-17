from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, status, UploadFile, File, Form, Request, Response
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List, Optional, Union, Dict, Any
import json
import os
import shutil
from datetime import datetime, timedelta
from pathlib import Path

import crud
import models
import schemas
import database
import auth
from websocket_manager import manager
from dependencies import get_db
from chat import router as chat_router

# Configuration
UPLOAD_FOLDER = "static/uploads/profiles"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Configuration CORS simplifiée
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gestionnaire pour les requêtes OPTIONS
@app.options("/register")
async def options_register():
    return {"message": "OK"}

# Include chat router
app.include_router(chat_router)

# Créer les tables
@app.on_event("startup")
def on_startup():
    models.Base.metadata.create_all(bind=database.engine)

# === AUTH ===

@app.post("/register", response_model=schemas.UserResponse)
async def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    try:
        # Vérifier si l'email existe déjà
        db_user = crud.get_user_by_email(db, email=user.email)
        if db_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email déjà enregistré"
            )
        
        # Vérifier si le nom d'utilisateur existe déjà
        db_username = crud.get_user_by_username(db, username=user.username)
        if db_username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nom d'utilisateur déjà utilisé"
            )
        
        # Créer l'utilisateur
        return crud.create_user(db=db, user=user)
        
    except Exception as e:
        print(f"Erreur lors de l'inscription: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de l'inscription: {str(e)}"
        )

@app.get("/profile/me", response_model=schemas.UserResponse)
async def read_user_profile(current_user: models.User = Depends(auth.get_current_user)):
    """Get current user's profile"""
    return current_user

@app.put("/profile/me", response_model=schemas.UserResponse)
async def update_user_profile(
    username: Optional[str] = Form(None),
    bio: Optional[str] = Form(None),
    gender: Optional[str] = Form(None),
    profile_photo: Optional[UploadFile] = File(None),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Update current user's profile"""
    # Handle file upload if present
    profile_photo_url = None
    if profile_photo and profile_photo.filename:
        # Create uploads directory if it doesn't exist
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        
        # Generate a unique filename
        file_ext = os.path.splitext(profile_photo.filename)[1]
        filename = f"user_{current_user.id}_{int(datetime.utcnow().timestamp())}{file_ext}"
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        
        # Save the file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(profile_photo.file, buffer)
        
        # Delete old profile photo if exists
        if current_user.profile_photo:
            try:
                old_photo_path = os.path.join("static", current_user.profile_photo.lstrip("/"))
                if os.path.exists(old_photo_path):
                    os.remove(old_photo_path)
            except Exception as e:
                print(f"Error deleting old profile photo: {e}")
        
        profile_photo_url = f"/static/uploads/profiles/{filename}"
    
    # Update user data
    update_data = {}
    if username is not None:
        update_data["username"] = username
    if bio is not None:
        update_data["bio"] = bio
    if gender is not None:
        update_data["gender"] = gender
    if profile_photo_url is not None:
        update_data["profile_photo"] = profile_photo_url
    
    # Update user in database
    db_user = crud.update_user(db, current_user.id, update_data)
    return db_user

@app.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = crud.get_user_by_email(db, form_data.username)
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = auth.create_access_token({"sub": user.email})
    return {"access_token": token, "token_type": "bearer"}

# === PROJECTS ===

@app.post("/projects", response_model=schemas.ProjectResponse)
def create_project(project: schemas.ProjectCreate, current_user=Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return crud.create_project(db, project, current_user.id)

@app.get("/projects", response_model=List[schemas.ProjectResponse])
def get_projects(current_user=Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return crud.get_user_projects(db, current_user.id)

# === FILES ===

@app.post("/projects/{project_id}/files", response_model=schemas.FileResponse)
def create_file(project_id: int, file: schemas.FileCreate, current_user=Depends(auth.get_current_user), db: Session = Depends(get_db)):
    # Vérifier que l'utilisateur possède le projet
    project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.owner_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return crud.create_file(db, file, project_id)

@app.get("/files/{file_id}", response_model=schemas.FileResponse)
def get_file(file_id: int, current_user=Depends(auth.get_current_user), db: Session = Depends(get_db)):
    file = crud.get_file(db, file_id)
    if not file or file.project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="File not found")
    return file

# === WEBSOCKET : Synchronisation en temps réel ===

@app.websocket("/ws/chat/group/{group_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    group_id: int,
    token: str = None,
    db: Session = Depends(get_db)
):
    # Authentification via token
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        user = auth.get_current_user(token, db)
    except Exception as e:
        print(f"Erreur d'authentification: {e}")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Vérifier que l'utilisateur a accès au groupe
    group = db.query(models.ChatGroup).get(group_id)
    if not group or user not in group.members:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Connecter l'utilisateur au groupe
    await manager.connect(websocket, user.id, group_id)
    
    try:
        # Envoyer la liste des utilisateurs connectés
        connected_users = manager.get_connected_users(group_id)
        await manager.broadcast_group(
            group_id,
            {
                "type": "user_list",
                "users": [{"id": u.id, "username": u.username} for u in connected_users]
            }
        )

        # Boucle principale de réception des messages
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "chat_message":
                # Créer et sauvegarder le message
                db_message = models.ChatMessage(
                    content=message["content"],
                    sender_id=user.id,
                    group_id=group_id
                )
                db.add(db_message)
                db.commit()
                db.refresh(db_message)
                
                # Diffuser le message à tous les utilisateurs du groupe
                await manager.broadcast_group(
                    group_id,
                    {
                        "type": "chat_message",
                        "id": db_message.id,
                        "content": db_message.content,
                        "sender_id": user.id,
                        "sender_username": user.username,
                        "timestamp": db_message.timestamp.isoformat(),
                        "user": {
                            "id": user.id,
                            "username": user.username,
                            "profile_photo": user.profile_photo
                        }
                    }
                )
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, user.id, group_id)
        # Mettre à jour la liste des utilisateurs connectés
        connected_users = manager.get_connected_users(group_id)
        await manager.broadcast_group(
            group_id,
            {
                "type": "user_list",
                "users": [{"id": u.id, "username": u.username} for u in connected_users]
            }
        )
    except Exception as e:
        print(f"Erreur WebSocket: {e}")
        manager.disconnect(websocket, user.id, group_id)