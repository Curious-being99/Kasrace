import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { Server } from 'socket.io';

interface Player {
  id: string;
  name: string;
  color: string;
  isHost?: boolean;
  x?: number;
  y?: number;
  angle?: number;
  speed?: number;
  laps?: number;
  bestLapTime?: number;
  nitro?: number;
  drifting?: boolean;
  isCrashed?: boolean;
  carConfig?: any;
  isReady?: boolean;
  paid?: boolean;
}

interface Room {
  id: string;
  hostId: string;
  hostName: string;
  hostColor: string;
  players: Record<string, Player>;
  isStarted: boolean;
  createdAt: number;
}

const rooms: Record<string, Room> = {};
const MAX_ROOMS = 200;
const MAX_PLAYERS_PER_ROOM = 12;

// Socket rate limiting map (socketId -> telemetry stats)
const socketRateLimits = new Map<string, { lastSec: number; eventCount: number; lastRoomCreate: number }>();

// Input Sanitization Helpers
function sanitizeText(input: unknown, maxLength = 24): string {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/[<>&'"]/g, '') // Strip HTML tags/entities to prevent XSS
    .substring(0, maxLength);
}

function sanitizeColor(input: unknown, defaultColor = '#3b82f6'): string {
  if (typeof input !== 'string') return defaultColor;
  const cleaned = input.trim();
  if (/^#([0-9A-F]{3}){1,2}$/i.test(cleaned)) {
    return cleaned;
  }
  return defaultColor;
}

function sanitizeObject(obj: any): any {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return {};
  }
  const clean: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    // Prototype pollution prevention
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    const val = obj[key];
    if (typeof val === 'number') {
      if (Number.isFinite(val)) clean[key] = val;
    } else if (typeof val === 'boolean') {
      clean[key] = val;
    } else if (typeof val === 'string') {
      clean[key] = sanitizeText(val, 60);
    } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      clean[key] = sanitizeObject(val);
    }
  }
  return clean;
}

function getPublicRoomsList() {
  return Object.values(rooms)
    .filter((r) => !r.isStarted)
    .map((r) => ({
      id: r.id,
      hostName: r.hostName,
      hostColor: r.hostColor,
      racersCount: Object.keys(r.players).length,
    }));
}

const PORT = 3000;

const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

// Security headers applied to all HTTP responses
const securityHeaders: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

