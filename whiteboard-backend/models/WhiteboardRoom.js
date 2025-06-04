// whiteboard-backend/models/WhiteboardRoom.js

import mongoose from 'mongoose'; // Change require to import

// Define a generic schema for any drawing object
const DrawingObjectSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, required: true, enum: ['line', 'rect', 'circle', 'text'] },
  x: { type: Number },
  y: { type: Number },
  width: { type: Number },
  height: { type: Number },
  radius: { type: Number },
  rotation: { type: Number, default: 0 },
  text: { type: String },
  fontSize: { type: Number },
  fontFamily: { type: String },
  align: { type: String },

  points: { type: [Number] },
  stroke: { type: String, default: 'black' },
  strokeWidth: { type: Number, default: 5 },
  fill: { type: String, default: 'transparent' },

  // --- NEW BRUSH PROPERTIES ---
  opacity: { type: Number, default: 1.0 }, // New: 0.0 to 1.0 for transparency
  lineCap: { type: String, enum: ['butt', 'round', 'square'], default: 'round' }, // New: Line cap style
  dash: { type: [Number], default: [] }, // New: Dash pattern for dashed lines [segment, gap]
  tool: { type: String } // Existing: Kept for eraser's composite operation
}, { _id: false });

// Define a schema for a single chat message
const ChatMessageSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: { type: String, default: 'Guest' },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

// Define the main WhiteboardRoom schema
const WhiteboardRoomSchema = new mongoose.Schema({
  room_name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  whiteboard_state: {
    type: [DrawingObjectSchema],
    default: [],
  },
  chat_messages: {
    type: [ChatMessageSchema],
    default: [],
  },
  // Using Mongoose's built-in timestamps for cleaner code
}, { timestamps: true }); // Adds createdAt and updatedAt fields automatically

// The pre('save') hook for updatedAt is not needed if 'timestamps: true' is used

export default mongoose.model('WhiteboardRoom', WhiteboardRoomSchema);