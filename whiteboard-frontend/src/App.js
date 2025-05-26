// whiteboard-frontend/src/App.js

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Lobby from './components/Lobby';
import WhiteboardRoom from './components/WhiteboardRoom';
import './App.css'; // Keep App.css for general styling

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/room/:roomName" element={<WhiteboardRoom />} />
        {/* Fallback for unknown routes */}
        <Route path="*" element={<h1>404 - Not Found</h1>} />
      </Routes>
    </Router>
  );
}

export default App;