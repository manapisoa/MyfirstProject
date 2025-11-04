from typing import Dict, Set
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # file_id -> set of websockets
        self.active_connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, file_id: int):
        await websocket.accept()
        if file_id not in self.active_connections:
            self.active_connections[file_id] = set()
        self.active_connections[file_id].add(websocket)

    def disconnect(self, websocket: WebSocket, file_id: int):
        if file_id in self.active_connections:
            self.active_connections[file_id].discard(websocket)
            if not self.active_connections[file_id]:
                del self.active_connections[file_id]

    async def broadcast(self, message: dict, file_id: int):
        if file_id in self.active_connections:
            for connection in self.active_connections[file_id]:
                await connection.send_json(message)

manager = ConnectionManager()