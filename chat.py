from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import List
import json
from datetime import datetime

import models
import schemas
import crud
import auth
import websocket_manager
from dependencies import get_db

router = APIRouter(prefix="/api/chat", tags=["chat"])

# CRUD for Chat Groups
@router.post("/groups/", response_model=schemas.ChatGroupResponse)
def create_chat_group(
    group: schemas.ChatGroupCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Create a new chat group"""
    db_group = models.ChatGroup(
        name=group.name,
        is_private=group.is_private,
        created_by=current_user.id
    )
    
    db.add(db_group)
    db.flush()  # To get the ID for the group
    
    # Add creator as a member
    db_group.members.append(current_user)
    db.commit()
    db.refresh(db_group)
    
    # Add member_count to the response
    response = schemas.ChatGroupResponse(
        **db_group.__dict__,
        member_count=1
    )
    
    return response

@router.get("/groups/", response_model=List[schemas.ChatGroupResponse])
def list_chat_groups(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """List all chat groups the user is a member of"""
    groups = db.query(models.ChatGroup)\
        .join(models.ChatGroup.members)\
        .filter(models.User.id == current_user.id)\
        .all()
    
    # Add member_count to each group
    response = []
    for group in groups:
        group_dict = {**group.__dict__}
        group_dict["member_count"] = len(group.members)
        response.append(schemas.ChatGroupResponse(**group_dict))
    
    return response

@router.post("/groups/join/", response_model=schemas.ChatGroupResponse)
def join_chat_group(
    join_data: schemas.ChatGroupJoin,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Join a chat group using a join code"""
    group = db.query(models.ChatGroup)\
        .filter(models.ChatGroup.join_code == join_data.join_code)\
        .first()
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if current_user not in group.members:
        group.members.append(current_user)
        db.commit()
    
    # Add member_count to the response
    response = schemas.ChatGroupResponse(
        **group.__dict__,
        member_count=len(group.members)
    )
    
    return response

@router.get("/groups/{group_id}/messages/", response_model=List[schemas.MessageResponse])
def get_chat_messages(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Get chat messages for a group"""
    # Verify user is a member of the group
    group = db.query(models.ChatGroup)\
        .filter(models.ChatGroup.id == group_id)\
        .first()
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if current_user not in group.members:
        raise HTTPException(status_code=403, detail="Not a member of this group")
    
    # Get messages with sender information
    messages = db.query(models.ChatMessage)\
        .join(models.User, models.ChatMessage.sender_id == models.User.id)\
        .filter(models.ChatMessage.group_id == group_id)\
        .order_by(models.ChatMessage.timestamp)\
        .all()
    
    # Convert to response model with sender username
    response = []
    for msg in messages:
        msg_dict = {**msg.__dict__}
        msg_dict["sender_username"] = msg.sender.username
        response.append(schemas.MessageResponse(**msg_dict))
    
    return response

# WebSocket endpoint for real-time chat
@router.websocket("/ws/{group_id}")
async def websocket_chat_endpoint(
    websocket: WebSocket,
    group_id: int,
    token: str,
    db: Session = Depends(get_db)
):
    # Authenticate user
    try:
        current_user = auth.get_current_user(token, db)
    except:
        await websocket.close(code=1008)
        return
    
    # Verify group exists and user is a member
    group = db.query(models.ChatGroup)\
        .filter(models.ChatGroup.id == group_id)\
        .first()
    
    if not group or current_user not in group.members:
        await websocket.close(code=1008)
        return
    
    # Connect to the WebSocket
    await websocket_manager.manager.connect(websocket, current_user.id, group_id)
    
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            # Handle different message types
            if message_data.get("type") == "chat_message":
                # Save message to database
                db_message = models.ChatMessage(
                    content=message_data["content"],
                    sender_id=current_user.id,
                    group_id=group_id,
                    message_type=message_data.get("message_type", "text")
                )
                db.add(db_message)
                db.commit()
                db.refresh(db_message)
                
                # Prepare response
                message_response = schemas.MessageResponse(
                    id=db_message.id,
                    content=db_message.content,
                    message_type=db_message.message_type,
                    sender_id=current_user.id,
                    sender_username=current_user.username,
                    timestamp=db_message.timestamp,
                    group_id=group_id
                )
                
                # Broadcast to all connected clients in the group
                await websocket_manager.manager.send_chat_message(
                    message=message_response,
                    group_id=group_id,
                    exclude_user_id=current_user.id
                )
                
                # Send confirmation to sender
                await websocket_manager.manager.send_personal_message(
                    schemas.WSEvent(
                        event=schemas.WSEventType.CHAT_MESSAGE,
                        data={"status": "delivered", "message_id": db_message.id}
                    ),
                    current_user.id,
                    group_id
                )
    
    except WebSocketDisconnect:
        await websocket_manager.manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket_manager.manager.disconnect(websocket)
    finally:
        await websocket_manager.manager.disconnect(websocket)
