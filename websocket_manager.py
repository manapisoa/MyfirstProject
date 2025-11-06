from typing import Dict, Set, List, Optional, Any, Tuple
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime
import json
from sqlalchemy.orm import Session

import models
import schemas

# Type alias for connection info
ConnectionInfo = Tuple[int, int]  # (user_id, group_id)

class ConnectionManager:
    def __init__(self):
        # group_id -> set of active connections
        self.active_connections: Dict[int, Dict[int, WebSocket]] = {}
        # user_id -> group_id -> WebSocket
        self.user_connections: Dict[int, Dict[int, WebSocket]] = {}
        # WebSocket -> (user_id, group_id)
        self.connection_info: Dict[WebSocket, Tuple[int, int]] = {}

    async def connect(self, websocket: WebSocket, user_id: int, group_id: int):
        await websocket.accept()
        
        # Add to active connections
        if group_id not in self.active_connections:
            self.active_connections[group_id] = {}
        
        # Remove any existing connection for this user in this group
        if user_id in self.active_connections[group_id]:
            old_ws = self.active_connections[group_id][user_id]
            if old_ws in self.connection_info:
                del self.connection_info[old_ws]
            try:
                await old_ws.close()
            except:
                pass
        
        self.active_connections[group_id][user_id] = websocket
        self.connection_info[websocket] = (user_id, group_id)
        
        # Update user_connections
        if user_id not in self.user_connections:
            self.user_connections[user_id] = {}
        self.user_connections[user_id][group_id] = websocket
        
        # Notify group about new user
        await self.broadcast(
            group_id,
            schemas.WSEvent(
                event=schemas.WSEventType.USER_JOINED,
                data={"user_id": user_id}
            )
        )
        
        return websocket

    async def disconnect(self, websocket: WebSocket):
        if websocket not in self.connection_info:
            return
            
        user_id, group_id = self.connection_info[websocket]
        
        # Remove from active connections
        if group_id in self.active_connections and user_id in self.active_connections[group_id]:
            del self.active_connections[group_id][user_id]
            if not self.active_connections[group_id]:
                del self.active_connections[group_id]
        
        # Remove from user_connections
        if user_id in self.user_connections and group_id in self.user_connections[user_id]:
            del self.user_connections[user_id][group_id]
            if not self.user_connections[user_id]:
                del self.user_connections[user_id]
        
        # Remove connection info
        if websocket in self.connection_info:
            del self.connection_info[websocket]
        
        # Notify group about user leaving
        if group_id in self.active_connections:
            await self.broadcast(
                group_id,
                schemas.WSEvent(
                    event=schemas.WSEventType.USER_LEFT,
                    data={"user_id": user_id}
                )
            )
    
    async def send_personal_message(self, message: schemas.WSEvent, user_id: int, group_id: int):
        if group_id in self.active_connections and user_id in self.active_connections[group_id]:
            websocket = self.active_connections[group_id][user_id]
            try:
                await websocket.send_json(message.dict())
            except:
                await self.disconnect(websocket)

    async def broadcast(self, group_id: int, message: schemas.WSEvent):
        if group_id in self.active_connections:
            for user_id, websocket in list(self.active_connections[group_id].items()):
                try:
                    await websocket.send_json(message.dict())
                except:
                    await self.disconnect(websocket)
    
    async def send_chat_message(self, message: schemas.MessageResponse, group_id: int, exclude_user_id: int = None):
        event = schemas.WSEvent(
            event=schemas.WSEventType.CHAT_MESSAGE,
            data=message.dict()
        )
        
        if group_id in self.active_connections:
            for user_id, websocket in list(self.active_connections[group_id].items()):
                if user_id == exclude_user_id:
                    continue
                try:
                    await websocket.send_json(event.dict())
                except:
                    await self.disconnect(websocket)
    
    def get_connected_users(self, group_id: int) -> List[int]:
        if group_id in self.active_connections:
            return list(self.active_connections[group_id].keys())
        return []

# Global instance
manager = ConnectionManager()