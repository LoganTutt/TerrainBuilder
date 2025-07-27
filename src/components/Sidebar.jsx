import React from 'react';

export default function Sidebar({ models }) {
  const handleDragStart = (e, model) => {
    e.dataTransfer.setData('model', model);
  };

  return (
    <div style={{ width: '200px', backgroundColor: '#2c2c2c', color: 'white', padding: '10px', zIndex: 10 }}>
      <h3>Models</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {models.map(model => (
          <li
            key={model}
            draggable
            onDragStart={e => handleDragStart(e, model)}
            style={{ cursor: 'grab', padding: '4px 0' }}
          >
            {model}
          </li>
        ))}
      </ul>
    </div>
  );
}