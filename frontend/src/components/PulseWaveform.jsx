import React, { useRef, useEffect } from 'react'
import useSocketStore from '../stores/socketStore'

const PulseWaveform = ({ pulseHistory, pulseValue, pulseHolding, pulseTotal, threshold = 60 }) => {
  const { driftSummary } = useSocketStore()
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const animationRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    let width = container.clientWidth
    let height = 80

    const resizeCanvas = () => {
      width = container.clientWidth
      canvas.width = width
      canvas.height = height
      // Handle high DPI displays for crisper rendering
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas()
    })
    resizeObserver.observe(container)
    resizeCanvas()

    const draw = () => {
      ctx.clearRect(0, 0, width, height)

      // Draw threshold line
      ctx.beginPath()
      ctx.setLineDash([5, 5])
      const thresholdY = height - (threshold / 100) * height
      ctx.moveTo(0, thresholdY)
      ctx.lineTo(width, thresholdY)
      ctx.strokeStyle = 'rgba(156, 163, 175, 0.5)' // Gray text-secondary equivalent
      ctx.stroke()
      ctx.setLineDash([])

      if (pulseHistory && pulseHistory.length > 0) {
        // Find time window (last 60 seconds)
        const now = Date.now()
        const startTime = now - 60000

        ctx.beginPath()
        
        // Start from bottom left or first point
        const getX = (t) => {
          const ratio = (t - startTime) / 60000
          return Math.max(0, ratio * width)
        }
        
        const getY = (val) => {
          return height - (val / 100) * height
        }

        // Draw area fill
        const isWarning = pulseValue < threshold
        const accentColor = isWarning ? '#ef4444' : '#3b82f6' // fallback colors
        // Use computed CSS variables if possible
        const computedStyle = getComputedStyle(document.body)
        const accentVar = isWarning ? computedStyle.getPropertyValue('--error-color').trim() || '#ef4444' : computedStyle.getPropertyValue('--accent-color').trim() || '#3b82f6'

        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, height)
        gradient.addColorStop(0, accentVar)
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

        // Path
        const validHistory = pulseHistory.filter(p => p.t >= startTime)
        
        if (validHistory.length > 0) {
          ctx.moveTo(getX(validHistory[0].t), height)
          
          validHistory.forEach(point => {
            ctx.lineTo(getX(point.t), getY(point.value))
          })
          
          // Connect to the very current time if needed
          if (validHistory[validHistory.length - 1].t < now) {
             ctx.lineTo(width, getY(validHistory[validHistory.length - 1].value))
          }
          
          ctx.lineTo(width, height)
          ctx.closePath()

          ctx.fillStyle = gradient
          ctx.globalAlpha = 0.4
          ctx.fill()
          ctx.globalAlpha = 1.0

          // Draw stroke
          ctx.beginPath()
          ctx.moveTo(getX(validHistory[0].t), getY(validHistory[0].value))
          validHistory.forEach(point => {
            ctx.lineTo(getX(point.t), getY(point.value))
          })
          if (validHistory[validHistory.length - 1].t < now) {
            ctx.lineTo(width, getY(validHistory[validHistory.length - 1].value))
          }
          
          ctx.strokeStyle = accentVar
          ctx.lineWidth = 2
          ctx.stroke()
        }
      }

      animationRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      resizeObserver.disconnect()
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [pulseHistory, pulseValue, threshold])

  const isWarning = pulseValue < threshold

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ 
          fontSize: 32, 
          fontWeight: 700, 
          color: isWarning ? 'var(--error-color, #ef4444)' : 'var(--accent-color, #3b82f6)' 
        }}>
          {Math.round(pulseValue)}%
        </span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          {pulseHolding} of {pulseTotal} students following
        </span>
        {isWarning && pulseTotal > 0 && (
          <span style={{
            background: 'var(--error-color, #ef4444)',
            color: 'white',
            padding: '2px 10px',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
          }}>
            Room losing focus
          </span>
        )}
      </div>
      <div 
        ref={containerRef} 
        style={{ 
          width: '100%', 
          height: '80px', 
          position: 'relative',
          borderRadius: '8px',
          overflow: 'hidden',
          background: 'var(--bg-secondary)'
        }}
      >
        <canvas 
          ref={canvasRef} 
          style={{ display: 'block' }}
        />
      </div>

      {driftSummary && (
        <div style={{
          marginTop: 8,
          fontSize: 12,
          color: 'var(--text-secondary)',
          borderLeft: '3px solid var(--accent-color, #7c3aed)',
          paddingLeft: 8
        }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {driftSummary.totalResponded} students flagged:
          </span>
          {' '}{driftSummary.topConcept}
          <span style={{ color: 'var(--text-secondary)' }}>
            {' '}({driftSummary.topConceptCount})
          </span>
        </div>
      )}
    </div>
  )
}

export default PulseWaveform
