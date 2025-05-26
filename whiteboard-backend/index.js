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

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  const username = `Guest-${Math.random().toString(36).substr(2, 4)}`;
  socket.data.username = username;

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
        { $setOnInsert: { whiteboard_state: [], chat_messages: [] } },
        { upsert: true, new: true }
      );

      socket.emit('whiteboardState', {
        lines: room.whiteboard_state, // Now 'lines' holds all types of drawing objects
        messages: room.chat_messages
      });
      console.log(`Sent room state for ${roomName} to ${socket.id} (from MongoDB).`);

      socket.broadcast.to(roomName).emit('userJoined', socket.data.username);
    } catch (error) {
      console.error(`MongoDB error joining room ${roomName}:`, error);
      socket.emit('error', 'Failed to join room: database error.');
    }
  });

  // --- Drawing Event Handlers (Modified for generic objects) ---

  // When a user starts a new object (line, rect, circle, text)
  socket.on('startDrawing', async (data) => {
    const { roomName, object } = data; // 'object' is now the generic drawing object
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

  // When a user is actively drawing a line (sending new points)
  socket.on('drawing', async (data) => {
    const { roomName, objectId, newPoints } = data;
    try {
      // Find the room and the specific object within its state
      const room = await WhiteboardRoom.findOne({ room_name: roomName });
      if (room) {
        const objectToUpdate = room.whiteboard_state.find(obj => obj.id === objectId);
        if (objectToUpdate && objectToUpdate.type === 'line') { // Only update points for lines
          objectToUpdate.points = objectToUpdate.points.concat(newPoints);
          await room.save();
          socket.broadcast.to(roomName).emit('drawing', { objectId, newPoints });
        }
      }
    } catch (error) {
      console.error(`MongoDB error during drawing for room ${roomName}:`, error);
    }
  });

  // When a user lifts the mouse (finishes an object creation or modification)
  socket.on('endDrawing', async (data) => {
    const { roomName, objectId, finalObjectState } = data;
    try {
      // Update the entire object's state in the database
      await WhiteboardRoom.updateOne(
        { room_name: roomName, "whiteboard_state.id": objectId },
        { $set: { "whiteboard_state.$": finalObjectState } }
      );
      socket.broadcast.to(roomName).emit('drawingFinished', { objectId, finalObjectState });
    } catch (error) {
      console.error(`MongoDB error ending drawing for room ${roomName}:`, error);
    }
  });

  // NEW: When an existing object is moved, resized, rotated, or its properties changed (e.g., text content)
  socket.on('updateObject', async (data) => {
    const { roomName, objectId, newAttributes } = data; // newAttributes could be {x, y}, {width, height}, {text}, etc.
    try {
      // Find the room and the specific object within its state
      const room = await WhiteboardRoom.findOne({ room_name: roomName });
      if (room) {
        const objectIndex = room.whiteboard_state.findIndex(obj => obj.id === objectId);
        if (objectIndex !== -1) {
          // Update the object's attributes
          const updatedObject = { ...room.whiteboard_state[objectIndex].toObject(), ...newAttributes };
          room.whiteboard_state[objectIndex] = updatedObject;
          await room.save(); // Save the entire document back
          // Broadcast the update
          socket.broadcast.to(roomName).emit('objectUpdated', { objectId, newAttributes });
        }
      }
    } catch (error) {
      console.error(`MongoDB error updating object for room ${roomName}:`, error);
    }
  });

  // NEW: Clear all objects from the whiteboard
  socket.on('clearWhiteboard', async (roomName) => {
    try {
      await WhiteboardRoom.updateOne(
        { room_name: roomName },
        { $set: { whiteboard_state: [] } } // Set state to empty array
      );
      io.to(roomName).emit('whiteboardCleared'); // Broadcast to all in the room
      console.log(`Whiteboard for room ${roomName} cleared.`);
    } catch (error) {
      console.error(`MongoDB error clearing whiteboard for room ${roomName}:`, error);
    }
  });


  // --- Chat Event Handler (unchanged) ---
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
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});