// whiteboard-frontend/src/components/WhiteboardRoom.js

import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import './WhiteboardRoom.css';

// Make sure YOUR_PC_IP_ADDRESS is replaced with your actual PC's IP.
const socket = io('192.168.1.102:5000');

function WhiteboardRoom() {
  const { roomName } = useParams();
  const navigate = useNavigate();
  const [lines, setLines] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const stageRef = useRef(null);
  const currentLineId = useRef(null);

  const [chatMessages, setChatMessages] = useState([]);
  const [newChatMessage, setNewChatMessage] = useState('');
  const chatMessagesEndRef = useRef(null);

  // NEW: State for Konva stage dimensions
  const [stageDimensions, setStageDimensions] = useState({
    width: window.innerWidth * 0.7, // Initial desktop-like size
    height: window.innerHeight * 0.8
  });
  const canvasContainerRef = useRef(null); // Ref to the container around the Stage

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

    socket.on('whiteboardState', (data) => {
      console.log('Received initial room state:', data);
      setLines(data.lines);
      setChatMessages(data.messages);
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

    socket.on('chatMessage', (message) => {
        setChatMessages((prevMessages) => [...prevMessages, message]);
    });

    socket.on('userJoined', (username) => {
        setChatMessages((prevMessages) => [...prevMessages, {
            username: 'System',
            message: `${username} has joined the room.`,
            timestamp: new Date()
        }]);
    });

    // NEW: Resize observer to update Konva stage dimensions
    const handleResize = () => {
      if (canvasContainerRef.current) {
        const { clientWidth, clientHeight } = canvasContainerRef.current;
        setStageDimensions({ width: clientWidth, height: clientHeight });
      }
    };

    window.addEventListener('resize', handleResize);
    // Initial dimensions when component mounts
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize); // Clean up resize listener
      socket.off('connect');
      socket.off('disconnect');
      socket.off('whiteboardState');
      socket.off('drawingStarted');
      socket.off('drawing');
      socket.off('drawingFinished');
      socket.off('chatMessage');
      socket.off('userJoined');
    };
  }, [roomName, navigate]);

  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // --- Drawing Logic (unchanged besides stage dimensions) ---
  const handleMouseDown = (e) => {
    if (e.evt.type === 'touchstart') {
        e.evt.preventDefault();
    }
    setIsDrawing(true);
    const pos = e.target.getStage().getPointerPosition();
    const newLineId = `${socket.id}-${Date.now()}`;
    currentLineId.current = newLineId;
    const newLine = {
      id: newLineId, tool: 'pen', points: [pos.x, pos.y], stroke: 'black', strokeWidth: 5,
    };
    setLines((prevLines) => [...prevLines, newLine]);
    socket.emit('startDrawing', { roomName, line: newLine });
  };

  const handleMouseMove = (e) => {
    if (!isDrawing) {
      return;
    }
    if (e.evt.type === 'touchmove') {
        e.evt.preventDefault();
    }
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    let lastLine = lines.find(line => line.id === currentLineId.current);
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

  const handleSendChatMessage = () => {
    if (newChatMessage.trim()) {
      socket.emit('chatMessage', { roomName, message: newChatMessage.trim() });
      setNewChatMessage('');
    }
  };

  const handleChatKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendChatMessage();
    }
  };

  return (
    <div className="whiteboard-page-container">
      <div className="whiteboard-main-content">
        <div className="header">
          <h1>Whiteboard Room: <span className="room-name">{roomName}</span></h1>
          <button onClick={() => navigate('/')} className="leave-button">
            Leave Room
          </button>
        </div>
        <div className="whiteboard-canvas-container" ref={canvasContainerRef}> {/* NEW CONTAINER */}
          <Stage
            width={stageDimensions.width} 
            height={stageDimensions.height} 
            onMouseDown={handleMouseDown}
            onMousemove={handleMouseMove}
            onMouseup={handleMouseUp}
            onTouchStart={handleMouseDown}
            onTouchMove={handleMouseMove}
            onTouchEnd={handleMouseUp}
            ref={stageRef}
            style={{
                cursor: 'crosshair',
                backgroundColor: 'white',
                touchAction: 'none'
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
        </div> {/* END NEW CONTAINER */}
        <p className="hint-text margin-top-md">
          Draw here. Open this room in another tab to see real-time collaboration.
        </p>
      </div>

      {/* Chat Sidebar */}
      <div className="chat-sidebar">
        <h2>Room Chat</h2>
        <div className="chat-messages">
          {chatMessages.map((msg, index) => (
            <div key={index} className="chat-message">
              <span className="chat-username">{msg.username}:</span> {msg.message}
              <span className="chat-timestamp">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
          <div ref={chatMessagesEndRef} />
        </div>
        <div className="chat-input-group">
          <input
            type="text"
            placeholder="Type your message..."
            value={newChatMessage}
            onChange={(e) => setNewChatMessage(e.target.value)}
            onKeyPress={handleChatKeyPress}
            className="chat-input"
          />
          <button onClick={handleSendChatMessage} className="send-button">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default WhiteboardRoom;