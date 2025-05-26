// whiteboard-backend/models/WhiteboardRoom.js

const mongoose = require('mongoose');

// Define a schema for a single line object (existing)
const LineSchema = new mongoose.Schema({
  id: { type: String, required: true },
  tool: { type: String, required: true },
  points: { type: [Number], required: true },
  stroke: { type: String, default: 'black' },
  strokeWidth: { type: Number, default: 5 },
}, { _id: false });

// NEW: Define a schema for a single chat message
const ChatMessageSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // Placeholder for user ID (e.g., socket.id for now)
  username: { type: String, default: 'Guest' }, // Placeholder for username
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { _id: false }); // Don't create separate _id for subdocuments (messages)


// Define the main WhiteboardRoom schema (updated)
const WhiteboardRoomSchema = new mongoose.Schema({
  room_name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  whiteboard_state: {
    type: [LineSchema], // Array of line objects
    default: [],
  },
  chat_messages: { // NEW: Array of chat message objects
    type: [ChatMessageSchema],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update 'updatedAt' field on save
WhiteboardRoomSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Create and export the model
module.exports = mongoose.model('WhiteboardRoom', WhiteboardRoomSchema);