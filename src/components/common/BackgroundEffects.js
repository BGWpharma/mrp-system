import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

const BackgroundEffects = () => {
  const { mode } = useTheme();

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: mode === 'light'
        ? 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%)'
        : 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
      zIndex: -2,
      pointerEvents: 'none'
    }} />
  );
};

export default BackgroundEffects;
