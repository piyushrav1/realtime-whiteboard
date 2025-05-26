import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Line, Rect, Circle, Text, Transformer } from 'react-konva';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import './WhiteboardRoom.css';

// IMPORTANT: Make sure YOUR_PC_IP_ADDRESS is replaced with your actual PC's IP.
// Example: const socket = io('http://192.168.1.100:5000');
const socket = io('http://192.168.1.102:5000');

// Helper component for selectable/transformable Konva nodes
const ColoredRect = ({ shapeProps, isSelected, onSelect, onChange }) => {
  const shapeRef = useRef();
  const trRef = useRef(); // Ref for the Konva Transformer

  // This effect ensures the transformer is attached when a shape becomes selected
  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    } else if (!isSelected && trRef.current) {
      // If deselected, remove nodes from transformer
      trRef.current.nodes([]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected, shapeProps.type]); // Add shapeProps.type as dependency to re-run on type change if needed

  // Handle double click for text editing or general selection behavior
  const handleDblClick = (e) => {
    // First, ensure this object becomes selected.
    // This will cause the Transformer to mount if it's not already.
    onSelect(); // This sets `selectedId` in parent, making `isSelected` true for this shape

    // If it's a text object, proceed with text editing logic
    if (shapeProps.type === 'text') {
      // Defer the text editing to allow React to render the Transformer first
      setTimeout(() => {
        // Check if transformer is still available after the timeout
        if (trRef.current) {
          // Hide transformer to allow direct text editing
          trRef.current.nodes([]);
          trRef.current.getLayer().batchDraw();
        }

        const textNode = shapeRef.current;
        if (!textNode) return; // Safeguard

        textNode.hide(); // Hide the Konva Text node
        textNode.getLayer().batchDraw();

        const textPosition = textNode.absolutePosition();
        // Get the stage's bounding rect to correctly position the HTML textarea
        const stageBox = textNode.getStage().container().getBoundingClientRect();

        // Create a textarea over the Konva text
        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);

        textarea.value = textNode.text();
        textarea.style.position = 'absolute';
        textarea.style.top = (textPosition.y + stageBox.top) + 'px'; // Adjust for stage position on page
        textarea.style.left = (textPosition.x + stageBox.left) + 'px'; // Adjust for stage position on page
        textarea.style.width = textNode.width() - textNode.padding() * 2 + 'px';
        textarea.style.height = textNode.height() - textNode.padding() * 2 + 5 + 'px'; // +5 for cursor
        textarea.style.fontSize = textNode.fontSize() + 'px';
        textarea.style.border = 'none';
        textarea.style.padding = '0px';
        textarea.style.margin = '0px';
        textarea.style.overflow = 'hidden';
        textarea.style.background = 'none';
        textarea.style.outline = 'none';
        textarea.style.resize = 'none';
        textarea.style.lineHeight = textNode.lineHeight();
        textarea.style.fontFamily = textNode.fontFamily();
        textarea.style.transformOrigin = 'left top';
        textarea.style.textAlign = textNode.align();
        textarea.style.color = textNode.fill();
        textarea.style.transform = `rotateZ(${textNode.rotation()}deg)`;
        textarea.style.zIndex = '9999'; // Ensure it's above other elements

        textarea.focus();

        const removeTextarea = () => {
          document.body.removeChild(textarea);
          textNode.show();
          textNode.getLayer().batchDraw();
          // onSelect(null); // Optional: Deselect the text after editing if desired
        };

        textarea.addEventListener('keydown', (e) => {
          // Hide on enter (but allow shift+enter for new line)
          if (e.key === 'Enter' && !e.shiftKey) {
            textarea.blur(); // Trigger blur to save on Enter
          }
          // Escape for cancelling
          if (e.key === 'Escape') {
            removeTextarea(); // Remove without saving on Escape
          }
        });

        textarea.addEventListener('blur', () => {
          onChange({
            ...shapeProps,
            text: textarea.value,
          });
          removeTextarea();
        });
      }, 0); // Small timeout to allow React to render updates
    } else {
      // For other shapes, just the onSelect() called at the beginning is enough
      // No additional logic here for non-text shapes on double-click
    }
  };

  // Render the appropriate Konva shape based on type
  const currentKonvaNode = (
    shapeProps.type === 'rect' ? (
      <Rect
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={handleDblClick}
        onDblTap={handleDblClick}
        ref={shapeRef}
        {...shapeProps}
        draggable
        onDragEnd={(e) => {
          onChange({
            ...shapeProps,
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={(e) => {
          // transformer is changing scale of the node
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();

          // reset scale to 1 and apply all changes to width, height, rotation
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...shapeProps,
            x: node.x(),
            y: node.y(),
            width: Math.max(5, node.width() * scaleX),
            height: Math.max(5, node.height() * scaleY),
            rotation: node.rotation(),
          });
        }}
      />
    ) : shapeProps.type === 'circle' ? (
      <Circle
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={handleDblClick}
        onDblTap={handleDblClick}
        ref={shapeRef}
        {...shapeProps}
        draggable
        onDragEnd={(e) => {
          onChange({
            ...shapeProps,
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current;
          const scaleX = node.scaleX(); // Circle scales uniformly
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...shapeProps,
            x: node.x(),
            y: node.y(),
            radius: Math.max(5, node.radius() * scaleX),
            rotation: node.rotation(),
          });
        }}
      />
    ) : shapeProps.type === 'text' ? (
      <Text
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={handleDblClick} // Double click to edit text
        onDblTap={handleDblClick}
        ref={shapeRef}
        {...shapeProps}
        draggable
        onDragEnd={(e) => {
          onChange({
            ...shapeProps,
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          // Text often scales font based on X scale for simplicity, keep Y for consistency
          // This ensures font size scales with width
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...shapeProps,
            x: node.x(),
            y: node.y(),
            width: Math.max(5, node.width() * scaleX),
            height: Math.max(5, node.height() * scaleY), // Keep height scalable too
            fontSize: Math.max(8, node.fontSize() * scaleX), // Scale font size with width
            rotation: node.rotation(),
          });
        }}
      />
    ) : null
  );

  return (
    <>
      {currentKonvaNode}
      {isSelected && currentKonvaNode && ( // Also check currentKonvaNode exists before rendering Transformer
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            // Limit minimal size
            if (newBox.width < 5 || newBox.height < 5) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
};


function WhiteboardRoom() {
  const { roomName } = useParams();
  const navigate = useNavigate();
  // UPDATED: 'lines' now holds all drawing objects
  const [drawingObjects, setDrawingObjects] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const stageRef = useRef(null);
  const currentObjectId = useRef(null); // Renamed from currentLineId

  const [chatMessages, setChatMessages] = useState([]);
  const [newChatMessage, setNewChatMessage] = useState('');
  const chatMessagesEndRef = useRef(null);

  const [stageDimensions, setStageDimensions] = useState({
    width: window.innerWidth * 0.7,
    height: window.innerHeight * 0.8
  });
  const canvasContainerRef = useRef(null);

  // UPDATED: Tool properties
  const [tool, setTool] = useState('pen'); // 'pen', 'eraser', 'select', 'rect', 'circle', 'text'
  const [strokeColor, setStrokeColor] = useState('#000000'); // Default black
  const [strokeWidth, setStrokeWidth] = useState(5); // Default width
  const [fillColor, setFillColor] = useState('transparent'); // For shapes
  const [selectedId, selectShape] = useState(null); // For selection tool

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

    // UPDATED: Receive an object with drawingObjects (formerly lines) and messages
    socket.on('whiteboardState', (data) => {
      console.log('Received initial room state:', data);
      setDrawingObjects(data.lines); // 'lines' field in data now contains all objects
      setChatMessages(data.messages);
    });

    // UPDATED: Listen for generic drawingStarted events
    socket.on('drawingStarted', (newObject) => {
        setDrawingObjects((prevObjects) => [...prevObjects, newObject]);
    });

    // UPDATED: Listen for drawing events (only for lines)
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

    // UPDATED: Listen for drawingFinished events
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

    // NEW: Listen for object updates (move, resize, edit text)
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

    // NEW: Listen for whiteboard cleared event
    socket.on('whiteboardCleared', () => {
        setDrawingObjects([]); // Clear all objects locally
        selectShape(null); // Deselect any selected object
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
      socket.off('objectUpdated');
      socket.off('whiteboardCleared');
      socket.off('chatMessage');
      socket.off('userJoined');
    };
  }, [roomName, navigate]);

  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Function to handle changes to drawing objects (for Konva Transformer)
  const handleObjectChange = (updatedObject) => {
    setDrawingObjects((prevObjects) => {
      return prevObjects.map((obj) => {
        if (obj.id === updatedObject.id) {
          return updatedObject;
        }
        return obj;
      });
    });
    // Emit update to backend only for changes (x,y,width,height,rotation,text etc.)
    socket.emit('updateObject', { roomName, objectId: updatedObject.id, newAttributes: updatedObject });
  };


  // --- Drawing Logic (UPDATED for various tools) ---
  const handleMouseDown = (e) => {
    // Deselect if clicking on empty space and tool is 'select'
    const clickedOnEmpty = e.target === e.target.getStage();
    if (tool === 'select' && clickedOnEmpty) {
      selectShape(null);
      return; // No drawing for select tool
    }

    if (e.evt.type === 'touchstart') {
        e.evt.preventDefault();
    }
    setIsDrawing(true);
    const pos = e.target.getStage().getPointerPosition();
    const newObjectId = `${socket.id}-${Date.now()}`;
    currentObjectId.current = newObjectId;
    selectShape(null); // Deselect existing objects when starting a new drawing

    let newObject;
    switch (tool) {
      case 'pen':
      case 'eraser':
        newObject = {
          id: newObjectId,
          type: 'line', // Always 'line' for pen/eraser
          points: [pos.x, pos.y],
          stroke: tool === 'eraser' ? '#FFFFFF' : strokeColor, // Eraser color is whiteboard background
          strokeWidth: tool === 'eraser' ? strokeWidth + 10 : strokeWidth, // Eraser slightly wider
          tool: tool // Keep tool property for eraser's composite operation (Konva only)
        };
        break;
      case 'rect':
        newObject = {
          id: newObjectId,
          type: 'rect',
          x: pos.x,
          y: pos.y,
          width: 0, height: 0, // Will be updated on mouse move
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          fill: fillColor,
        };
        break;
      case 'circle':
        newObject = {
          id: newObjectId,
          type: 'circle',
          x: pos.x,
          y: pos.y,
          radius: 0, // Will be updated on mouse move
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          fill: fillColor,
        };
        break;
      case 'text': // For text, we'll create a default text box on click
        newObject = {
          id: newObjectId,
          type: 'text',
          x: pos.x,
          y: pos.y,
          text: 'Double click to edit',
          fontSize: 20,
          fontFamily: 'Arial',
          stroke: strokeColor, // Border for text (optional)
          fill: strokeColor, // Text color is fill property for Konva Text
          width: 200, // Default width for wrapping
          height: 30, // Default height, will expand with text
          rotation: 0
        };
        setIsDrawing(false); // Text is not "drawn" by dragging, it's placed
        socket.emit('startDrawing', { roomName, object: newObject });
        setDrawingObjects((prevObjects) => [...prevObjects, newObject]);
        selectShape(newObjectId); // Select the new text object for immediate editing/moving
        return; // Exit early for text tool as it's not a drag-and-draw
      case 'select':
        // Selection handled by ColoredRect's onClick
        setIsDrawing(false);
        return;
      default:
        return; // No action for unknown tools
    }

    setDrawingObjects((prevObjects) => [...prevObjects, newObject]);
    socket.emit('startDrawing', { roomName, object: newObject });
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
    let currentObject = drawingObjects.find(obj => obj.id === currentObjectId.current);

    if (currentObject) {
      const newObjects = [...drawingObjects];
      const index = newObjects.findIndex(obj => obj.id === currentObject.id);

      switch (currentObject.type) {
        case 'line':
          currentObject.points = currentObject.points.concat([point.x, point.y]);
          newObjects[index] = currentObject;
          setDrawingObjects(newObjects);
          socket.emit('drawing', { roomName, objectId: currentObjectId.current, newPoints: [point.x, point.y] });
          break;
        case 'rect':
          // Calculate width/height from initial click (x,y) to current pointer (point.x, point.y)
          // Handle drawing from right-to-left or bottom-to-top
          const newX = Math.min(currentObject.x, point.x);
          const newY = Math.min(currentObject.y, point.y);
          const newWidth = Math.abs(point.x - currentObject.x);
          const newHeight = Math.abs(point.y - currentObject.y);

          currentObject = {
              ...currentObject,
              x: newX,
              y: newY,
              width: newWidth,
              height: newHeight
          };
          newObjects[index] = currentObject;
          setDrawingObjects(newObjects);
          socket.emit('updateObject', { roomName, objectId: currentObjectId.current, newAttributes: {
              x: newX, y: newY, width: newWidth, height: newHeight
          }});
          break;
        case 'circle':
          // Calculate radius based on distance from initial click to current pointer
          currentObject.radius = Math.sqrt(
            Math.pow(point.x - currentObject.x, 2) + Math.pow(point.y - currentObject.y, 2)
          );
          newObjects[index] = currentObject;
          setDrawingObjects(newObjects);
          socket.emit('updateObject', { roomName, objectId: currentObjectId.current, newAttributes: {
              radius: currentObject.radius
          }});
          break;
        default:
          break; // Do nothing for other types during mousemove
      }
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    // Only emit endDrawing if it was an actual drawing tool (not text or select)
    if (tool !== 'select' && tool !== 'text') {
      const finalObject = drawingObjects.find(obj => obj.id === currentObjectId.current);
      if (finalObject) {
          // Ensure final object state reflects the tool used for drawing (e.g., eraser's width)
          socket.emit('endDrawing', { roomName, objectId: currentObjectId.current, finalObjectState: finalObject });
      }
    }
    currentObjectId.current = null; // Clear the current object ID
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

  const handleClearWhiteboard = () => {
    if (window.confirm('Are you sure you want to clear the entire whiteboard? This cannot be undone!')) {
      socket.emit('clearWhiteboard', roomName);
    }
  };

  // Determine cursor based on active tool
  const getCursorStyle = () => {
    switch (tool) {
      case 'pen':
      case 'eraser':
      case 'rect':
      case 'circle':
        return 'crosshair';
      case 'text':
        return 'text';
      case 'select':
        return selectedId ? 'move' : 'default'; // Cursor changes when hovering over selected object
      default:
        return 'default';
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

        {/* Professional Tool Palette */}
        <div className="tool-palette">
          <button
            className={`tool-button ${tool === 'select' ? 'active' : ''}`}
            onClick={() => { setTool('select'); selectShape(null); }}
            title="Select & Move"
          >
            👆 Select
          </button>
          <button
            className={`tool-button ${tool === 'pen' ? 'active' : ''}`}
            onClick={() => setTool('pen')}
            title="Pen"
          >
            ✏️ Pen
          </button>
          <button
            className={`tool-button ${tool === 'eraser' ? 'active' : ''}`}
            onClick={() => setTool('eraser')}
            title="Eraser"
          >
            🧽 Eraser
          </button>
          <div className="tool-separator"></div> {/* Visual separator */}
          <button
            className={`tool-button ${tool === 'rect' ? 'active' : ''}`}
            onClick={() => setTool('rect')}
            title="Rectangle"
          >
            ◻️ Rectangle
          </button>
          <button
            className={`tool-button ${tool === 'circle' ? 'active' : ''}`}
            onClick={() => setTool('circle')}
            title="Circle"
          >
            ⚫ Circle
          </button>
          <button
            className={`tool-button ${tool === 'text' ? 'active' : ''}`}
            onClick={() => setTool('text')}
            title="Text"
          >
            🅰️ Text
          </button>

          <div className="tool-separator"></div>

          <input
            type="color"
            className="color-picker"
            value={strokeColor}
            onChange={(e) => {
                setStrokeColor(e.target.value);
                if (tool !== 'eraser') setTool('pen'); // Auto switch to pen if not eraser
            }}
            title="Stroke Color"
          />
          <input
            type="color"
            className="color-picker"
            value={fillColor}
            onChange={(e) => {
                setFillColor(e.target.value);
                // Auto switch to a shape tool if changing fill, but not if current tool is line/eraser
                if (tool === 'pen' || tool === 'eraser') {
                    setTool('rect'); // Default to rect if pen/eraser is active
                }
            }}
            title="Fill Color"
          />

          <input
            type="range"
            min="1"
            max="20"
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(parseInt(e.target.value, 10))}
            className="stroke-width-slider"
            title={`Stroke Width: ${strokeWidth}px`}
          />
          <span className="stroke-width-display">{strokeWidth}px</span>

          <div className="tool-separator"></div>

          <button className="tool-button" onClick={handleClearWhiteboard} title="Clear All">
            🗑️ Clear All
          </button>
        </div>

        <div className="whiteboard-canvas-container" ref={canvasContainerRef}>
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
                cursor: getCursorStyle(), // Dynamic cursor based on tool
                backgroundColor: 'white',
                touchAction: 'none'
            }}
          >
            <Layer>
              {drawingObjects.map((obj, i) => {
                // Render different Konva components based on object type
                if (obj.type === 'line') {
                  return (
                    <Line
                      key={obj.id}
                      points={obj.points}
                      stroke={obj.stroke}
                      strokeWidth={obj.strokeWidth}
                      tension={0.5}
                      lineCap="round"
                      lineJoin="round"
                      globalCompositeOperation={
                        obj.tool === 'eraser' ? 'destination-out' : 'source-over'
                      }
                    />
                  );
                } else {
                  return (
                    <ColoredRect
                      key={obj.id}
                      shapeProps={obj}
                      isSelected={obj.id === selectedId}
                      onSelect={() => {
                        selectShape(obj.id);
                        setTool('select'); // Automatically switch to select tool when an object is clicked
                      }}
                      onChange={handleObjectChange}
                    />
                  );
                }
              })}
            </Layer>
          </Stage>
        </div>
        <p className="hint-text margin-top-md">
          Use the tools above to draw and collaborate!
        </p>
      </div>

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