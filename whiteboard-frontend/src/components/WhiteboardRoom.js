// whiteboard-frontend/src/components/WhiteboardRoom.js

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Stage, Layer, Line, Rect, Circle, Text, Transformer } from 'react-konva';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import './WhiteboardRoom.css'; // Make sure this CSS file is updated too!

// IMPORTANT: Make sure YOUR_PC_IP_ADDRESS is replaced with your actual PC's IP.
const socket = io('http://192.168.1.7:5000');

// Helper component for selectable/transformable Konva nodes
const ColoredRect = ({ shapeProps, isSelected, onSelect, onChange, activeTool }) => {
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    } else if (!isSelected && trRef.current) {
      trRef.current.nodes([]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected, shapeProps.type]);

  const handleDblClick = (e) => {
    onSelect(); // Selects the shape
    if (shapeProps.type === 'text') {
      // Small delay to allow Konva to finish its rendering cycle and for accurate measurements
      setTimeout(() => {
        const textNode = shapeRef.current;
        if (!textNode) return;

        // Hide Konva text node
        textNode.hide();
        textNode.getLayer().batchDraw();

        // Remove transformer handles while editing text
        if (trRef.current) {
          trRef.current.nodes([]);
          trRef.current.getLayer().batchDraw();
        }

        // Get text node's absolute position and dimensions
        const textPosition = textNode.absolutePosition();
        const stageBox = textNode.getStage().container().getBoundingClientRect();

        // Create a native textarea element
        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);

        // Konva's `getClientRect()` gives the actual rendered bounding box, more reliable for sizing
        const textRect = textNode.getClientRect();

        // Apply styles to the textarea to match the Konva text node
        textarea.value = textNode.text();
        textarea.style.position = 'absolute';
        textarea.style.top = (textPosition.y + stageBox.top) + 'px';
        textarea.style.left = (textPosition.x + stageBox.left) + 'px';
        textarea.style.width = textRect.width + 'px'; // Use actual rendered width
        textarea.style.height = textRect.height + 'px'; // Use actual rendered height
        textarea.style.fontSize = textNode.fontSize() + 'px';
        textarea.style.lineHeight = textNode.lineHeight();
        textarea.style.fontFamily = textNode.fontFamily();
        textarea.style.textAlign = textNode.align();
        textarea.style.color = textNode.fill();
        textarea.style.padding = textNode.padding() + 'px'; // Match Konva padding
        textarea.style.border = '1px solid var(--primary-color)'; // Use theme color for border
        textarea.style.resize = 'none'; // Prevent manual resizing by user
        textarea.style.overflow = 'hidden'; // Hide scrollbars initially
        textarea.style.background = 'white'; // Give it a background for easier editing
        textarea.style.outline = 'none';
        textarea.style.zIndex = '9999'; // Ensure it's on top of canvas
        textarea.style.transformOrigin = 'left top';
        textarea.style.transform = `rotateZ(${textNode.rotation()}deg)`; // Apply rotation

        // Focus the textarea and select its content
        textarea.focus();
        textarea.select();

        // Function to clean up the textarea
        const removeTextarea = () => {
          document.body.removeChild(textarea);
          textNode.show(); // Show Konva text node again
          textNode.getLayer().batchDraw();
          // Re-enable transformer if select tool is active and shape is still selected
          if (activeTool === 'select' && isSelected && shapeRef.current && trRef.current) {
              trRef.current.nodes([shapeRef.current]);
              trRef.current.getLayer().batchDraw();
          }
        };

        // Auto-resize textarea as text is typed
        const autoResizeTextarea = () => {
          textarea.style.height = 'auto'; // Reset height to 'auto' to get accurate scrollHeight
          textarea.style.height = textarea.scrollHeight + 'px'; // Set height to scrollHeight (content height)
        };
        textarea.addEventListener('input', autoResizeTextarea);
        autoResizeTextarea(); // Initial auto-resize for existing text

        // Event listeners for textarea
        textarea.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) { // Save on Enter (unless Shift is held for new line)
            e.preventDefault(); // Prevent new line in textarea on Enter
            textarea.blur(); // Blur triggers the 'blur' event listener below
          }
          if (e.key === 'Escape') { // Discard changes on Escape
            removeTextarea();
            // Optional: Revert text to original if you don't want Escape to save
            // onChange({ ...shapeProps, text: shapeProps.text });
          }
        });

        textarea.addEventListener('blur', () => {
          // Update Konva node with new text and potentially new dimensions
          onChange({
            ...shapeProps,
            text: textarea.value,
            // Update Konva node's width/height based on textarea's final content size
            width: Math.max(50, textarea.scrollWidth), // Ensure min width
            height: Math.max(30, textarea.scrollHeight) // Ensure min height
          });
          removeTextarea();
        });
      }, 50); // Small delay to allow Konva internal updates
    }
  };

  const currentKonvaNode = (
    shapeProps.type === 'rect' ? (
      <Rect
        onClick={onSelect} onTap={onSelect} onDblClick={handleDblClick} onDblTap={handleDblClick}
        ref={shapeRef} {...shapeProps} draggable={activeTool === 'select'}
        onDragEnd={(e) => { onChange({ ...shapeProps, x: e.target.x(), y: e.target.y(), }); }}
        onTransformEnd={(e) => {
          const node = shapeRef.current; const scaleX = node.scaleX(); const scaleY = node.scaleY();
          node.scaleX(1); node.scaleY(1);
          onChange({ ...shapeProps, x: node.x(), y: node.y(), width: Math.max(5, node.width() * scaleX), height: Math.max(5, node.height() * scaleY), rotation: node.rotation(), });
        }} />
    ) : shapeProps.type === 'circle' ? (
      <Circle
        onClick={onSelect} onTap={onSelect} onDblClick={handleDblClick} onDblTap={handleDblClick}
        ref={shapeRef} {...shapeProps} draggable={activeTool === 'select'}
        onDragEnd={(e) => { onChange({ ...shapeProps, x: e.target.x(), y: e.target.y(), }); }}
        onTransformEnd={(e) => {
          const node = shapeRef.current; const scaleX = node.scaleX(); node.scaleX(1); node.scaleY(1);
          onChange({ ...shapeProps, x: node.x(), y: node.y(), radius: Math.max(5, node.radius() * scaleX), rotation: node.rotation(), });
        }} />
    ) : shapeProps.type === 'text' ? (
      <Text
        onClick={onSelect} onTap={onSelect} onDblClick={handleDblClick} onDblTap={handleDblClick}
        ref={shapeRef} {...shapeProps} draggable={activeTool === 'select'}
        onDragEnd={(e) => { onChange({ ...shapeProps, x: e.target.x(), y: e.target.y(), }); }}
        // IMPORTANT: Ensure text node's width/height/fontSize are updated on transform
        onTransformEnd={(e) => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          const rotation = node.rotation();

          node.scaleX(1); // Reset scales
          node.scaleY(1);

          const newFontSize = Math.max(8, node.fontSize() * scaleX); // Scale font size, ensure minimum
          const newWidth = Math.max(50, node.width() * scaleX); // Scale width
          const newHeight = Math.max(30, node.height() * scaleY); // Scale height (less critical for auto-wrapping text but good for bounding box)

          onChange({
            ...shapeProps,
            x: node.x(),
            y: node.y(),
            width: newWidth,
            height: newHeight,
            fontSize: newFontSize,
            rotation: rotation,
          });
        }} />
    ) : null
  );
  return (
    <>
      {currentKonvaNode}
      {isSelected && currentKonvaNode && (
        <Transformer ref={trRef} boundBoxFunc={(oldBox, newBox) => { if (newBox.width < 5 || newBox.height < 5) { return oldBox; } return newBox; }} />
      )}
    </>
  );
};

