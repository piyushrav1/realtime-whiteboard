// whiteboard-frontend/src/components/WhiteboardRoom.js

// whiteboard-frontend/src/components/WhiteboardRoom.js

import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import './WhiteboardRoom.css'; // Make sure this CSS exists or you create it

// Make sure YOUR_PC_IP_ADDRESS is replaced with your actual PC's IP.
// Example: const socket = io('http://192.168.1.100:5000');

const socket = io('http://192.168.1.102:5000'); // <-- Replace YOUR_PC_IP_ADDRESS

function WhiteboardRoom() {
  const { roomName } = useParams();
  const navigate = useNavigate();
  const [lines, setLines] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const stageRef = useRef(null);
  const currentLineId = useRef(null);

  // --- Socket.IO Event Listeners & Room Joining ---
  useEffect(() => {
    if (!roomName) {
      navigate('/');
      return;
    }

    socket.emit('joinRoom', roomName);

    socket.on('connect', () => {
      console.log('Connected to backend Socket.IO:', socket.id);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from backend Socket.IO');
      alert('Disconnected from server. Please refresh.');
      navigate('/');
    });

    socket.on('whiteboardState', (initialLines) => {
      console.log('Received initial whiteboard state:', initialLines);
      setLines(initialLines);
    });

    socket.on('drawingStarted', (newLine) => {
        setLines((prevLines) => [...prevLines, newLine]);
    });

    socket.on('drawing', (data) => {
        const { lineId, newPoints } = data;
        setLines((prevLines) => {
            return prevLines.map((line) => {
                if (line.id === lineId) {
                    return { ...line, points: line.points.concat(newPoints) };
                }
                return line;
            });
        });
    });

    socket.on('drawingFinished', (data) => {
        const { lineId, finalLineState } = data;
        setLines((prevLines) => {
            return prevLines.map((line) => {
                if (line.id === lineId) {
                    return finalLineState;
                }
                return line;
            });
        });
    });

    socket.on('userJoined', (userId) => {
        console.log(`User ${userId} joined the room.`);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('whiteboardState');
      socket.off('drawingStarted');
      socket.off('drawing');
      socket.off('drawingFinished');
      socket.off('userJoined');
    };
  }, [roomName, navigate]);

  // --- Drawing Logic ---
  const handleMouseDown = (e) => {
    // Prevent default touch behavior (like selection) for touchstart
    if (e.evt.type === 'touchstart') {
        e.evt.preventDefault();
    }

    setIsDrawing(true);
    const pos = e.target.getStage().getPointerPosition();
    const newLineId = `${socket.id}-${Date.now()}`;
    currentLineId.current = newLineId;

    const newLine = {
      id: newLineId,
      tool: 'pen',
      points: [pos.x, pos.y],
      stroke: 'black',
      strokeWidth: 5,
    };

    setLines((prevLines) => [...prevLines, newLine]);
    socket.emit('startDrawing', { roomName, line: newLine });
  };

  const handleMouseMove = (e) => {
    if (!isDrawing) {
      return;
    }

    // THIS IS THE KEY FIX FOR TOUCHSCREENS
    // Prevent default touch behavior (like scrolling) for touchmove events
    if (e.evt.type === 'touchmove') {
        e.evt.preventDefault();
    }

    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    let lastLine = lines.find(line => line.id === currentLineId.current); // Find by ID for robustness

    if (lastLine) {
      lastLine.points = lastLine.points.concat([point.x, point.y]);
      setLines((prevLines) => {
          return prevLines.map(line => line.id === lastLine.id ? lastLine : line);
      });

      socket.emit('drawing', { roomName, lineId: currentLineId.current, newPoints: [point.x, point.y] });
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    const finalLine = lines.find(line => line.id === currentLineId.current);
    if (finalLine) {
        socket.emit('endDrawing', { roomName, lineId: currentLineId.current, finalLineState: finalLine });
    }
    currentLineId.current = null;
  };

  return (
    <div className="whiteboard-room-container">
      <div className="header">
        <h1>Whiteboard Room: <span className="room-name">{roomName}</span></h1>
        <button onClick={() => navigate('/')} className="leave-button">
          Leave Room
        </button>
      </div>
      <Stage
        width={window.innerWidth * 0.9}
        height={window.innerHeight * 0.8}
        onMouseDown={handleMouseDown}
        onMousemove={handleMouseMove}
        onMouseup={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
        ref={stageRef}
        style={{
            border: '1px solid #ccc',
            cursor: 'crosshair',
            backgroundColor: 'white',
            touchAction: 'none' // <<< --- THIS IS THE KEY FIX FOR TOUCHSCREENS (CSS)
        }}
      >
        <Layer>
          {lines.map((line) => (
            <Line
              key={line.id}
              points={line.points}
              stroke={line.stroke}
              strokeWidth={line.strokeWidth}
              tension={0.5}
              lineCap="round"
              lineJoin="round"
              globalCompositeOperation={
                line.tool === 'eraser' ? 'destination-out' : 'source-over'
              }
            />
          ))}
        </Layer>
      </Stage>
      <p className="hint-text">
        Draw here. Open this room in another tab to see real-time collaboration.
      </p>
    </div>
  );
}

export default WhiteboardRoom;