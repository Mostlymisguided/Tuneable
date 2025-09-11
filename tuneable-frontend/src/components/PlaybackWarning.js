import React from 'react';

const styles = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0,
    width: '100%', height: '100%',
    background: 'rgba(0, 0, 0, 0.4)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  modal: {
    background: '#fff',
    padding: '24px',
    borderRadius: '12px',
    maxWidth: '360px',
    textAlign: 'center',
    boxShadow: '0px 8px 20px rgba(0,0,0,0.3)',
  },
  title: {
    fontSize: '1.4rem',
    marginBottom: '12px',
    color: '#9100ff',
  },
  message: {
    fontSize: '1rem',
    color: '#333',
  },
  button: {
    marginTop: '20px',
    padding: '10px 16px',
    background: '#9100ff',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontWeight: 'bold',
    cursor: 'pointer',
  }
};

const PlaybackWarning = ({ onClose }) => (
  <div style={styles.overlay}>
    <div style={styles.modal}>
      <h3 style={styles.title}>🚫 Playback Controls Disabled</h3>
      <p style={styles.message}>
        Only the host can control playback (play, pause, skip).<br />
        Sit back, vibe, and bid to shape the queue! 🎶
      </p>
      <button style={styles.button} onClick={onClose}>Got it!</button>
    </div>
  </div>
);

export default PlaybackWarning;