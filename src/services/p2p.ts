import { Peer, DataConnection } from 'peerjs';

let peer: Peer | null = null;
let peerId: string | null = null;
const connections: Map<string, DataConnection> = new Map();
const listeners: Set<() => void> = new Set();
const retryCounts: Map<string, number> = new Map();

function notifyListeners() {
  listeners.forEach(l => {
    try {
      l();
    } catch (e) {
      // ignore
    }
  });
}

export function subscribeToP2PChanges(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function getActivePeers(): string[] {
  const active: string[] = [];
  connections.forEach((conn, id) => {
    if (conn.open) {
      active.push(id);
    }
  });
  return active;
}



let dataHandler: ((peerId: string, data: any) => void) | null = null;

export async function initializeP2P(id: string, onData: (peerId: string, data: any) => void): Promise<string> {
  dataHandler = onData;
  if (peer) {
    if (peerId === id) return peerId!;
    peer.destroy();
    connections.clear();
  }
  
  peer = new Peer(id, {
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    },
  });

  peer.on('connection', (conn) => {
    conn.on('open', () => {
        connections.set(conn.peer, conn);
        retryCounts.set(conn.peer, 0); // Reset retry counts on success
        notifyListeners();
    });
    conn.on('data', (data: any) => {
        if (dataHandler) dataHandler(conn.peer, data);
    });
    const handleFailure = () => {
        connections.delete(conn.peer);
        notifyListeners();
    };
    conn.on('close', handleFailure);
    conn.on('error', handleFailure);
  });

  return new Promise((resolve) => {
    peer!.on('open', (id) => {
      peerId = id;
      resolve(id);
    });
  });
}

export function connectToPeer(id: string, onData: (peerId: string, data: any) => void) {
    if (!peer || id === peerId) return;
    
    // Check if we already have an open or active connection to prevent duplicate attempts
    const existing = connections.get(id);
    if (existing && existing.open) {
        return;
    }

    const maxRetries = 10;
    const currentRetries = retryCounts.get(id) || 0;

    const conn = peer.connect(id, {
      reliable: true
    });

    conn.on('open', () => {
        connections.set(id, conn);
        retryCounts.set(id, 0); // Reset retry count upon successful connection
        notifyListeners();
    });

    conn.on('data', (data: any) => {
        if (dataHandler) dataHandler(id, data);
    });

    const handleFailure = () => {
        connections.delete(id);
        notifyListeners();

        // Retry connecting robustly if under the retry limit
        if (currentRetries < maxRetries) {
            retryCounts.set(id, currentRetries + 1);
            setTimeout(() => {
                connectToPeer(id, onData);
            }, 1500 + Math.random() * 1000); // Randomized exponential backoff to avoid connection collisions
        }
    };

    conn.on('close', handleFailure);
    conn.on('error', handleFailure);
}

export function broadcast(data: any) {
    connections.forEach(conn => {
        if (conn.open) {
          try {
            conn.send(data);
          } catch (e) {
            // ignore
          }
        }
    });
}

export function getPeer(): Peer | null {
  return peer;
}
