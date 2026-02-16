import React, { useMemo } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

const BackgroundEffects = () => {
  const { mode } = useTheme();
  
  const animationStyles = useMemo(() => ({
    lightPulse: {
      animationName: 'lightPulse',
      animationDuration: '3s',
      animationTimingFunction: 'ease-in-out',
      animationIterationCount: 'infinite'
    },
    lightPulseDelay1: {
      animationName: 'lightPulse',
      animationDuration: '4s',
      animationTimingFunction: 'ease-in-out',
      animationIterationCount: 'infinite',
      animationDelay: '1s'
    },
    lightPulseDelay2: {
      animationName: 'lightPulse',
      animationDuration: '3s',
      animationTimingFunction: 'ease-in-out',
      animationIterationCount: 'infinite',
      animationDelay: '2s'
    },
    darkPulse: {
      animationName: 'darkPulse',
      animationDuration: '2s',
      animationTimingFunction: 'ease-in-out',
      animationIterationCount: 'infinite'
    },
    darkPulseDelay1: {
      animationName: 'darkPulse',
      animationDuration: '3s',
      animationTimingFunction: 'ease-in-out',
      animationIterationCount: 'infinite',
      animationDelay: '1s'
    },
    darkPulseDelay2: {
      animationName: 'darkPulse',
      animationDuration: '2s',
      animationTimingFunction: 'ease-in-out',
      animationIterationCount: 'infinite',
      animationDelay: '2s'
    }
  }), []);

  if (mode === 'light') {
    return (
      <>
        {/* Główny gradient tła dla jasnego motywu */}
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(to bottom right, #f8fafc, #e2e8f0, #e0e7ff)',
          zIndex: -2,
          pointerEvents: 'none'
        }} />
        
        {/* Efekty kolorowych kół dla jasnego motywu */}
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: -1
        }}>
          <div style={{
            position: 'absolute',
            top: '16.67%', // top-1/6
            left: '16.67%', // left-1/6
            width: '384px',
            height: '384px',
            background: '#3b82f6',
            borderRadius: '50%',
            mixBlendMode: 'normal',
            filter: 'blur(40px)',
            opacity: 0.02,
            animationName: 'lightPulse',
            animationDuration: '3s',
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: 'infinite'
          }} />
          
          <div style={{
            position: 'absolute',
            top: '66.67%', // top-2/3
            right: '25%', // right-1/4
            width: '384px',
            height: '384px',
            background: '#8b5cf6',
            borderRadius: '50%',
            mixBlendMode: 'normal',
            filter: 'blur(40px)',
            opacity: 0.015,
            animationName: 'lightPulse',
            animationDuration: '3s',
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: 'infinite',
            animationDelay: '2s'
          }} />
          
          <div style={{
            position: 'absolute',
            top: '25%',
            right: '16.67%', // right-1/6
            width: '320px',
            height: '320px',
            background: '#06b6d4',
            borderRadius: '50%',
            mixBlendMode: 'normal',
            filter: 'blur(40px)',
            opacity: 0.01,
            animationName: 'lightPulse',
            animationDuration: '4s',
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: 'infinite',
            animationDelay: '1s'
          }} />
        </div>

        <style>{`
          @keyframes lightPulse {
            0%, 100% { 
              opacity: 0.01;
            }
            50% { 
              opacity: 0.03;
            }
          }
        `}</style>
      </>
    );
  }

  // Tryb ciemny
  return (
    <>
      {/* Główny gradient tła dla ciemnego motywu */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(to bottom right, #111827, #1f2937, #1e3a8a)',
        zIndex: -2,
        pointerEvents: 'none'
      }} />
      
      {/* Efekty kolorowych kół dla ciemnego motywu */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: -1
      }}>
        <div style={{
          position: 'absolute',
          top: '16.67%', // top-1/6
          left: '16.67%', // left-1/6
          width: '384px',
          height: '384px',
          background: '#3b82f6',
          borderRadius: '50%',
          mixBlendMode: 'multiply',
          filter: 'blur(40px)',
          opacity: 0.05,
          animationName: 'darkPulse',
          animationDuration: '2s',
          animationTimingFunction: 'ease-in-out',
          animationIterationCount: 'infinite'
        }} />
        
        <div style={{
          position: 'absolute',
          top: '66.67%', // top-2/3
          right: '25%', // right-1/4
          width: '384px',
          height: '384px',
          background: '#a855f7',
          borderRadius: '50%',
          mixBlendMode: 'multiply',
          filter: 'blur(40px)',
          opacity: 0.05,
          animationName: 'darkPulse',
          animationDuration: '2s',
          animationTimingFunction: 'ease-in-out',
          animationIterationCount: 'infinite',
          animationDelay: '2s'
        }} />
        
        <div style={{
          position: 'absolute',
          top: '25%',
          right: '16.67%', // right-1/6
          width: '320px',
          height: '320px',
          background: '#06b6d4',
          borderRadius: '50%',
          mixBlendMode: 'multiply',
          filter: 'blur(40px)',
          opacity: 0.03,
          animationName: 'darkPulse',
          animationDuration: '3s',
          animationTimingFunction: 'ease-in-out',
          animationIterationCount: 'infinite',
          animationDelay: '1s'
        }} />
      </div>

      <style>{`
        @keyframes darkPulse {
          0%, 100% { 
            opacity: 0.05;
          }
          50% { 
            opacity: 0.15;
          }
        }
      `}</style>
    </>
  );
};

export default BackgroundEffects;