const server = http.createServer((req, res) => {
  // Support CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, securityHeaders);
    res.end();
    return;
  }

  // Method Guard: Only allow GET and HEAD requests for static server
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain', ...securityHeaders });
    res.end('405 Method Not Allowed');
    return;
  }

  // API route health check
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...securityHeaders });
    res.end(JSON.stringify({ status: 'ok', activeRooms: Object.keys(rooms).length }));
    return;
  }

  const rawUrl = req.url || '/';
  const urlPath = rawUrl.split('?')[0].split('#')[0];

  if (urlPath === '/racing_music.mp3' || urlPath === '/new_racing_music.mp3' || urlPath === '/api/music') {
    const candidatePaths = [
      path.resolve(process.cwd(), 'public', 'racing_music.mp3'),
      path.resolve(process.cwd(), 'racing_music.mp3'),
      path.resolve(process.cwd(), 'public', 'new_racing_music.mp3'),
      path.resolve(process.cwd(), 'new_racing_music.mp3'),
      path.resolve(process.cwd(), 'dist', 'racing_music.mp3'),
      path.resolve(process.cwd(), 'dist', 'new_racing_music.mp3'),
    ];
    const musicFilePath = candidatePaths.find((p) => fs.existsSync(p));
    if (musicFilePath) {
      try {
        const stat = fs.statSync(musicFilePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          let start = parseInt(parts[0], 10);
          let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

          // Handle range suffix like bytes=-500 (last 500 bytes)
          if (isNaN(start)) {
            start = fileSize - end;
            end = fileSize - 1;
          }

          if (start < 0) start = 0;
          if (end >= fileSize) end = fileSize - 1;

          if (isNaN(start) || isNaN(end) || start > end) {
            res.writeHead(416, { 'Content-Range': `bytes */${fileSize}`, ...securityHeaders });
            res.end('416 Range Not Satisfiable');
            return;
          }

          const chunksize = (end - start) + 1;
          const file = fs.createReadStream(musicFilePath, { start, end });
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'audio/mpeg',
            ...securityHeaders,
          });
          file.pipe(res);
        } else {
          res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'audio/mpeg',
            'Accept-Ranges': 'bytes',
            ...securityHeaders,
          });
          fs.createReadStream(musicFilePath).pipe(res);
        }
        return;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain', ...securityHeaders });
        res.end('Internal Server Error');
        return;
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain', ...securityHeaders });
      res.end('Music Not Found');
      return;
    }
  }

  // Path Traversal Protected Static File Serving
  const distPath = path.resolve(process.cwd(), 'dist');
  const publicPath = path.resolve(process.cwd(), 'public');

  let safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '') {
    safePath = '/index.html';
  }

  // Prevent accessing hidden files (.env, .git, etc.)
  if (path.basename(safePath).startsWith('.')) {
    res.writeHead(403, { 'Content-Type': 'text/plain', ...securityHeaders });
    res.end('403 Forbidden');
    return;
  }

  // Ensure resolved path is strictly within distPath or publicPath
  let filePath = path.resolve(distPath, '.' + safePath);

  if (!filePath.startsWith(distPath)) {
    res.writeHead(403, { 'Content-Type': 'text/plain', ...securityHeaders });
    res.end('403 Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // Check public folder as secondary fallback
    const publicFilePath = path.resolve(publicPath, '.' + safePath);
    if (publicFilePath.startsWith(publicPath) && fs.existsSync(publicFilePath) && !fs.statSync(publicFilePath).isDirectory()) {
      filePath = publicFilePath;
    } else {
      // Only fallback to index.html for SPA page navigation routes without file extensions
      const ext = path.extname(safePath);
      if (!ext || ext === '.html') {
        filePath = path.join(distPath, 'index.html');
        if (!filePath.startsWith(distPath) || !fs.existsSync(filePath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain', ...securityHeaders });
          res.end('404 Not Found');
          return;
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain', ...securityHeaders });
        res.end('404 Not Found');
        return;
      }
    }
  }

  try {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      let start = parseInt(parts[0], 10);
      let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      // Handle range suffix like bytes=-500 (last 500 bytes)
      if (isNaN(start)) {
        start = fileSize - end;
        end = fileSize - 1;
      }

      if (start < 0) start = 0;
      if (end >= fileSize) end = fileSize - 1;

      if (isNaN(start) || isNaN(end) || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}`, ...securityHeaders });
        res.end('416 Range Not Satisfiable');
        return;
      }

      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        ...securityHeaders,
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        ...securityHeaders,
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain', ...securityHeaders });
    res.end('404 Not Found');
  }
});

const io = new Server(server, {
  maxHttpBufferSize: 1e6, // 1MB payload buffer limit against memory DoS
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const broadcastPublicRooms = () => {
  io.emit('publicRoomsList', getPublicRoomsList());
};

const leaveExistingRooms = (socket: any) => {
  for (const rId of Object.keys(rooms)) {
    const room = rooms[rId];
    if (room.players[socket.id]) {
      delete room.players[socket.id];
      try {
        socket.leave(rId);
      } catch (e) {
        // Safe catch if socket is not in room or already disconnected
      }
      socket.to(rId).emit('playerDisconnected', socket.id);

      const remainingPlayerIds = Object.keys(room.players);
      if (remainingPlayerIds.length === 0) {
        delete rooms[rId];
      } else {
        if (room.hostId === socket.id) {
          const newHostId = remainingPlayerIds[0];
          room.hostId = newHostId;
          room.players[newHostId].isHost = true;
          io.to(rId).emit('hostMigrated', newHostId);
        }
        io.to(rId).emit('roomPlayersUpdated', room.players);
      }
    }
  }
  broadcastPublicRooms();
};

// Rate check helper per socket connection
function isRateLimited(socketId: string, maxEventsPerSec = 80): boolean {
  const now = Date.now();
  let stats = socketRateLimits.get(socketId);
  if (!stats) {
    stats = { lastSec: now, eventCount: 1, lastRoomCreate: 0 };
    socketRateLimits.set(socketId, stats);
    return false;
  }

  if (now - stats.lastSec > 1000) {
    stats.lastSec = now;
    stats.eventCount = 1;
    return false;
  }

  stats.eventCount++;
  return stats.eventCount > maxEventsPerSec;
}

io.on('connection', (socket) => {
  socketRateLimits.set(socket.id, { lastSec: Date.now(), eventCount: 0, lastRoomCreate: 0 });

  // Send current public rooms immediately on connect
  socket.emit('publicRoomsList', getPublicRoomsList());

  socket.on('getPublicRooms', () => {
    if (isRateLimited(socket.id)) return;
    socket.emit('publicRoomsList', getPublicRoomsList());
  });

  socket.on('createRoom', (data?: { name?: string; color?: string; carConfig?: any }) => {
    if (isRateLimited(socket.id)) return;

    // Rate limit room creation per socket (1 per 3 seconds)
    const stats = socketRateLimits.get(socket.id);
    const now = Date.now();
    if (stats && now - stats.lastRoomCreate < 3000) {
      socket.emit('error', 'Please wait before creating another room');
      return;
    }
    if (stats) stats.lastRoomCreate = now;

    // Check maximum active rooms server limit
    if (Object.keys(rooms).length >= MAX_ROOMS) {
      socket.emit('error', 'Server is currently at maximum room capacity');
      return;
    }

    // Leave any existing rooms first cleanly
    leaveExistingRooms(socket);

    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const playerName = sanitizeText(data?.name) || 'Racer 1';
    const playerColor = sanitizeColor(data?.color, '#3b82f6');
    const cleanCarConfig = sanitizeObject(data?.carConfig);

    const hostPlayer: Player = {
      id: socket.id,
      name: playerName,
      color: playerColor,
      isHost: true,
      carConfig: cleanCarConfig,
      isReady: false,
    };

    rooms[roomId] = {
      id: roomId,
      hostId: socket.id,
      hostName: playerName,
      hostColor: playerColor,
      players: { [socket.id]: hostPlayer },
      isStarted: false,
      createdAt: Date.now(),
    };

    socket.join(roomId);
    socket.emit('roomCreated', {
      roomId,
      players: rooms[roomId].players,
      isHost: true,
    });

    broadcastPublicRooms();
  });

  socket.on('joinRoom', (data: { roomId: string; name?: string; color?: string; carConfig?: any }) => {
    if (isRateLimited(socket.id)) return;

    const rawRoomId = typeof data?.roomId === 'string' ? data.roomId : '';
    const targetRoomId = sanitizeText(rawRoomId, 12).toUpperCase();

    if (!targetRoomId) {
      socket.emit('error', 'Invalid room ID');
      return;
    }

    let room = rooms[targetRoomId];
    if (!room) {
      // Check maximum active rooms limit before auto-creating target
      if (Object.keys(rooms).length >= MAX_ROOMS) {
        socket.emit('error', 'Maximum server room limit reached');
        return;
      }

      const playerName = 'Racer 1';
      room = {
        id: targetRoomId,
        hostId: 'peer_host',
        hostName: playerName,
        hostColor: '#f59e0b',
        players: {},
        isStarted: false,
        createdAt: Date.now(),
      };
      rooms[targetRoomId] = room;
    }

    if (room.isStarted) {
      socket.emit('error', 'Race is already in progress');
      return;
    }

    if (Object.keys(room.players).length >= MAX_PLAYERS_PER_ROOM) {
      socket.emit('error', 'Room has reached maximum racer limit');
      return;
    }

    // Leave any existing rooms cleanly first
    leaveExistingRooms(socket);

    const existingCount = Object.keys(room.players).length + 1;
    const playerName = sanitizeText(data?.name) || `Racer ${existingCount}`;
    const playerColor = sanitizeColor(data?.color, existingCount === 2 ? '#10b981' : existingCount === 3 ? '#f59e0b' : '#ec4899');
    const cleanCarConfig = sanitizeObject(data?.carConfig);

    const joiningPlayer: Player = {
      id: socket.id,
      name: playerName,
      color: playerColor,
      isHost: room.hostId === socket.id,
      carConfig: cleanCarConfig,
      isReady: false,
    };

    room.players[socket.id] = joiningPlayer;
    socket.join(targetRoomId);

    socket.emit('roomJoined', {
      roomId: targetRoomId,
      players: room.players,
      isHost: room.hostId === socket.id,
    });

    socket.to(targetRoomId).emit('playerJoinedRoom', joiningPlayer);
    broadcastPublicRooms();
  });

  socket.on('handshakePeer', (data: { targetRoomId: string }) => {
    if (isRateLimited(socket.id)) return;
    if (typeof data?.targetRoomId === 'string') {
      socket.emit('joinRoom', { roomId: sanitizeText(data.targetRoomId, 12) });
    }
  });

  socket.on('startGame', () => {
    if (isRateLimited(socket.id)) return;
    const room = Object.values(rooms).find((r) => r.hostId === socket.id || r.players[socket.id]?.isHost);
    if (room) {
      room.isStarted = true;
      io.to(room.id).emit('gameStarted', room.players);
      broadcastPublicRooms();
    }
  });

  socket.on('rematch', () => {
    if (isRateLimited(socket.id)) return;
    const room = Object.values(rooms).find((r) => r.players[socket.id]);
    if (room) {
      io.to(room.id).emit('raceRestarted');
    }
  });

  socket.on('playerReady', (data?: { isReady: boolean }) => {
    if (isRateLimited(socket.id)) return;
    const isReady = !!data?.isReady;
    const room = Object.values(rooms).find((r) => r.players[socket.id]);
    if (room && room.players[socket.id]) {
      room.players[socket.id].isReady = isReady;
      io.to(room.id).emit('roomPlayersUpdated', room.players);
    }
  });

  socket.on('updatePlayerState', (state) => {
    if (isRateLimited(socket.id)) return;
    const cleanState = sanitizeObject(state);
    const room = Object.values(rooms).find((r) => r.players[socket.id]);
    if (room && room.players[socket.id]) {
      room.players[socket.id] = { ...room.players[socket.id], ...cleanState };
      socket.to(room.id).emit('playerStateUpdated', { id: socket.id, state: cleanState });
      io.to(room.id).emit('roomPlayersUpdated', room.players);
    }
  });

  socket.on('updateCarConfig', (carConfig) => {
    if (isRateLimited(socket.id)) return;
    const cleanConfig = sanitizeObject(carConfig);
    const room = Object.values(rooms).find((r) => r.players[socket.id]);
    if (room && room.players[socket.id]) {
      room.players[socket.id].carConfig = cleanConfig;
      if (cleanConfig?.color) {
        room.players[socket.id].color = sanitizeColor(cleanConfig.color, room.players[socket.id].color);
      }
      socket.to(room.id).emit('playerStateUpdated', { 
        id: socket.id, 
        state: { carConfig: cleanConfig, color: room.players[socket.id].color } 
      });
      io.to(room.id).emit('roomPlayersUpdated', room.players);
    }
  });

  socket.on('playerMovement', (state) => {
    if (isRateLimited(socket.id, 120)) return;
    if (!state || typeof state !== 'object') return;

    // Validate coordinates/telemetry numbers
    const safeMovement: Record<string, any> = {};
    for (const k of ['x', 'y', 'angle', 'speed', 'nitro', 'drifting', 'isCrashed']) {
      if (k in state) {
        const val = state[k];
        if (typeof val === 'number' && Number.isFinite(val)) {
          safeMovement[k] = val;
        } else if (typeof val === 'boolean') {
          safeMovement[k] = val;
        }
      }
    }

    const room = Object.values(rooms).find((r) => r.players[socket.id]);
    if (room && room.players[socket.id]) {
      room.players[socket.id] = { ...room.players[socket.id], ...safeMovement };
      const playerRecord = room.players[socket.id];
      socket.to(room.id).emit('playerMoved', playerRecord);
      socket.to(room.id).emit('playerStateUpdated', { id: socket.id, state: playerRecord });
    }
  });

  socket.on('lapFinished', (lapTime: number) => {
    if (isRateLimited(socket.id)) return;

    // Validate lap time (must be a valid positive number >= 1000ms to prevent cheat/exploit manipulation)
    if (typeof lapTime !== 'number' || !Number.isFinite(lapTime) || lapTime < 1000) {
      return;
    }

    const room = Object.values(rooms).find((r) => r.players[socket.id]);
    if (room && room.players[socket.id]) {
      const p = room.players[socket.id];
      p.laps = (p.laps || 0) + 1;
      if (!p.bestLapTime || lapTime < p.bestLapTime) {
        p.bestLapTime = lapTime;
      }
      io.to(room.id).emit('lapUpdate', {
        id: socket.id,
        laps: p.laps,
        bestLapTime: p.bestLapTime,
        name: p.name,
      });

      if (p.laps >= 3) {
        io.to(room.id).emit('raceWon', {
          winnerId: socket.id,
          winnerName: p.name,
          winnerColor: p.color,
        });
      }
    }
  });

  socket.on('disconnect', () => {
    socketRateLimits.delete(socket.id);

    for (const roomId of Object.keys(rooms)) {
      const room = rooms[roomId];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        socket.to(roomId).emit('playerDisconnected', socket.id);

        const remainingPlayerIds = Object.keys(room.players);
        if (remainingPlayerIds.length === 0) {
          delete rooms[roomId];
        } else if (room.hostId === socket.id) {
          const newHostId = remainingPlayerIds[0];
          room.hostId = newHostId;
          room.players[newHostId].isHost = true;
          io.to(roomId).emit('hostMigrated', newHostId);
        }
      }
    }
    broadcastPublicRooms();
  });
});

// Stale room auto-cleanup worker (runs every 60 seconds)
setInterval(() => {
  const now = Date.now();
  for (const roomId of Object.keys(rooms)) {
    const room = rooms[roomId];
    if (Object.keys(room.players).length === 0 || (now - room.createdAt > 3600000 && !room.isStarted)) {
      delete rooms[roomId];
    }
  }
}, 60000);

server.listen(PORT, '0.0.0.0', () => {
  // Server running securely
});

