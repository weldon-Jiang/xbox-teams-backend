"""
Xbox API routes
"""
import socket
from typing import List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import aiohttp
import netifaces

router = APIRouter()


# Xbox discovery service
class XboxDevice:
    def __init__(self, name: str, ip_address: str, mac_Address: str = None):
        self.name = name
        self.ip_address = ip_address
        self.mac_Address = mac_Address
        self.status = "offline"
        self.device_type = "Xbox"


async def discover_xbox_devices(timeout: int = 5) -> List[XboxDevice]:
    """Discover Xbox devices on local network using SSDP/UPnP"""
    devices = []
    
    # SSDP multicast address for Xbox
    SSDP_ADDR = "239.255.255.250"
    SSDP_PORT = 19
    
    # Xbox SSDP search message
    search_msg = (
        "M-SEARCH * HTTP/1.1\r\n"
        "HOST: 239.255.255.250:19\r\n"
        "MAN: \"ssdp:discover\"\r\n"
        "MX: 3\r\n"
        "ST: urn:schemas-upnp-org:device:MediaServer:1\r\n"
        "\r\n"
    )
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(timeout)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        
        # Send broadcast
        sock.sendto(search_msg.encode(), (SSDP_ADDR, SSDP_PORT))
        
        # Collect responses
        seen_ips = set()
        for _ in range(10):  # Max 1 responses
            try:
                data, addr = sock.recvfrom(4096)
                ip = addr[0]
                
                if ip not in seen_ips:
                    seen_ips.add(ip)
                    device = XboxDevice(
                        name=f"Xbox ({ip})",
                        ip_address=ip
                    )
                    device.status = "online"
                    devices.append(device)
            except socket.timeout:
                break
                
        sock.close()
        
    except Exception as e:
        print(f"Discovery error: {e}")
    
    # Fallback: scan local network if no devices found
    if not devices:
        for iface in netifaces.interfaces():
            addrs = netifaces.ifaddresses(iface)
            if netifaces.AF_INET in addrs:
                for addr_info in addrs[netifaces.AF_INET]:
                    ip = addr_info['addr']
                    if ip.startswith('192.168.') or ip.startswith('10.'):
                        device = XboxDevice(
                            name=f"Xbox ({ip})",
                            ip_address=ip,
                            status="online"
                        )
                        devices.append(device)
                        break
    
    return devices


@router.get("/xbox/discover")
async def discover_xbox():
    """Discover Xbox consoles on the network"""
    devices = await discover_xbox_devices()
    return {
        "success": True,
        "consoles": [
            {
                "name": d.name,
                "ipAddress": d.ip_address,
                "macAddress": d.mac_Address,
                "status": d.status
            }
            for d in devices
        ]
    }


@router.get("/xbox/{ip}/status")
async def get_xbox_status(ip: str):
    """Get status of a specific Xbox"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"http://{ip}:19",
                timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                return {
                    "success": True,
                    "status": {
                        "ip": ip,
                        "online": resp.status == 200
                    }
                }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/rooms")
async def get_rooms():
    """Get all active rooms"""
    from main import rooms
    
    room_list = []
    for room_id, room in rooms.items():
        room_list.append({
            "roomId": room.room_id,
            "host": room.host,
            "viewerCount": len(room.viewers),
            "streamActive": room.stream_active,
            "xboxIp": room.xbox_ip
        })
    
    return {"success": True, "rooms": room_list}


@router.get("/rooms/{room_id}")
async def get_room(room_id: str):
    """Get specific room info"""
    from main import rooms
    
    room = rooms.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    return {
        "success": True,
        "room": {
            "roomId": room.room_id,
            "host": room.host,
            "viewers": list(room.viewers),
            "viewerCount": len(room.viewers),
            "streamActive": room.stream_active,
            "xboxIp": room.xbox_ip
        }
    }


class XboxCommand(BaseModel):
    command: str


@router.post("/xbox/{room_id}/command")
async def send_xbox_command(room_id: str, command: XboxCommand):
    """Send command to Xbox in a room"""
    from main import manager, rooms
    
    room = rooms.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Forward command to host via WebSocket
    await manager.send_personal({
        "type": "xbox-command",
        "command": command.command
    }, room.host)
    
    return {"success": True}


class SignalingOffer(BaseModel):
    sdp: dict


@router.post("/signaling/offer")
async def signaling_offer(room_id: str, sdp: SignalingOffer):
    """WebRTC signaling - offer"""
    from main import manager, rooms
    
    room = rooms.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    await manager.broadcast_to_room({
        "type": "offer",
        "from": "server",
        "sdp": sdp.sdp
    }, room_id)
    
    return {"success": True}