import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import { API_URL } from '../config.js'

function SurfacePage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuthStore()

  const [report, setReport] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [regenerationCount, setRegenerationCount] = useState(0)

  useEffect(() => {
    if (token && roomId) {
      fetchReport()
    }
  }, [token, roomId])

  const fetchReport = async () => {
    try {
      const res = await fetch(`${API_URL}/surface/${roomId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (res.status === 202) {
        setIsGenerating(true)
        setIsLoading(false)
        // Poll after 3 seconds
        setTimeout(fetchReport, 3000)
        return
      }

      setIsGenerating(false)
      const data = await res.json()

      if (res.ok && data.success) {
        setReport(data.markdown)
        setRegenerationCount(data.regenerationCount || 0)
      } else {
        setError(data.error || 'Failed to load surface report')
      }
    } catch (err) {
      console.error('Error fetching surface report:', err)
      setError('Failed to connect to server')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegenerate = async () => {
    if (regenerationCount >= 3) return

    setIsRegenerating(true)
    try {
      const res = await fetch(`${API_URL}/surface/${roomId}/regenerate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setReport(data.markdown)
        setRegenerationCount(data.regenerationCount || regenerationCount + 1)
      } else {
        alert(data.error || 'Failed to regenerate report')
      }
    } catch (err) {
      console.error('Failed to regenerate report:', err)
      alert('Error regenerating report')
    } finally {
      setIsRegenerating(false)
    }
  }

  const handleCopy = () => {
    if (!report) return
    navigator.clipboard.writeText(report)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    if (!report) return
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Surface_Report_${roomId}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Simple Markdown renderer for sections and lists
  const renderMarkdown = (text) => {
    if (!text) return null

    const lines = text.split('\n')
    return lines.map((line, idx) => {
      if (line.startsWith('## ') || line.startsWith('# ')) {
        return (
          <h2 key={idx} style={{ 
            fontSize: '18px', 
            fontWeight: '700', 
            color: 'var(--text-primary)', 
            marginTop: idx === 0 ? 0 : '24px', 
            marginBottom: '12px',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '6px'
          }}>
            {line.replace(/^#+\s*/, '')}
          </h2>
        )
      }
      if (line.startsWith('• ') || line.startsWith('- ')) {
        return (
          <li key={idx} style={{ 
            fontSize: '14px', 
            color: 'var(--text-primary)', 
            marginBottom: '6px', 
            marginLeft: '16px',
            lineHeight: '1.5'
          }}>
            {line.replace(/^[•-]\s*/, '')}
          </li>
        )
      }
      if (line.trim() === '') {
        return <div key={idx} style={{ height: '8px' }} />
      }
      return (
        <p key={idx} style={{ 
          fontSize: '14px', 
          color: 'var(--text-primary)', 
          margin: '0 0 8px 0', 
          lineHeight: '1.6' 
        }}>
          {line}
        </p>
      )
    })
  }

  if (isLoading || isGenerating) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, marginLeft: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '4px solid var(--border-color)',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }} />
            <p style={{ color: 'var(--text-secondary)' }}>
              {isGenerating ? 'Generating session post-mortem report...' : 'Loading Surface report...'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Sidebar user={user} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px' }}>
        {/* Header */}
        <header style={{
          background: 'var(--header-bg)',
          color: 'white',
          padding: '24px 32px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>
                📋 Session Surface Report
              </h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>
                AI Post-Mortem & Re-Entry Analysis
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={{ flex: 1, padding: '32px' }}>
          {/* Action Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <button
              onClick={() => navigate(`/teacher/room/${roomId}/results`)}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              ← Back to Results
            </button>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button
                onClick={handleCopy}
                style={{
                  padding: '8px 16px',
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                {copied ? '✓ Copied' : '📋 Copy Report'}
              </button>

              <button
                onClick={handleDownload}
                style={{
                  padding: '8px 16px',
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                ⬇️ Download .txt
              </button>

              <button
                onClick={handleRegenerate}
                disabled={regenerationCount >= 3 || isRegenerating}
                style={{
                  padding: '8px 16px',
                  background: regenerationCount >= 3 ? 'var(--border-color)' : '#3b82f6',
                  color: regenerationCount >= 3 ? 'var(--text-secondary)' : 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: regenerationCount >= 3 || isRegenerating ? 'not-allowed' : 'pointer'
                }}
              >
                {isRegenerating 
                  ? '🔄 Regenerating...' 
                  : `🔄 Regenerate (${3 - regenerationCount} left)`}
              </button>
            </div>
          </div>

          {error ? (
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '32px',
              textAlign: 'center',
              border: '1px solid var(--border-color)'
            }}>
              <h3 style={{ color: 'var(--error-color, #ef4444)' }}>{error}</h3>
            </div>
          ) : (
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '32px',
              boxShadow: 'var(--card-shadow)',
              border: '1px solid var(--border-color)'
            }}>
              {renderMarkdown(report)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SurfacePage
