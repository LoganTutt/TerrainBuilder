import React, { useState, useEffect } from 'react';
import Viewer from './Viewer';
import Sidebar from './Sidebar';

export default function App() {
  const [models, setModels] = useState([]);

  useEffect(() => {
    window.require("fs").readdir('./public/models', (err, files) => {
      if (!err) {
        setModels(files.filter(file => file.endsWith('.stl')));
      }
    });
    // setModels(["test.stl", "test2.stl"]);
  }, []);

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative', display: 'flex' }}>
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, color: 'white', background: 'rgba(0,0,0,0.5)', padding: '0.5rem', borderRadius: '0.5rem' }}>
        <h1>Terrain Designer</h1>
      </div>
      <Sidebar models={models} />
      <Viewer />
    </div>
  );
}