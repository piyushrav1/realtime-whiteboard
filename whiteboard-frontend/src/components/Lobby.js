// whiteboard-frontend/src/components/Lobby.js

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Lobby.css'; // We'll create this CSS file

function Lobby() {
  const [roomName, setRoomName] = useState('');
  const navigate = useNavigate();

  const handleJoinCreateRoom = () => {
    if (roomName.trim()) {
      navigate(`/room/${roomName.trim()}`);
    } else {
      alert('Please enter a room name.');
    }
  };

  return (
    <div className="lobby-container">
      <h1>Join or Create a Whiteboard Room</h1>
      <div className="room-input-group">
        <input
          type="text"
          placeholder="Enter room name"
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
        (If the room doesn't exist, it will be created automatically.)
      </p>
    </div>
  );
}

export default Lobby;