function WhiteboardRoom() {
  const { roomName } = useParams();
  const navigate = useNavigate();
  const [drawingObjects, setDrawingObjects] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const stageRef = useRef(null);
  const currentObjectId = useRef(null);

  const [chatMessages, setChatMessages] = useState([]);
  const [newChatMessage, setNewChatMessage] = useState('');
  const chatMessagesEndRef = useRef(null);

  const [stageDimensions, setStageDimensions] = useState({
    width: window.innerWidth * 0.7,
    height: window.innerHeight * 0.8
  });
  const canvasContainerRef = useRef(null);

  // --- BRUSH STATE VARIABLES ---
  const [tool, setTool] = useState('pen'); // 'pen', 'marker', 'dashed', 'calligraphy', 'eraser', 'rect', 'circle', 'text', 'select'
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(5);
  const [fillColor, setFillColor] = useState('transparent');
  const [selectedId, selectShape] = useState(null);

  // Brush specific properties
  const [brushOpacity, setBrushOpacity] = useState(1.0); // 0.0 to 1.0
  const [lineCap, setLineCap] = useState('round'); // 'butt', 'round', 'square'


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
      setDrawingObjects(data.lines);
      setChatMessages(data.messages);
    });

    socket.on('drawingStarted', (newObject) => {
        setDrawingObjects((prevObjects) => [...prevObjects, newObject]);
    });

    socket.on('drawing', (data) => {
        const { objectId, newPoints } = data;
        setDrawingObjects((prevObjects) => {
            return prevObjects.map((obj) => {
                if (obj.id === objectId && obj.type === 'line') {
                    return { ...obj, points: obj.points.concat(newPoints) };
                }
                return obj;
            });
        });
    });

    socket.on('drawingFinished', (data) => {
        const { objectId, finalObjectState } = data;
        setDrawingObjects((prevObjects) => {
            return prevObjects.map((obj) => {
                if (obj.id === objectId) {
                    return finalObjectState;
                }
                return obj;
            });
        });
    });

    socket.on('objectUpdated', (data) => {
        const { objectId, newAttributes } = data;
        setDrawingObjects((prevObjects) => {
            return prevObjects.map((obj) => {
                if (obj.id === objectId) {
                    return { ...obj, ...newAttributes };
                }
                return obj;
            });
        });
    });

    socket.on('whiteboardCleared', () => {
        setDrawingObjects([]);
        selectShape(null);
        console.log('Whiteboard cleared by another user.');
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

    socket.on('roomDestroyed', (destroyedRoomName) => {
        if (destroyedRoomName === roomName) {
            alert(`Room "${destroyedRoomName}" has been closed or automatically destroyed.`);
            navigate('/');
        }
    });

    const handleResize = () => {
      if (canvasContainerRef.current) {
        const { clientWidth, clientHeight } = canvasContainerRef.current;
        setStageDimensions({ width: clientWidth, height: clientHeight });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      socket.off('connect');
      socket.off('disconnect');
      socket.off('whiteboardState');
      socket.off('drawingStarted');
      socket.off('drawing');
      socket.off('drawingFinished');
      socket.off('objectUpdated');
      socket.off('whiteboardCleared');
      socket.off('chatMessage');
      socket.off('userJoined');
      socket.off('roomDestroyed');
    };
  }, [roomName, navigate]);

  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleObjectChange = useCallback((updatedObject) => {
    setDrawingObjects((prevObjects) => {
      return prevObjects.map((obj) => {
        if (obj.id === updatedObject.id) {
          return updatedObject;
        }
        return obj;
      });
    });
    socket.emit('updateObject', { roomName, objectId: updatedObject.id, newAttributes: updatedObject });
  }, [roomName]);

  const handleMouseDown = (e) => {
    const clickedOnEmpty = e.target === e.target.getStage();

    if (tool === 'select' && clickedOnEmpty) {
      selectShape(null); // Deselect if clicking on empty stage with select tool
      return;
    }

    // --- FIX FOR TEXT TOOL: Only create new text box if clicking on empty stage. ---
    // If an existing object (including a text object) is clicked,
    // let Konva's event propagation (e.g., onSelect, onDblClick) handle it.
    if (tool === 'text' && !clickedOnEmpty) {
      // If we clicked on an existing object, do NOT create a new text object.
      // The onDblClick handler of the ColoredRect component will handle editing existing text.
      return;
    }

    // Common logic for all tools below (unless returned early)
    if (e.evt.type === 'touchstart') {
        e.evt.preventDefault(); // Prevents default browser actions (scrolling/zooming) on touch start
    }
    setIsDrawing(true);
    const pos = e.target.getStage().getPointerPosition();
    const newObjectId = `${socket.id}-${Date.now()}`;
    currentObjectId.current = newObjectId;
    selectShape(null); // Deselect any previously selected shape when starting a new draw/creation

    let newObject;
    switch (tool) {
      case 'pen':
      case 'marker':
      case 'dashed':
      case 'calligraphy':
      case 'eraser':
        let currentStrokeColor = tool === 'eraser' ? '#FFFFFF' : strokeColor;
        let currentStrokeWidth = tool === 'eraser' ? strokeWidth + 10 : strokeWidth;
        let currentOpacity = tool === 'eraser' ? 1.0 : brushOpacity;
        let currentLineCap = lineCap;
        let currentDash = [];

        if (tool === 'marker') {
          currentOpacity = 0.6;
          currentStrokeWidth = Math.max(15, strokeWidth * 2);
          currentLineCap = 'butt';
        } else if (tool === 'dashed') {
          currentDash = [10, 10];
        } else if (tool === 'calligraphy') {
          currentStrokeWidth = Math.max(8, strokeWidth * 1.5);
          currentLineCap = 'square';
          currentDash = [];
        }

        newObject = {
          id: newObjectId,
          type: 'line',
          points: [pos.x, pos.y],
          stroke: currentStrokeColor,
          strokeWidth: currentStrokeWidth,
          opacity: currentOpacity,
          lineCap: currentLineCap,
          dash: currentDash,
          tool: tool
        };
        break;
      case 'rect':
        newObject = { id: newObjectId, type: 'rect', x: pos.x, y: pos.y, width: 0, height: 0, stroke: strokeColor, strokeWidth: strokeWidth, fill: fillColor, opacity: brushOpacity };
        break;
      case 'circle':
        newObject = { id: newObjectId, type: 'circle', x: pos.x, y: pos.y, radius: 0, stroke: strokeColor, strokeWidth: strokeWidth, fill: fillColor, opacity: brushOpacity };
        break;
      case 'text':
        newObject = {
          id: newObjectId,
          type: 'text',
          x: pos.x,
          y: pos.y,
          text: 'Double click to edit',
          fontSize: 20,
          fontFamily: 'Arial',
          stroke: strokeColor,
          fill: strokeColor,
          width: 200,
          height: 30,
          rotation: 0,
          opacity: brushOpacity
        };
        setIsDrawing(false); // Text tool is not a continuous drawing tool
        socket.emit('startDrawing', { roomName, object: newObject });
        setDrawingObjects((prevObjects) => [...prevObjects, newObject]);
        selectShape(newObjectId); // Select the newly created text object to allow immediate double-click edit
        return; // CRUCIAL: Exit after creating text object. No mousemove/mouseup for text creation.
      case 'select': setIsDrawing(false); return;
      default: return;
    }
    setDrawingObjects((prevObjects) => [...prevObjects, newObject]);
    socket.emit('startDrawing', { roomName, object: newObject });
  };

  const handleMouseMove = (e) => {
    if (!isDrawing) { return; }
    if (e.evt.type === 'touchmove') {
        e.evt.preventDefault();
    }
    const stage = e.target.getStage(); const point = stage.getPointerPosition();
    let currentObject = drawingObjects.find(obj => obj.id === currentObjectId.current);

    if (currentObject) {
      const newObjects = [...drawingObjects]; const index = newObjects.findIndex(obj => obj.id === currentObject.id);
      switch (currentObject.type) {
        case 'line':
          currentObject.points = currentObject.points.concat([point.x, point.y]);
          newObjects[index] = currentObject;
          setDrawingObjects(newObjects);
          socket.emit('drawing', { roomName, objectId: currentObjectId.current, newPoints: [point.x, point.y] });
          break;
        case 'rect':
          const newX_rect = Math.min(currentObject.x, point.x); const newY_rect = Math.min(currentObject.y, point.y);
          const newWidth_rect = Math.abs(point.x - currentObject.x); const newHeight_rect = Math.abs(point.y - currentObject.y);
          currentObject = { ...currentObject, x: newX_rect, y: newY_rect, width: newWidth_rect, height: newHeight_rect }; newObjects[index] = currentObject; socket.emit('updateObject', { roomName, objectId: currentObjectId.current, newAttributes: { x: newX_rect, y: newY_rect, width: newWidth_rect, height: newHeight_rect } }); setDrawingObjects(newObjects); break;
        case 'circle':
          const newRadius_circle = Math.sqrt(Math.pow(point.x - currentObject.x, 2) + Math.pow(point.y - currentObject.y, 2));
          currentObject = { ...currentObject, radius: newRadius_circle }; newObjects[index] = currentObject; socket.emit('updateObject', { roomName, objectId: currentObjectId.current, newAttributes: { radius: newRadius_circle } }); setDrawingObjects(newObjects); break;
        default: break;
      }
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    if (tool !== 'select' && tool !== 'text') { // Text tool handles its own finalization
      const finalObject = drawingObjects.find(obj => obj.id === currentObjectId.current);
      if (finalObject) { socket.emit('endDrawing', { roomName, objectId: currentObjectId.current, finalObjectState: finalObject }); }
    }
    currentObjectId.current = null;
  };

  const handleSendChatMessage = () => {
    if (newChatMessage.trim()) { socket.emit('chatMessage', { roomName, message: newChatMessage.trim() }); setNewChatMessage(''); }
  };
  const handleChatKeyPress = (e) => { if (e.key === 'Enter') { handleSendChatMessage(); } };
  const handleClearWhiteboard = () => { if (window.confirm('Are you sure you want to clear the entire whiteboard? This cannot be undone!')) { socket.emit('clearWhiteboard', roomName); } };
  const handleCloseRoom = () => { if (window.confirm('Are you sure you want to close this room? All users will be disconnected and data will be deleted.')) { socket.emit('closeRoom', roomName); navigate('/'); alert('Room closure initiated.'); } };

  const getCursorStyle = () => {
    switch (tool) {
      case 'pen': case 'eraser': case 'rect': case 'circle': case 'marker': case 'dashed': case 'calligraphy': return 'crosshair';
      case 'text': return 'text'; case 'select': return selectedId ? 'move' : 'default';
      default: return 'default';
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

        {/* --- PROFESSIONAL TOOL PALETTE START --- */}
        <div className="tool-palette">

          {/* Selection Tool */}
          <div className="tool-group tool-group-main">
            <button className={`tool-button ${tool === 'select' ? 'active' : ''}`} onClick={() => { setTool('select'); selectShape(null); }} title="Select & Move">
              <span className="icon">➡</span> {/* Arrow icon */}
              <span className="button-text">Select</span>
            </button>
          </div>

          <div className="tool-separator"></div>

          {/* Brush Tools Group */}
          <div className="tool-group tool-group-brushes">
            <button className={`tool-button ${tool === 'pen' ? 'active' : ''}`} onClick={() => setTool('pen')} title="Pen">
              <span className="icon">✎</span> {/* Pencil icon */}
              <span className="button-text">Pen</span>
            </button>
            <button className={`tool-button ${tool === 'marker' ? 'active' : ''}`} onClick={() => setTool('marker')} title="Marker">
              <span className="icon">✍</span> {/* Marker icon */}
              <span className="button-text">Marker</span>
            </button>
            <button className={`tool-button ${tool === 'dashed' ? 'active' : ''}`} onClick={() => setTool('dashed')} title="Dashed Line">
              <span className="icon">✚</span> {/* Plus sign icon (can be replaced) */}
              <span className="button-text">Dashed</span>
            </button>
            <button className={`tool-button ${tool === 'calligraphy' ? 'active' : ''}`} onClick={() => setTool('calligraphy')} title="Calligraphy Pen">
              <span className="icon">✏</span> {/* Pen icon */}
              <span className="button-text">Calligraphy</span>
            </button>
          </div>

          <div className="tool-separator"></div>

          {/* Shape Tools Group */}
          <div className="tool-group tool-group-shapes">
            <button className={`tool-button ${tool === 'rect' ? 'active' : ''}`} onClick={() => setTool('rect')} title="Rectangle">
              <span className="icon">▭</span> {/* Square icon */}
              <span className="button-text">Rect</span>
            </button>
            <button className={`tool-button ${tool === 'circle' ? 'active' : ''}`} onClick={() => setTool('circle')} title="Circle">
              <span className="icon">●</span> {/* Circle icon */}
              <span className="button-text">Circle</span>
            </button>
            <button className={`tool-button ${tool === 'text' ? 'active' : ''}`} onClick={() => setTool('text')} title="Text">
              <span className="icon"></span> {/* Text icon */}
              <span className="button-text">Text</span>
            </button>
          </div>

          <div className="tool-separator"></div>

          {/* Drawing Properties Group (Color, Width, Opacity, Line Cap) */}
          <div className="tool-group tool-group-properties">
            <div className="tool-property-item">
              <label htmlFor="stroke-color-picker" className="tool-label">Stroke:</label>
              <input type="color" id="stroke-color-picker" className="color-picker" value={strokeColor} onChange={(e) => { setStrokeColor(e.target.value); if (tool !== 'eraser' && !['rect', 'circle', 'text'].includes(tool)) setTool('pen'); }} title="Stroke Color" />
            </div>

            <div className="tool-property-item">
              <label htmlFor="fill-color-picker" className="tool-label">Fill:</label>
              <input type="color" id="fill-color-picker" className="color-picker" value={fillColor} onChange={(e) => { setFillColor(e.target.value); if (['pen', 'marker', 'dashed', 'calligraphy', 'eraser'].includes(tool)) { setTool('rect'); } }} title="Fill Color" />
            </div>

            <div className="tool-property-item tool-slider-item">
              <label htmlFor="stroke-width-slider" className="tool-label">Width:</label>
              <input type="range" id="stroke-width-slider" min="1" max="20" value={strokeWidth} onChange={(e) => setStrokeWidth(parseInt(e.target.value, 10))} className="stroke-width-slider" title={`Stroke Width: ${strokeWidth}px`} />
              <span className="stroke-width-display">{strokeWidth}px</span>
            </div>

            {tool !== 'eraser' && (
              <div className="tool-property-item tool-slider-item">
                <label htmlFor="brush-opacity-slider" className="tool-label">Opacity:</label>
                <input type="range" id="brush-opacity-slider" min="0.1" max="1.0" step="0.05" value={brushOpacity} onChange={(e) => setBrushOpacity(parseFloat(e.target.value))} className="stroke-width-slider" title={`Opacity: ${Math.round(brushOpacity * 100)}%`} />
                <span className="stroke-width-display">{Math.round(brushOpacity * 100)}%</span>
              </div>
            )}

            {['pen', 'marker', 'dashed', 'calligraphy'].includes(tool) && (
              <div className="tool-property-item">
                <label htmlFor="line-cap-select" className="tool-label">Cap:</label>
                <select id="line-cap-select" value={lineCap} onChange={(e) => setLineCap(e.target.value)} className="tool-select">
                  <option value="round">Round</option>
                  <option value="butt">Butt</option>
                  <option value="square">Square</option>
                </select>
              </div>
            )}
          </div>

          <div className="tool-separator"></div>

          {/* Action Buttons Group */}
          <div className="tool-group tool-group-actions">
            <button className={`tool-button ${tool === 'eraser' ? 'active' : ''}`} onClick={() => setTool('eraser')} title="Eraser">
              <span className="icon">❌</span> {/* Cross mark icon */}
              <span className="button-text">Eraser</span>
            </button>
            <button className="tool-button" onClick={handleClearWhiteboard} title="Clear All">
              <span className="icon"></span> {/* Wastebasket icon */}
              <span className="button-text">Clear All</span>
            </button>
            <button className="tool-button danger-button" onClick={handleCloseRoom} title="Close & Delete Room">
              <span className="icon">✖</span> {/* Multiplication X icon */}
              <span className="button-text">Close Room</span>
            </button>
          </div>
        </div>
        {/* --- PROFESSIONAL TOOL PALETTE END --- */}

        <div className="whiteboard-canvas-container" ref={canvasContainerRef}>
          <Stage
            width={stageDimensions.width} height={stageDimensions.height}
            onMouseDown={handleMouseDown} onMousemove={handleMouseMove} onMouseup={handleMouseUp}
            onTouchStart={handleMouseDown} onTouchMove={handleMouseMove} onTouchEnd={handleMouseUp}
            ref={stageRef}
            style={{
                cursor: getCursorStyle(),
                backgroundColor: 'white',
                touchAction: 'none'
            }}
          >
            <Layer>
              {drawingObjects.map((obj) => {
                if (obj.type === 'line') {
                  return (
                    <Line
                      key={obj.id}
                      points={obj.points}
                      stroke={obj.stroke}
                      strokeWidth={obj.strokeWidth}
                      opacity={obj.opacity || 1.0}
                      lineCap={obj.lineCap || 'round'}
                      lineJoin="round"
                      dash={obj.dash || []}
                      tension={0.5}
                      globalCompositeOperation={obj.tool === 'eraser' ? 'destination-out' : 'source-over'}
                    />
                  );
                } else {
                  return (
                    <ColoredRect
                      key={obj.id} shapeProps={obj} isSelected={obj.id === selectedId}
                      onSelect={() => { selectShape(obj.id); setTool('select'); }}
                      onChange={handleObjectChange} activeTool={tool} />
                  );
                }
              })}
            </Layer>
          </Stage>
        </div>
        <p className="hint-text margin-top-md">Use the tools above to draw and collaborate!</p>
      </div>

      <div className="chat-sidebar">
        <h2>Room Chat</h2>
        <div className="chat-messages">
          {chatMessages.map((msg, index) => (
            <div key={index} className="chat-message">
              <span className="chat-username">{msg.username}:</span> {msg.message}
              <span className="chat-timestamp">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
          <div ref={chatMessagesEndRef} />
        </div>
        <div className="chat-input-group">
          <input type="text" placeholder="Type your message..." value={newChatMessage} onChange={(e) => setNewChatMessage(e.target.value)} onKeyPress={handleChatKeyPress} className="chat-input" />
          <button onClick={handleSendChatMessage} className="send-button">Send</button>
        </div>
      </div>
    </div>
  );
}

export default WhiteboardRoom;