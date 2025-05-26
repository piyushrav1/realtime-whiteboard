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
  process.env.FE_HOST || 'http://localhost:3000', // For local PC access
  process.env.PC_IP_FRONTEND // For other devices accessing React app via IP
];

app.use(cors({
  origin: FE_ALLOWED_ORIGINS,
  methods: ["GET", "POST"]
}));

const io = socketIo(server, {
  cors: {
    origin: FE_ALLOWED_ORIGINS, // Same allowed origins for Socket.IO
    methods: ["GET", "POST"]
  }
});


// Connect to MongoDB
connectDB();

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Handle joining a room
  socket.on('joinRoom', async (roomName) => {
    Object.keys(socket.rooms).forEach(room => {
      if (room !== socket.id) {
        socket.leave(room);
        console.log(`Socket ${socket.id} left room: ${room}`);
      }
    });

    socket.join(roomName);
    console.log(`Socket ${socket.id} joined room: ${roomName}`);

    try {
      const room = await WhiteboardRoom.findOneAndUpdate(
        { room_name: roomName },
        { $setOnInsert: { whiteboard_state: [] } },
        { upsert: true, new: true }
      );

      socket.emit('whiteboardState', room.whiteboard_state);
      console.log(`Sent whiteboard state for ${roomName} to ${socket.id} (from MongoDB).`);

      socket.broadcast.to(roomName).emit('userJoined', socket.id);
    } catch (error) {
      console.error(`MongoDB error joining room ${roomName}:`, error);
      socket.emit('error', 'Failed to join room: database error.');
    }
  });

  // --- New Drawing Event Handlers ---

  // When a user starts a new line
  socket.on('startDrawing', async (data) => {
    const { roomName, line } = data; // line includes id, points, tool, etc.
    try {
      // Find the room and push the new line to its state
      await WhiteboardRoom.updateOne(
        { room_name: roomName },
        { $push: { whiteboard_state: line } }
      );
      // Broadcast the new line to other clients in the room
      socket.broadcast.to(roomName).emit('drawingStarted', line);
    } catch (error) {
      console.error(`MongoDB error starting drawing for room ${roomName}:`, error);
    }
  });

  // When a user is actively drawing (sending new points)
  socket.on('drawing', async (data) => {
    const { roomName, lineId, newPoints } = data; // newPoints is just the latest [x,y] pair or a small array of new points
    try {
      // Atomically append new points to the specific line in the database
      // The "$[elem]" syntax requires arrayFilters, which is for more complex updates
      // For simplicity here, we'll fetch, update, and save, which is less performant but easier to reason about.
      // A more performant way for points array update would be:
      // await WhiteboardRoom.updateOne(
      //   { room_name: roomName, "whiteboard_state.id": lineId },
      //   { $push: { "whiteboard_state.$.points": { $each: newPoints } } }
      // );
      // However, $each is usually for pushing multiple separate items, not concatenating numbers.
      // The safest way for this use case is still to find and modify:

      const room = await WhiteboardRoom.findOne({ room_name: roomName });
      if (room) {
        const lineToUpdate = room.whiteboard_state.find(l => l.id === lineId);
        if (lineToUpdate) {
          lineToUpdate.points = lineToUpdate.points.concat(newPoints);
          await room.save(); // Save the entire document back
          // Broadcast the update (lineId and newPoints) to other clients in the room
          socket.broadcast.to(roomName).emit('drawing', { lineId, newPoints });
        }
      }
    } catch (error) {
      console.error(`MongoDB error during drawing for room ${roomName}:`, error);
    }
  });

  // When a user lifts the mouse (finishes a line)
  socket.on('endDrawing', async (data) => {
    const { roomName, lineId, finalLineState } = data; // finalLineState ensures consistency
    try {
      // Find the room and ensure the final state of the line is saved
      // This is important because 'drawing' events might not guarantee the absolute last point.
      // Using 'finalLineState' ensures the server has the completed line.
      await WhiteboardRoom.updateOne(
        { room_name: roomName, "whiteboard_state.id": lineId },
        { $set: { "whiteboard_state.$": finalLineState } }
      );
      // Optional: Broadcast a 'drawingFinished' event if needed by clients
      socket.broadcast.to(roomName).emit('drawingFinished', { lineId, finalLineState });
    } catch (error) {
      console.error(`MongoDB error ending drawing for room ${roomName}:`, error);
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