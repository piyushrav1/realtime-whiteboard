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

// Get allowed origins from environment variables for CORS
const FE_ALLOWED_ORIGINS = [
  process.env.FE_HOST || 'http://localhost:3000',
  process.env.PC_IP_FRONTEND || 'http://localhost:3000' // Fallback for local testing if not set
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

// Connect to MongoDB
connectDB();

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Store user info (for chat, this can be expanded with real usernames later)
  // For now, let's assign a simple guest name
  const username = `Guest-${Math.random().toString(36).substr(2, 4)}`;
  socket.data.username = username; // Store on socket object

  // Handle joining a room
  socket.on('joinRoom', async (roomName) => {
    Object.keys(socket.rooms).forEach(room => {
      if (room !== socket.id) {
        socket.leave(room);
        console.log(`Socket ${socket.id} left room: ${room}`);
      }
    });

    socket.join(roomName);
    console.log(`Socket ${socket.id} (${socket.data.username}) joined room: ${roomName}`);

    try {
      const room = await WhiteboardRoom.findOneAndUpdate(
        { room_name: roomName },
        { $setOnInsert: { whiteboard_state: [], chat_messages: [] } }, // Initialize chat_messages too
        { upsert: true, new: true }
      );

      // Send both whiteboard state and chat messages
      socket.emit('whiteboardState', {
        lines: room.whiteboard_state,
        messages: room.chat_messages
      });
      console.log(`Sent room state for ${roomName} to ${socket.id} (from MongoDB).`);

      // Notify others in the room that a user has joined (optional)
      socket.broadcast.to(roomName).emit('userJoined', socket.data.username);
    } catch (error) {
      console.error(`MongoDB error joining room ${roomName}:`, error);
      socket.emit('error', 'Failed to join room: database error.');
    }
  });

  // --- Drawing Event Handlers (unchanged) ---
  socket.on('startDrawing', async (data) => {
    const { roomName, line } = data;
    try {
      await WhiteboardRoom.updateOne(
        { room_name: roomName },
        { $push: { whiteboard_state: line } }
      );
      socket.broadcast.to(roomName).emit('drawingStarted', line);
    } catch (error) {
      console.error(`MongoDB error starting drawing for room ${roomName}:`, error);
    }
  });

  socket.on('drawing', async (data) => {
    const { roomName, lineId, newPoints } = data;
    try {
      const room = await WhiteboardRoom.findOne({ room_name: roomName });
      if (room) {
        const lineToUpdate = room.whiteboard_state.find(l => l.id === lineId);
        if (lineToUpdate) {
          lineToUpdate.points = lineToUpdate.points.concat(newPoints);
          await room.save();
          socket.broadcast.to(roomName).emit('drawing', { lineId, newPoints });
        }
      }
    } catch (error) {
      console.error(`MongoDB error during drawing for room ${roomName}:`, error);
    }
  });

  socket.on('endDrawing', async (data) => {
    const { roomName, lineId, finalLineState } = data;
    try {
      await WhiteboardRoom.updateOne(
        { room_name: roomName, "whiteboard_state.id": lineId },
        { $set: { "whiteboard_state.$": finalLineState } }
      );
      socket.broadcast.to(roomName).emit('drawingFinished', { lineId, finalLineState });
    } catch (error) {
      console.error(`MongoDB error ending drawing for room ${roomName}:`, error);
    }
  });

  // --- NEW: Chat Event Handler ---
  socket.on('chatMessage', async (data) => {
    const { roomName, message } = data;
    const chatMsg = {
      userId: socket.id,
      username: socket.data.username, // Use the assigned username
      message,
      timestamp: new Date()
    };

    try {
      // Find the room and push the new chat message to its chat_messages array
      await WhiteboardRoom.updateOne(
        { room_name: roomName },
        { $push: { chat_messages: chatMsg } }
      );
      // Broadcast the message to all clients in the room (including sender for immediate display)
      io.to(roomName).emit('chatMessage', chatMsg);
    } catch (error) {
      console.error(`MongoDB error sending chat message for room ${roomName}:`, error);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // You could also emit a 'userLeft' event here
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});