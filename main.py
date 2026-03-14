"""
Xbox Teams Backend - FastAPI + WebSocket
"""
import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Dict, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from routers import xbox

load_dotenv()


# Room management
class Room:
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.host: str = None
        self.viewers: Set[str] = set()
        self.stream_active: bool = False
        self.xbox_ip: str = None
        self.created_at = datetime.now()


rooms: Dict[str, Room] = {}


# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.user_rooms: Dict[str, Set[str]] = {}  # socket_id -> set of room_ids

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        self.user_rooms[client_id] = set()

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        # Clean up rooms
        if client_id in self.user_rooms:
            for room_id in list(self.user_rooms[client_id]):
                self._cleanup_room(room_id, client_id)
            del self.user_rooms[client_id]

    def _cleanup_room(self, room_id: str, client_id: str):
        if room_id not in rooms:
            return
        
        room = rooms[room_id]
        
        if room.host == client_id:
            # Host left - notify all viewers and delete room
            for viewer_id in room.viewers:
                if viewer_id in self.active_connections:
                    asyncio.create_task(
                        self.active_connections[viewer_id].send_json({
                            "type": "host-disconnected"
                        })
                    )
            del rooms[room_id]
        else:
            # Viewer left
            room.viewers.discard(client_id)
            if room.host in self.active_connections:
                asyncio.create_task(
                    self.active_connections[room.host].send_json({
                        "type": "viewer-left",
                        "viewerId": client_id
                    })
                )

    async def send_personal(self, message: dict, client_id: str):
        if client_id in self.active_connections:
            await self.active_connections[client_id].send_json(message)

    async def broadcast_to_room(self, message: dict, room_id: str, exclude: str = None):
        if room_id not in rooms:
            return
        
        room = rooms[room_id]
        
        # Send to host
        if room.host and room.host in self.active_connections:
            if exclude != room.host:
                await self.active_connections[room.host].send_json(message)
        
        # Send to viewers
        for viewer_id in room.viewers:
            if viewer_id != exclude and viewer_id in self.active_connections:
                await self.active_connections[viewer_id].send_json(message)


manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("Xbox Teams Backend starting...")
    yield
    # Shutdown
    print("Xbox Teams Backend shutting down...")


app = FastAPI(title="Xbox Teams API", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(xbox.router, prefix="/api", tags=["xbox"])


# Health check
@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    client_id = str(uuid.uuid4())
    await manager.connect(websocket, client_id)
    
    try:
        await websocket.send_json({
            "type": "connected",
            "clientId": client_id
        })
        
        while True:
            data = await websocket.receive_json()
            await handle_message(client_id, data)
            
    except WebSocketDisconnect:
        manager.disconnect(client_id)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(client_id)


async def handle_message(client_id: str, data: dict):
    msg_type = data.get("type")
    
    if msg_type == "create-room":
        room_id = str(uuid.uuid4())
        room = Room(room_id)
        room.host = client_id
        rooms[room_id] = room
        manager.user_rooms[client_id].add(room_id)
        
        await manager.send_personal({
            "type": "room-created",
            "roomId": room_id
        }, client_id)
    
    elif msg_type == "join-room":
        room_id = data.get("roomId")
        
        if room_id not in rooms:
            await manager.send_personal({
                "type": "error",
                "message": "Room not found"
            }, client_id)
            return
        
        room = rooms[room_id]
        room.viewers.add(client_id)
        manager.user_rooms[client_id].add(room_id)
        
        # Notify host
        await manager.send_personal({
            "type": "viewer-joined",
            "viewerId": client_id
        }, room.host)
        
        # Send room info to joiner
        await manager.send_personal({
            "type": "room-joined",
            "roomId": room_id,
            "hasStream": room.stream_active
        }, client_id)
    
    elif msg_type == "signal":
        room_id = data.get("roomId")
        target_id = data.get("targetId")
        signal_data = data.get("data")
        
        await manager.send_personal({
            "type": "signal",
            "from": client_id,
            "data": signal_data
        }, target_id)
    
    elif msg_type == "stream-started":
        room_id = data.get("roomId")
        xbox_ip = data.get("xboxIp")
        
        if room_id in rooms:
            room = rooms[room_id]
            room.stream_active = True
            room.xbox_ip = xbox_ip
            
            await manager.broadcast_to_room({
                "type": "stream-status",
                "active": True
            }, room_id, exclude=client_id)
    
    elif msg_type == "stream-stopped":
        room_id = data.get("roomId")
        
        if room_id in rooms:
            room = rooms[room_id]
            room.stream_active = False
            
            await manager.broadcast_to_room({
                "type": "stream-status",
                "active": False
            }, room_id, exclude=client_id)
    
    elif msg_type == "xbox-command":
        room_id = data.get("roomId")
        command = data.get("command")
        
        if room_id in rooms:
            room = rooms[room_id]
            if room.host == client_id:
                await manager.broadcast_to_room({
                    "type": "xbox-command",
                    "command": command
                }, room_id, exclude=client_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)