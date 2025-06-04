// whiteboard-frontend/src/components/Lobby.js

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Lobby.css'; // Make sure this CSS file is updated!

function Lobby() {
  const [roomName, setRoomName] = useState('');
  const navigate = useNavigate();

  const handleJoinCreateRoom = () => {
    if (roomName.trim()) {
      navigate(`/room/${roomName.trim()}`);
    } else {
      alert('Please enter a room name to join or create.');
    }
  };

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        <h1>Welcome to the Collaborative Whiteboard</h1>
        <p className="sub-heading">Join an existing room or create a new one!</p>
        <div className="room-input-group">
          <input
            type="text"
            placeholder="Enter room name (e.g., MyRoom123)"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleJoinCreateRoom();
              }
            }}
            className="room-input"
          />
          <button onClick={handleJoinCreateRoom} className="join-button">
            Go to Whiteboard
          </button>
        </div>
        <p className="hint-text">
          No room list here! Just type a name, and we'll create it for you if it doesn't exist.
        </p>
      </div>
    </div>
  );
}

export default Lobby;