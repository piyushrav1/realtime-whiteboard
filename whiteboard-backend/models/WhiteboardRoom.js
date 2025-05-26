// whiteboard-backend/models/WhiteboardRoom.js

const mongoose = require('mongoose');

// Define a schema for a single line object
const LineSchema = new mongoose.Schema({
  id: { type: String, required: true }, // Client-side generated unique ID for the line
  tool: { type: String, required: true },
  points: { type: [Number], required: true }, // Array of numbers: [x1, y1, x2, y2, ...]
  stroke: { type: String, default: 'black' },
  strokeWidth: { type: Number, default: 5 },
  // Add other properties here as you add more tools (e.g., color, fill, shapeType)
}, { _id: false }); // Don't create a separate _id for subdocuments (lines)

// Define the main WhiteboardRoom schema
const WhiteboardRoomSchema = new mongoose.Schema({
  room_name: {
    type: String,
    required: true,
    unique: true, // Ensure room names are unique
    trim: true,
  },
  whiteboard_state: {
    type: [LineSchema], // Array of line objects
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