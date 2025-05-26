// whiteboard-backend/index.js

require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const connectDB = require('./db');
const WhiteboardRoom = require('./models/WhiteboardRoom');

const app = express();
const server = http.createServer(app);

const FE_ALLOWED_ORIGINS = [
  process.env.FE_HOST || 'http://localhost:3000',
  process.env.PC_IP_FRONTEND || 'http://localhost:3000'
];

app.use(cors({
  origin: FE_ALLOWED_ORIGINS,
  methods: ["GET", "POST"]
}));

const io = socketIo(server, {
  cors: {
    origin: FE_ALLOWED_ORIGINS,
    methods: ["GET", "POST"]
  }
});

connectDB();

const ROOM_DESTRUCTION_DELAY_MS = 50 * 1000;
const roomDestructionTimers = {};

const startRoomDestructionTimer = (roomName) => {
  if (roomDestructionTimers[roomName]) {
    clearTimeout(roomDestructionTimers[roomName]);
  }
  console.log(`[Timer] Room "${roomName}" is empty. Starting destruction timer for ${ROOM_DESTRUCTION_DELAY_MS / 1000} seconds.`);
  roomDestructionTimers[roomName] = setTimeout(async () => {
    const clientsInRoom = io.sockets.adapter.rooms.get(roomName);
    if (!clientsInRoom || clientsInRoom.size === 0) {
      console.log(`[Timer] Room "${roomName}" has been empty for ${ROOM_DESTRUCTION_DELAY_MS / 1000} seconds. Destroying...`);
      try {
        await WhiteboardRoom.deleteOne({ room_name: roomName });
        console.log(`[DB] Room "${roomName}" data deleted from database.`);
        io.emit('roomDestroyed', roomName);
      } catch (error) {
        console.error(`[DB Error] Failed to delete room "${roomName}" from database:`, error);
      }
      delete roomDestructionTimers[roomName];
    } else {
      console.log(`[Timer] Room "${roomName}" is no longer empty. Cancelling destruction.`);
      delete roomDestructionTimers[roomName];
    }
  }, ROOM_DESTRUCTION_DELAY_MS);
};

const cancelRoomDestructionTimer = (roomName) => {
  if (roomDestructionTimers[roomName]) {
    clearTimeout(roomDestructionTimers[roomName]);
    delete roomDestructionTimers[roomName];
    console.log(`[Timer] Destruction timer for room "${roomName}" cancelled.`);
  }
};

const checkRoomEmptinessAndManageTimer = (roomName) => {
  const clientsInRoom = io.sockets.adapter.rooms.get(roomName);
  if (!clientsInRoom || clientsInRoom.size === 0) {
    if (!roomDestructionTimers[roomName]) {
      startRoomDestructionTimer(roomName);
    }
  } else {
    cancelRoomDestructionTimer(roomName);
  }
};


