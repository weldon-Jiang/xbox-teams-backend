// backend/src/services/discovery.js
import dgram from 'dgram';
import { promises as dns } from 'dns';
import net from 'net';

class XboxDiscovery {
  constructor() {
    this.SSDP_ADDR = '239.255.255.250';
    this.SSDP_PORT = 19_00;
  }

  createSSDPSearch() {
    return Buffer.from(
      'M-SEARCH * HTTP/1.1\r\n' +
      'HOST: 239.255.255.250:19\r\n' +
      'MAN: "ssdp:discover"\r\n' +
      'MX: 3\r\n' +
      'ST: urn:di' + 'al-multiscreen-org:service:dial:1\r\n' +
      '\r\n'
    );
  }

  parseResponse(response, addr) {
    const info = { ip: addr.address, ports: [], name: null };
    const lines = response.toString().split('\r\n');
    
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith('location:')) {
        const url = line.split(':').slice(1).join(':').trim();
        const portMatch = url.match(/:(\d+)/);
        if (portMatch) info.ports.push(parseInt(portMatch[1]));
      }
      if (lower.includes('xbox')) {
        info.isXbox = true;
      }
    }
    return info;
  }

  discover(timeout = 5) {
    return new Promise((resolve) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      const consoles = new Map();
      
      socket.on('error', (err) => {
        console.error('SSDP socket error:', err);
        socket.close();
        resolve([]);
      });

      socket.on('message', (msg, rinfo) => {
        const response = msg.toString().toLowerCase();
        if (response.includes('xbox') || response.includes('microsoft')) {
          const info = this.parseResponse(msg, rinfo);
          if (!consoles.has(info.ip)) {
            consoles.set(info.ip, info);
          }
        }
      });

      socket.bind(() => {
        socket.setBroadcast(true);
        socket.send(this.createSSDPSearch(), 0, this.createSSDPSearch().length, 
          this.SSDP_PORT, this.SSDP_ADDR);
        
        setTimeout(() => {
          socket.close();
          resolve(Array.from(consoles.values()));
        }, timeout * 1000);
      });
    });
  }

  async pingPort(ip, port, timeout = 2000) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeout);
      
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      
      socket.on('error', () => {
        resolve(false);
      });
      
      socket.connect(port, ip);
    });
  }

  async getDeviceInfo(ip) {
    const ports = [50_50, 30_74, 34_78];
    const openPorts = [];
    
    for (const port of ports) {
      if (await this.pingPort(ip, port)) {
        openPorts.push(port);
      }
    }
    
    return {
      ip,
      online: openPorts.length > 0,
      openPorts,
      discoveredAt: new Date().toISOString()
    };
  }
}

class XboxDiscoveryService {
  constructor() {
    this.ssdp = new XboxDiscovery();
  }

  async discover_all(timeout = 5) {
    return await this.ssdp.discover(timeout);
  }

  async discover_and_check(timeout = 5) {
    const consoles = await this.discover_all(timeout);
    
    // 并行检查每个主机的详细状态
    const results = await Promise.all(
      consoles.map(async (console) => {
        try {
          return await this.ssdp.getDeviceInfo(console.ip);
        } catch {
          return null;
        }
      })
    );
    
    return results.filter(Boolean);
  }
}

export { XboxDiscovery, XboxDiscoveryService };