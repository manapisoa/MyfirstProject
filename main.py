from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional, Union, Dict, Any
import json
from datetime import datetime, timedelta

import crud
import models
import schemas
import database
import auth
from websocket_manager import manager
from dependencies import get_db
from chat import router as chat_router

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En production, remplacez par vos origines autorisées
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include chat router
app.include_router(chat_router)

# Créer les tables
@app.on_event("startup")
def on_startup():
    models.Base.metadata.create_all(bind=database.engine)

# === AUTH ===

@app.post("/register", response_model=schemas.UserResponse)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_email(db, user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    return crud.create_user(db, user)

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

@app.websocket("/ws/file/{file_id}")
async def websocket_endpoint(websocket: WebSocket, file_id: int, token: str = None, db: Session = Depends(get_db)):
    # Authentification via token dans les query params
    if not token:
        await websocket.close(code=1008)
        return

    try:
        user = auth.get_current_user(token, db)
    except:
        await websocket.close(code=1008)
        return

    file = crud.get_file(db, file_id)
    if not file or file.project.owner_id != user.id:
        await websocket.close(code=1008)
        return

    await manager.connect(websocket, file_id)
    try:
        # Envoyer le contenu actuel au nouveau client
        await websocket.send_json({"type": "init", "content": file.content})
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            if message.get("type") == "update":
                content = message["content"]
                crud.update_file_content(db, file_id, content)
                await manager.broadcast({
                    "type": "update",
                    "content": content
                }, file_id)
    except WebSocketDisconnect:
        manager.disconnect(websocket, file_id)
    except Exception as e:
        print(e)
        manager.disconnect(websocket, file_id)