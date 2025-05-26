// whiteboard-backend/models/WhiteboardRoom.js

const mongoose = require('mongoose');

// UPDATED: Define a generic schema for any drawing object
const DrawingObjectSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, required: true, enum: ['line', 'rect', 'circle', 'text'] }, // NEW: Type of drawing object
  x: { type: Number }, // For shapes, text, images
  y: { type: Number }, // For shapes, text, images
  width: { type: Number }, // For rect, text
  height: { type: Number }, // For rect, text
  radius: { type: Number }, // For circle
  rotation: { type: Number, default: 0 }, // For all rotatable objects
  text: { type: String }, // For text objects
  fontSize: { type: Number }, // For text objects
  fontFamily: { type: String }, // For text objects
  align: { type: String }, // For text objects

  points: { type: [Number] }, // Only for 'line' type
  stroke: { type: String, default: 'black' }, // For line, rect, circle, text
  strokeWidth: { type: Number, default: 5 }, // For line, rect, circle
  fill: { type: String, default: 'transparent' }, // For rect, circle
  // Add more properties as needed for other tools (e.g., opacity, dash, image source)
}, { _id: false });

// ChatMessageSchema (unchanged)
const ChatMessageSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: { type: String, default: 'Guest' },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

// WhiteboardRoomSchema (updated to use DrawingObjectSchema)
const WhiteboardRoomSchema = new mongoose.Schema({
  room_name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  whiteboard_state: {
    type: [DrawingObjectSchema], // UPDATED: Array of generic drawing objects
    default: [],
  },
  chat_messages: {
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

WhiteboardRoomSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('WhiteboardRoom', WhiteboardRoomSchema);