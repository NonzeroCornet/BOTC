function generateRoomCode() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += letters[Math.floor(Math.random() * 26)];
  }
  return code;
}

const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const compression = require("compression");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(compression());

const roomHosts = new Map();
const roomUsernames = new Map();

app.use(express.static("public"));

io.on("connection", (socket) => {
  socket.on("host", () => {
    let roomCode;
    do {
      roomCode = generateRoomCode();
    } while (roomHosts.has(roomCode));
    socket.join(roomCode);
    roomHosts.set(roomCode, socket.id);
    socket.emit("hosted", roomCode);
  });

  socket.on("join-room", (data) => {
    const { room, username } = data;
    if (!roomHosts.has(room)) {
      socket.emit("join-error", "Room not found or no host available.");
      return;
    }
    if (!roomUsernames.has(room)) roomUsernames.set(room, new Set());
    if (roomUsernames.get(room).has(username)) {
      socket.emit("join-error", "Username already taken.");
      return;
    }
    roomUsernames.get(room).add(username);
    socket.username = username;
    socket.join(room);
    socket.emit("joined", {
      room,
      username,
      usernames: Array.from(roomUsernames.get(room)),
    });
    socket.to(room).emit("user-joined", username);
  });

  socket.on("assign-role", (data) => {
    const { room, username, role, roleData } = data;
    const roomSockets = io.sockets.adapter.rooms.get(room);
    if (roomSockets) {
      for (const socketId of roomSockets) {
        const clientSocket = io.sockets.sockets.get(socketId);
        if (clientSocket.username === username) {
          clientSocket.emit("assigned-role", { role, roleData });
          break;
        }
      }
    }
  });

  socket.on("reveal-roles", (room) => {
    io.to(room).emit("roles-revealed");
  });

  socket.on("kick-player", (data) => {
    const { room, username } = data;
    const roomSockets = io.sockets.adapter.rooms.get(room);
    if (roomSockets) {
      for (const socketId of roomSockets) {
        const clientSocket = io.sockets.sockets.get(socketId);
        if (clientSocket.username === username) {
          clientSocket.emit("kicked");
          clientSocket.disconnect(true);
          if (roomUsernames.has(room)) {
            roomUsernames.get(room).delete(username);
          }
          io.to(room).emit("user-left", username);
          break;
        }
      }
    }
  });

  socket.on("leave-room", (room) => {
    socket.to(room).emit("user-left", socket.username);
    socket.leave(room);
    if (roomHosts.get(room) === socket.id) {
      roomHosts.delete(room);
    }
    if (roomUsernames.has(room)) {
      roomUsernames.get(room).delete(socket.username);
    }
    socket.emit("left-room", room);
  });

  socket.on("rejoin", (data) => {
    const { type, room, username } = data;
    if (username) socket.username = username;
    socket.join(room);
    if (type === "host") {
      if (roomHosts.has(room)) {
        socket.emit("join-error", "Host already exists for this room.");
        return;
      }
      roomHosts.set(room, socket.id);
      socket.emit("reconnected-host", room);
    } else if (type === "join") {
      if (!roomHosts.has(room)) {
        socket.emit("join-error", "Room not found.");
        return;
      }
      if (!roomUsernames.has(room)) roomUsernames.set(room, new Set());
      if (username && roomUsernames.get(room).has(username)) {
        socket.emit("join-error", "Username already taken.");
        return;
      }
      roomUsernames.get(room).add(username);
      socket.emit("reconnected-join", {
        room,
        username,
        usernames: Array.from(roomUsernames.get(room)),
      });
      socket.to(room).emit("user-joined", username);
    }
  });

  socket.on("disconnect", () => {
    for (const [room, hostId] of roomHosts) {
      if (hostId === socket.id) {
        roomHosts.delete(room);
        break;
      }
    }
    if (socket.username) {
      for (const [room, usernames] of roomUsernames) {
        if (usernames.has(socket.username)) {
          usernames.delete(socket.username);
          break;
        }
      }
    }
  });
});

server.listen(80);
