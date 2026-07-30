import React, { useState, useEffect } from 'react'
import { API_URL } from '../config.js'

function ImLostModal({ roomId, token, onClose, onVerified }) {
  const [step, setStep] = useState('loading') // 'loading' | 'quiz' | 'concept_select' | 'rejected' | 'success'
  const [quiz, setQuiz] = useState(null)
  const [segmentIndex, setSegmentIndex] = useState(0)
  const [confusionOptions, setConfusionOptions] = useState([])
  const [selectedQuizIdx, setSelectedQuizIdx] = useState(null)
  const [selectedConcept, setSelectedConcept] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchLostRequest()
  }, [roomId])

  const fetchLostRequest = async () => {
    setStep('loading')
    try {
      const res = await fetch(`${API_URL}/lost/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ roomId })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setQuiz(data.verificationQuiz)
        setSegmentIndex(data.segmentIndex)
        setConfusionOptions(data.confusionOptions || [])
        setStep('quiz')
      } else {
        setMessage(data.error || 'Failed to initialize verification check')
        setStep('rejected')
      }
    } catch (err) {
      console.error('Error fetching lost request:', err)
      setMessage('Network error initializing lost check')
      setStep('rejected')
    }
  }

  const handleAnswerQuiz = (optIdx) => {
    setSelectedQuizIdx(optIdx)
  }

  const handleSubmitQuiz = async () => {
    if (selectedQuizIdx === null) return

    setIsSubmitting(true)
    const isCorrect = selectedQuizIdx === quiz.correctAnswerIndex

    if (!isCorrect) {
      // Failed presence verification
      setStep('rejected')
      setMessage('Presence test failed: Incorrect answer to lecture verification check. Request rejected!')
      setIsSubmitting(false)
      return
    }

    // Passed verification -> Move to concept selection
    setStep('concept_select')
    setIsSubmitting(false)
  }

  const handleSelectConceptAndSend = async (conceptText) => {
    setSelectedConcept(conceptText)
    setIsSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/lost/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId,
          segmentIndex,
          selectedOption: selectedQuizIdx,
          correctAnswerIndex: quiz.correctAnswerIndex,
          conceptSelected: conceptText
        })
      })
      const data = await res.json()
      if (res.ok && data.verified) {
        setMessage(data.message || 'Lost request verified! Your teacher has been notified.')
        setStep('success')
        if (onVerified) onVerified(data.stats)
      } else {
        setMessage(data.message || 'Presence check failed.')
        setStep('rejected')
      }
    } catch (err) {
      console.error('Error verifying lost request:', err)
      setMessage('Failed to send verified lost request.')
      setStep('rejected')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          zIndex: 3000,
          backdropFilter: 'blur(4px)'
        }}
      />

      {/* Modal Card */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'var(--bg-card, #ffffff)',
        borderRadius: '20px',
        padding: '28px',
        maxWidth: '520px',
        width: '90%',
        zIndex: 3001,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        border: '1px solid var(--border-color, #e2e8f0)',
        color: 'var(--text-primary, #0f172a)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🚨</span>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>
              I'm Lost — Attention Verification
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '20px',
              color: 'var(--text-secondary, #64748b)',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        {/* Loading Step */}
        {step === 'loading' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid var(--border-color)',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
              Generating live lecture presence check...
            </p>
          </div>
        )}

        {/* Quiz Step: Presence Test */}
        {step === 'quiz' && quiz && (
          <div>
            <div style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '10px',
              padding: '12px 16px',
              marginBottom: '16px',
              fontSize: '13px',
              color: '#1e40af'
            }}>
              <strong>Attention Check Required:</strong> To verify active listening before sending your lost signal, answer this question based on the lecture so far.
            </div>

            <h4 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: '600', lineHeight: '1.4' }}>
              {quiz.question}
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {quiz.options.map((opt, idx) => {
                const isSelected = selectedQuizIdx === idx
                return (
                  <button
                    key={idx}
                    onClick={() => handleAnswerQuiz(idx)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '10px',
                      border: `2px solid ${isSelected ? '#3b82f6' : 'var(--border-color)'}`,
                      background: isSelected ? '#f0f9ff' : 'var(--bg-primary)',
                      color: isSelected ? '#1d4ed8' : 'var(--text-primary)',
                      fontSize: '14px',
                      fontWeight: isSelected ? '600' : '400',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}
                  >
                    <span style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: isSelected ? '#3b82f6' : 'var(--border-color)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: '700'
                    }}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span>{typeof opt === 'string' ? opt : opt.text}</span>
                  </button>
                )
              })}
            </div>

            <button
              onClick={handleSubmitQuiz}
              disabled={selectedQuizIdx === null || isSubmitting}
              style={{
                width: '100%',
                padding: '14px',
                background: selectedQuizIdx === null ? '#9ca3af' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: selectedQuizIdx === null ? 'not-allowed' : 'pointer'
              }}
            >
              Verify Presence & Continue
            </button>
          </div>
        )}

        {/* Concept Select Step (After Passing Quiz) */}
        {step === 'concept_select' && (
          <div>
            <div style={{
              background: '#dcfce7',
              border: '1px solid #86efac',
              borderRadius: '10px',
              padding: '12px 16px',
              marginBottom: '16px',
              fontSize: '13px',
              color: '#166534'
            }}>
              ✓ <strong>Presence Check Passed!</strong> Select the specific concept that caused your confusion:
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {confusionOptions.map((optText, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectConceptAndSend(optText)}
                  disabled={isSubmitting}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    fontWeight: '500',
                    textAlign: 'left',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  📌 {optText}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Rejected Step (Failed Quiz) */}
        {step === 'rejected' && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: '44px', marginBottom: '12px' }}>❌</div>
            <h4 style={{ margin: '0 0 8px', color: '#dc2626', fontSize: '17px', fontWeight: '700' }}>
              Request Rejected
            </h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5', margin: '0 0 24px' }}>
              {message}
            </p>
            <button
              onClick={onClose}
              style={{
                padding: '12px 28px',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        )}

        {/* Success Step */}
        {step === 'success' && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: '44px', marginBottom: '12px' }}>✅</div>
            <h4 style={{ margin: '0 0 8px', color: '#166534', fontSize: '17px', fontWeight: '700' }}>
              Verification Successful
            </h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5', margin: '0 0 24px' }}>
              {message}
            </p>
            <button
              onClick={onClose}
              style={{
                padding: '12px 28px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </>
  )
}

export default ImLostModal
