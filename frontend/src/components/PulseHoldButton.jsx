import React, { useState, useEffect } from 'react'

const PulseHoldButton = ({ onHoldChange }) => {
  const [held, setHeld] = useState(false)

  // Ensure that if the component unmounts while held, we emit a false signal to avoid ghost counts
  useEffect(() => {
    return () => {
      if (held) {
        onHoldChange(false)
      }
    }
  }, [held, onHoldChange])

  const startHold = () => {
    if (!held) {
      setHeld(true)
      onHoldChange(true)
    }
  }

  const endHold = () => {
    if (held) {
      setHeld(false)
      onHoldChange(false)
    }
  }

  return (
    <button
      aria-label="Hold to show understanding"
      onMouseDown={startHold}
      onMouseUp={endHold}
      onMouseLeave={endHold}
      onTouchStart={(e) => { e.preventDefault(); startHold() }}
      onTouchEnd={(e) => { e.preventDefault(); endHold() }}
      onTouchCancel={(e) => { e.preventDefault(); endHold() }}
      style={{
        width: 100,
        height: 100,
        borderRadius: '50%',
        background: held ? 'var(--accent-color, #7c3aed)' : 'var(--bg-secondary)',
        border: `3px solid var(--accent-color, #7c3aed)`,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        transform: held ? 'scale(0.95)' : 'scale(1)',
        boxShadow: held ? '0 0 24px var(--accent-color, #7c3aed)' : 'var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06))',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
      }}
    />
  )
}

export default PulseHoldButton
