import React, { useEffect, useState, useRef } from 'react'

const DriftSheet = ({ prompt, roomId, onRespond }) => {
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [progressPct, setProgressPct] = useState(100)
  const animationRef = useRef(null)

  useEffect(() => {
    if (!prompt) {
      setProgressPct(100)
      setSelectedIdx(null)
      return
    }

    const totalDuration = Math.max(1000, prompt.expiresAt - Date.now())
    const startTime = Date.now()

    const updateProgress = () => {
      const elapsed = Date.now() - startTime
      const remainingPct = Math.max(0, 100 - (elapsed / totalDuration) * 100)
      setProgressPct(remainingPct)

      if (remainingPct > 0) {
        animationRef.current = requestAnimationFrame(updateProgress)
      } else {
        // Expired -> dismiss automatically
        onRespond(roomId, prompt.segmentIndex, null, true)
      }
    }

    animationRef.current = requestAnimationFrame(updateProgress)

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [prompt, roomId, onRespond])

  if (!prompt) return null

  const handleSelect = (option, idx) => {
    setSelectedIdx(idx)
    setTimeout(() => {
      onRespond(roomId, prompt.segmentIndex, option, false)
    }, 150)
  }

  const handleDismiss = () => {
    onRespond(roomId, prompt.segmentIndex, null, true)
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        onClick={handleDismiss}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          zIndex: 199,
          animation: 'fadeIn 0.2s ease-out'
        }}
      />

      {/* Bottom Sheet */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-color)',
        borderRadius: '16px 16px 0 0',
        padding: '20px',
        zIndex: 200,
        boxShadow: 'var(--shadow-md, 0 -4px 12px rgba(0,0,0,0.15))',
        transform: 'translateY(0)',
        transition: 'transform 0.2s ease-out',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        maxWidth: '600px',
        margin: '0 auto'
      }}>
        {/* Depleting progress bar */}
        <div style={{
          width: '100%',
          height: '4px',
          background: 'var(--border-color)',
          borderRadius: '2px',
          overflow: 'hidden'
        }}>
          <div style={{
            height: '100%',
            width: `${progressPct}%`,
            background: 'var(--accent-color, #7c3aed)',
            transition: 'width 0.1s linear'
          }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>
            What lost you?
          </h3>
          <button 
            onClick={handleDismiss}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '0 8px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {(prompt.options || []).map((optionText, idx) => {
            const isSelected = selectedIdx === idx
            return (
              <button
                key={idx}
                onClick={() => handleSelect(optionText, idx)}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  background: isSelected ? 'var(--accent-color, #7c3aed)' : 'var(--bg-primary)',
                  color: isSelected ? 'white' : 'var(--text-primary)',
                  border: `1px solid ${isSelected ? 'var(--accent-color, #7c3aed)' : 'var(--border-color)'}`,
                  fontSize: '15px',
                  fontWeight: '500',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {optionText}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

export default DriftSheet