io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  const username = `Guest-${Math.random().toString(36).substr(2, 4)}`;
  socket.data.username = username;
  socket.data.currentRoom = null;

  socket.on('joinRoom', async (roomName) => {
    Object.keys(socket.rooms).forEach(room => {
      if (room !== socket.id) {
        socket.leave(room);
        checkRoomEmptinessAndManageTimer(room);
      }
    });

    socket.join(roomName);
    socket.data.currentRoom = roomName;
    console.log(`Socket ${socket.id} (${socket.data.username}) joined room: ${roomName}`);

    cancelRoomDestructionTimer(roomName);

    try {
      const room = await WhiteboardRoom.findOneAndUpdate(
        { room_name: roomName },
        { $setOnInsert: { whiteboard_state: [], chat_messages: [] } },
        { upsert: true, new: true }
      );

      socket.emit('whiteboardState', {
        lines: room.whiteboard_state,
        messages: room.chat_messages
      });
      console.log(`Sent room state for ${roomName} to ${socket.id} (from MongoDB).`);

      socket.broadcast.to(roomName).emit('userJoined', socket.data.username);
    } catch (error) {
      console.error(`MongoDB error joining room ${roomName}:`, error);
      socket.emit('error', 'Failed to join room: database error.');
    }
  });

  // --- Drawing Event Handlers ---

  socket.on('startDrawing', async (data) => {
    const { roomName, object } = data;
    try {
      await WhiteboardRoom.updateOne(
        { room_name: roomName },
        { $push: { whiteboard_state: object } }
      );
      socket.broadcast.to(roomName).emit('drawingStarted', object);
    } catch (error) {
      console.error(`MongoDB error starting drawing object for room ${roomName}:`, error);
    }
  });

  // FIXED: 'drawing' event to use atomic update ($push with $each)
  socket.on('drawing', async (data) => {
    const { roomName, objectId, newPoints } = data; // newPoints is an array like [x1,y1,x2,y2]
    try {
      // Use $push with $each to atomically append new points to the specific line's points array
      // The $ positional operator updates the first element matching the arrayFilters condition
      const result = await WhiteboardRoom.updateOne(
        { room_name: roomName, "whiteboard_state.id": objectId, "whiteboard_state.type": "line" },
        { $push: { "whiteboard_state.$.points": { $each: newPoints } } }
      );

      // Check if the update was successful
      if (result.matchedCount === 0) {
        console.warn(`[Drawing] Could not find line object "${objectId}" in room "${roomName}" to update.`);
      }

      // Broadcast the update to other clients
      socket.broadcast.to(roomName).emit('drawing', { objectId, newPoints });
    } catch (error) {
      console.error(`MongoDB error during drawing for room ${roomName}:`, error);
    }
  });

  socket.on('endDrawing', async (data) => {
    const { roomName, objectId, finalObjectState } = data;
    try {
      await WhiteboardRoom.updateOne(
        { room_name: roomName, "whiteboard_state.id": objectId },
        { $set: { "whiteboard_state.$": finalObjectState } }
      );
      socket.broadcast.to(roomName).emit('drawingFinished', { objectId, finalObjectState });
    } catch (error) {
      console.error(`MongoDB error ending drawing for room ${roomName}:`, error);
    }
  });

  // FIXED: 'updateObject' event to use atomic update ($set)
  socket.on('updateObject', async (data) => {
    const { roomName, objectId, newAttributes } = data;
    try {
      // Construct the update object for $set, specifically targeting the array element
      const updateSet = {};
      for (const key in newAttributes) {
        // We need to form a path like "whiteboard_state.$.x", "whiteboard_state.$.width", etc.
        updateSet[`whiteboard_state.$.${key}`] = newAttributes[key];
      }

      const result = await WhiteboardRoom.updateOne(
        { room_name: roomName, "whiteboard_state.id": objectId }, // Match the room and the specific object in the array
        { $set: updateSet }
      );

      if (result.matchedCount === 0) {
        console.warn(`[Update] Could not find object "${objectId}" in room "${roomName}" to update.`);
      }

      socket.broadcast.to(roomName).emit('objectUpdated', { objectId, newAttributes });
    } catch (error) {
      console.error(`MongoDB error updating object for room ${roomName}:`, error);
    }
  });

  socket.on('clearWhiteboard', async (roomName) => {
    try {
      await WhiteboardRoom.updateOne(
        { room_name: roomName },
        { $set: { whiteboard_state: [] } }
      );
      io.to(roomName).emit('whiteboardCleared');
      console.log(`Whiteboard for room ${roomName} cleared.`);
    } catch (error) {
      console.error(`MongoDB error clearing whiteboard for room ${roomName}:`, error);
    }
  });

  socket.on('closeRoom', async (roomName) => {
    console.log(`[User Request] Received close room request for room: ${roomName}`);
    try {
      const clientsInRoom = io.sockets.adapter.rooms.get(roomName);
      if (clientsInRoom) {
        for (const clientId of clientsInRoom) {
          const clientSocket = io.sockets.sockets.get(clientId);
          if (clientSocket) {
            clientSocket.leave(roomName);
            clientSocket.data.currentRoom = null;
            clientSocket.emit('roomDestroyed', roomName);
          }
        }
      }

      await WhiteboardRoom.deleteOne({ room_name: roomName });
      console.log(`[DB] Room "${roomName}" and its data manually deleted.`);

      cancelRoomDestructionTimer(roomName);
    } catch (error) {
      console.error(`[DB Error] Failed to manually close room "${roomName}":`, error);
      socket.emit('error', 'Failed to close room: database error.');
    }
  });

  socket.on('chatMessage', async (data) => {
    const { roomName, message } = data;
    const chatMsg = {
      userId: socket.id,
      username: socket.data.username,
      message,
      timestamp: new Date()
    };
    try {
      await WhiteboardRoom.updateOne(
        { room_name: roomName },
        { $push: { chat_messages: chatMsg } }
      );
      io.to(roomName).emit('chatMessage', chatMsg);
    } catch (error) {
      console.error(`MongoDB error sending chat message for room ${roomName}:`, error);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.data.currentRoom) {
      checkRoomEmptinessAndManageTimer(socket.data.currentRoom);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});