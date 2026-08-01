var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_node_http = __toESM(require("node:http"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_node_fs = __toESM(require("node:fs"), 1);
var import_socket = require("socket.io");
var rooms = {};
var MAX_ROOMS = 200;
var MAX_PLAYERS_PER_ROOM = 12;
var socketRateLimits = /* @__PURE__ */ new Map();
function sanitizeText(input, maxLength = 24) {
  if (typeof input !== "string") return "";
  return input.trim().replace(/[<>&'"]/g, "").substring(0, maxLength);
}
function sanitizeColor(input, defaultColor = "#3b82f6") {
  if (typeof input !== "string") return defaultColor;
  const cleaned = input.trim();
  if (/^#([0-9A-F]{3}){1,2}$/i.test(cleaned)) {
    return cleaned;
  }
  return defaultColor;
}
function sanitizeObject(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return {};
  }
  const clean = {};
  for (const key of Object.keys(obj)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    const val = obj[key];
    if (typeof val === "number") {
      if (Number.isFinite(val)) clean[key] = val;
    } else if (typeof val === "boolean") {
      clean[key] = val;
    } else if (typeof val === "string") {
      clean[key] = sanitizeText(val, 60);
    } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      clean[key] = sanitizeObject(val);
    }
  }
  return clean;
}
function getPublicRoomsList() {
  return Object.values(rooms).filter((r) => !r.isStarted).map((r) => ({
    id: r.id,
    hostName: r.hostName,
    hostColor: r.hostColor,
    racersCount: Object.keys(r.players).length
  }));
}
var PORT = 3e3;
var mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm"
};
var securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin"
};
var server = import_node_http.default.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain", ...securityHeaders });
    res.end("405 Method Not Allowed");
    return;
  }
  if (req.url === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json", ...securityHeaders });
    res.end(JSON.stringify({ status: "ok", activeRooms: Object.keys(rooms).length }));
    return;
  }
  const distPath = import_node_path.default.resolve(process.cwd(), "dist");
  const publicPath = import_node_path.default.resolve(process.cwd(), "public");
  const rawUrl = req.url || "/";
  const urlPath = rawUrl.split("?")[0].split("#")[0];
  let safePath = import_node_path.default.normalize(urlPath).replace(/^(\.\.[\/\\])+/, "");
  if (safePath === "/" || safePath === "") {
    safePath = "/index.html";
  }
  if (import_node_path.default.basename(safePath).startsWith(".")) {
    res.writeHead(403, { "Content-Type": "text/plain", ...securityHeaders });
    res.end("403 Forbidden");
    return;
  }
  let filePath = import_node_path.default.resolve(distPath, "." + safePath);
  if (!filePath.startsWith(distPath)) {
    res.writeHead(403, { "Content-Type": "text/plain", ...securityHeaders });
    res.end("403 Forbidden");
    return;
  }
  if (!import_node_fs.default.existsSync(filePath) || import_node_fs.default.statSync(filePath).isDirectory()) {
    const publicFilePath = import_node_path.default.resolve(publicPath, "." + safePath);
    if (publicFilePath.startsWith(publicPath) && import_node_fs.default.existsSync(publicFilePath) && !import_node_fs.default.statSync(publicFilePath).isDirectory()) {
      filePath = publicFilePath;
    } else {
      const ext = import_node_path.default.extname(safePath);
      if (!ext || ext === ".html") {
        filePath = import_node_path.default.join(distPath, "index.html");
        if (!filePath.startsWith(distPath) || !import_node_fs.default.existsSync(filePath)) {
          res.writeHead(404, { "Content-Type": "text/plain", ...securityHeaders });
          res.end("404 Not Found");
          return;
        }
      } else {
        res.writeHead(404, { "Content-Type": "text/plain", ...securityHeaders });
        res.end("404 Not Found");
        return;
      }
    }
  }
  import_node_fs.default.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain", ...securityHeaders });
      res.end("404 Not Found");
    } else {
      const ext = import_node_path.default.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": contentType, ...securityHeaders });
      res.end(data);
    }
  });
});
var io = new import_socket.Server(server, {
  maxHttpBufferSize: 1e6,
  // 1MB payload buffer limit against memory DoS
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
var broadcastPublicRooms = () => {
  io.emit("publicRoomsList", getPublicRoomsList());
};
function isRateLimited(socketId, maxEventsPerSec = 80) {
  const now = Date.now();
  let stats = socketRateLimits.get(socketId);
  if (!stats) {
    stats = { lastSec: now, eventCount: 1, lastRoomCreate: 0 };
    socketRateLimits.set(socketId, stats);
    return false;
  }
  if (now - stats.lastSec > 1e3) {
    stats.lastSec = now;
    stats.eventCount = 1;
    return false;
  }
  stats.eventCount++;
  return stats.eventCount > maxEventsPerSec;
}
io.on("connection", (socket) => {
  socketRateLimits.set(socket.id, { lastSec: Date.now(), eventCount: 0, lastRoomCreate: 0 });
  socket.emit("publicRoomsList", getPublicRoomsList());
  socket.on("getPublicRooms", () => {
    if (isRateLimited(socket.id)) return;
    socket.emit("publicRoomsList", getPublicRoomsList());
  });
  socket.on("createRoom", (data) => {
    if (isRateLimited(socket.id)) return;
    const stats = socketRateLimits.get(socket.id);
    const now = Date.now();
    if (stats && now - stats.lastRoomCreate < 3e3) {
      socket.emit("error", "Please wait before creating another room");
      return;
    }
    if (stats) stats.lastRoomCreate = now;
    if (Object.keys(rooms).length >= MAX_ROOMS) {
      socket.emit("error", "Server is currently at maximum room capacity");
      return;
    }
    for (const rId of Object.keys(rooms)) {
      if (rooms[rId].players[socket.id]) {
        delete rooms[rId].players[socket.id];
        if (Object.keys(rooms[rId].players).length === 0) {
          delete rooms[rId];
        }
      }
    }
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const playerName = sanitizeText(data?.name) || "Racer 1";
    const playerColor = sanitizeColor(data?.color, "#3b82f6");
    const cleanCarConfig = sanitizeObject(data?.carConfig);
    const hostPlayer = {
      id: socket.id,
      name: playerName,
      color: playerColor,
      isHost: true,
      carConfig: cleanCarConfig
    };
    rooms[roomId] = {
      id: roomId,
      hostId: socket.id,
      hostName: playerName,
      hostColor: playerColor,
      players: { [socket.id]: hostPlayer },
      isStarted: false,
      createdAt: Date.now()
    };
    socket.join(roomId);
    socket.emit("roomCreated", {
      roomId,
      players: rooms[roomId].players,
      isHost: true
    });
    broadcastPublicRooms();
  });
  socket.on("joinRoom", (data) => {
    if (isRateLimited(socket.id)) return;
    const rawRoomId = typeof data?.roomId === "string" ? data.roomId : "";
    const targetRoomId = sanitizeText(rawRoomId, 12).toUpperCase();
    if (!targetRoomId) {
      socket.emit("error", "Invalid room ID");
      return;
    }
    let room = rooms[targetRoomId];
    if (!room) {
      if (Object.keys(rooms).length >= MAX_ROOMS) {
        socket.emit("error", "Maximum server room limit reached");
        return;
      }
      const playerName2 = "Racer 1";
      room = {
        id: targetRoomId,
        hostId: "peer_host",
        hostName: playerName2,
        hostColor: "#f59e0b",
        players: {},
        isStarted: false,
        createdAt: Date.now()
      };
      rooms[targetRoomId] = room;
    }
    if (room.isStarted) {
      socket.emit("error", "Race is already in progress");
      return;
    }
    if (Object.keys(room.players).length >= MAX_PLAYERS_PER_ROOM) {
      socket.emit("error", "Room has reached maximum racer limit");
      return;
    }
    const existingCount = Object.keys(room.players).length + 1;
    const playerName = sanitizeText(data?.name) || `Racer ${existingCount}`;
    const playerColor = sanitizeColor(data?.color, existingCount === 2 ? "#10b981" : existingCount === 3 ? "#f59e0b" : "#ec4899");
    const cleanCarConfig = sanitizeObject(data?.carConfig);
    const joiningPlayer = {
      id: socket.id,
      name: playerName,
      color: playerColor,
      isHost: room.hostId === socket.id,
      carConfig: cleanCarConfig
    };
    room.players[socket.id] = joiningPlayer;
    socket.join(targetRoomId);
    socket.emit("roomJoined", {
      roomId: targetRoomId,
      players: room.players,
      isHost: room.hostId === socket.id
    });
    socket.to(targetRoomId).emit("playerJoinedRoom", joiningPlayer);
    broadcastPublicRooms();
  });
  socket.on("handshakePeer", (data) => {
    if (isRateLimited(socket.id)) return;
    if (typeof data?.targetRoomId === "string") {
      socket.emit("joinRoom", { roomId: sanitizeText(data.targetRoomId, 12) });
    }
  });
  socket.on("startGame", () => {
    if (isRateLimited(socket.id)) return;
    const room = Object.values(rooms).find((r) => r.hostId === socket.id || r.players[socket.id]?.isHost);
    if (room) {
      room.isStarted = true;
      io.to(room.id).emit("gameStarted", room.players);
      broadcastPublicRooms();
    }
  });
  socket.on("updatePlayerState", (state) => {
    if (isRateLimited(socket.id)) return;
    const cleanState = sanitizeObject(state);
    const room = Object.values(rooms).find((r) => r.players[socket.id]);
    if (room && room.players[socket.id]) {
      room.players[socket.id] = { ...room.players[socket.id], ...cleanState };
      socket.to(room.id).emit("playerStateUpdated", { id: socket.id, state: cleanState });
    }
  });
  socket.on("updateCarConfig", (carConfig) => {
    if (isRateLimited(socket.id)) return;
    const cleanConfig = sanitizeObject(carConfig);
    const room = Object.values(rooms).find((r) => r.players[socket.id]);
    if (room && room.players[socket.id]) {
      room.players[socket.id].carConfig = cleanConfig;
      if (cleanConfig?.color) {
        room.players[socket.id].color = sanitizeColor(cleanConfig.color, room.players[socket.id].color);
      }
      socket.to(room.id).emit("playerStateUpdated", {
        id: socket.id,
        state: { carConfig: cleanConfig, color: room.players[socket.id].color }
      });
    }
  });
  socket.on("playerMovement", (state) => {
    if (isRateLimited(socket.id, 120)) return;
    if (!state || typeof state !== "object") return;
    const safeMovement = {};
    for (const k of ["x", "y", "angle", "speed", "nitro", "drifting", "isCrashed"]) {
      if (k in state) {
        const val = state[k];
        if (typeof val === "number" && Number.isFinite(val)) {
          safeMovement[k] = val;
        } else if (typeof val === "boolean") {
          safeMovement[k] = val;
        }
      }
    }
    const room = Object.values(rooms).find((r) => r.players[socket.id]);
    if (room && room.players[socket.id]) {
      room.players[socket.id] = { ...room.players[socket.id], ...safeMovement };
      socket.to(room.id).emit("playerMoved", { id: socket.id, ...safeMovement });
      socket.to(room.id).emit("playerStateUpdated", { id: socket.id, state: safeMovement });
    }
  });
  socket.on("lapFinished", (lapTime) => {
    if (isRateLimited(socket.id)) return;
    if (typeof lapTime !== "number" || !Number.isFinite(lapTime) || lapTime < 1e3) {
      return;
    }
    const room = Object.values(rooms).find((r) => r.players[socket.id]);
    if (room && room.players[socket.id]) {
      const p = room.players[socket.id];
      p.laps = (p.laps || 0) + 1;
      if (!p.bestLapTime || lapTime < p.bestLapTime) {
        p.bestLapTime = lapTime;
      }
      io.to(room.id).emit("lapUpdate", {
        id: socket.id,
        laps: p.laps,
        bestLapTime: p.bestLapTime,
        name: p.name
      });
      if (p.laps >= 3) {
        io.to(room.id).emit("raceWon", {
          winnerId: socket.id,
          winnerName: p.name,
          winnerColor: p.color
        });
      }
    }
  });
  socket.on("disconnect", () => {
    socketRateLimits.delete(socket.id);
    for (const roomId of Object.keys(rooms)) {
      const room = rooms[roomId];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        socket.to(roomId).emit("playerDisconnected", socket.id);
        const remainingPlayerIds = Object.keys(room.players);
        if (remainingPlayerIds.length === 0) {
          delete rooms[roomId];
        } else if (room.hostId === socket.id) {
          const newHostId = remainingPlayerIds[0];
          room.hostId = newHostId;
          room.players[newHostId].isHost = true;
          io.to(roomId).emit("hostMigrated", newHostId);
        }
      }
    }
    broadcastPublicRooms();
  });
});
setInterval(() => {
  const now = Date.now();
  for (const roomId of Object.keys(rooms)) {
    const room = rooms[roomId];
    if (Object.keys(room.players).length === 0 || now - room.createdAt > 36e5 && !room.isStarted) {
      delete rooms[roomId];
    }
  }
}, 6e4);
server.listen(PORT, "0.0.0.0", () => {
});
//# sourceMappingURL=server.cjs.map
