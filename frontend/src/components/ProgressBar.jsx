// frontend/src/components/ProgressBar.jsx
import React from 'react';

const ProgressBar = ({ title, count, total }) => {
  const percentage = total ? Math.min((count / total) * 100, 100) : 0;

  return (
    <div className="progress-container">
      <div className="progress-text">{title}</div>
      <div className="progress-bar-background">
        <div
          className="progress-bar-fill"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
};

export default ProgressBar;