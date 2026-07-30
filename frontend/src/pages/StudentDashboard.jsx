import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import { Layers, CheckSquare, XSquare, TrendingUp } from 'lucide-react'
import { API_URL } from '../config'

const StudentDashboard = () => {
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const [roomCode, setRoomCode] = useState('')
  const [stats, setStats] = useState({
    totalRooms: 9,
    pollsTaken: 118,
    pollsMissed: 9,
    earnedPointsPct: 58
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStudentStats()
  }, [token])

  const fetchStudentStats = async () => {
    try {
      if (!token) return
      const res = await fetch(`${API_URL}/dashboard/student`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        if (data.stats) {
          setStats({
            totalRooms: data.stats.totalRooms ?? 9,
            pollsTaken: data.stats.pollsTaken ?? 118,
            pollsMissed: data.stats.pollsMissed ?? 9,
            earnedPointsPct: data.stats.earnedPointsPct ?? 58,
            weeklyRollup: data.studentStats?.weeklyRollup || []
          })
        }
      }
    } catch (e) {
      console.error('Failed to fetch student stats:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = (e) => {
    e.preventDefault()
    if (!roomCode.trim()) return
    navigate(`/student/session/${roomCode.trim().toUpperCase()}`)
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-primary, #f8fafc)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    }}>
      <Sidebar user={user} />

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        marginLeft: '240px',
        minWidth: 0
      }}>
        {/* Top Header Banner */}
        <header style={{
          background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
          color: 'white',
          padding: '28px 40px',
          boxShadow: '0 4px 12px rgba(37, 99, 235, 0.15)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '26px', fontWeight: '800', letterSpacing: '-0.02em' }}>
                Welcome, {user?.name || 'Dhanshree Gaur'}!
              </h1>
              <p style={{ margin: '6px 0 0', opacity: 0.9, fontSize: '14px', fontWeight: '400' }}>
                Join rooms and participate in polls
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <div style={{ flex: 1, padding: '36px 40px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {/* Stat Cards Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '24px'
          }}>
            {/* Card 1: Total Rooms */}
            <div style={{
              background: 'var(--bg-card, #ffffff)',
              borderRadius: '12px',
              padding: '24px',
              border: '1px solid var(--border-color, #e2e8f0)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary, #0f172a)', lineHeight: '1' }}>
                  {stats.totalRooms}
                </div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary, #64748b)' }}>
                  Total Rooms
                </div>
              </div>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                background: '#f0f9ff',
                color: '#3b82f6', // matches blue in original design approx
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Layers size={20} strokeWidth={2} />
              </div>
            </div>

            {/* Card 2: Polls Taken */}
            <div style={{
              background: 'var(--bg-card, #ffffff)',
              borderRadius: '12px',
              padding: '24px',
              border: '1px solid var(--border-color, #e2e8f0)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary, #0f172a)', lineHeight: '1' }}>
                  {stats.pollsTaken}
                </div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary, #64748b)' }}>
                  Polls Taken
                </div>
              </div>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                background: '#dcfce7',
                color: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <CheckSquare size={20} strokeWidth={2} />
              </div>
            </div>

            {/* Card 3: Polls Missed */}
            <div style={{
              background: 'var(--bg-card, #ffffff)',
              borderRadius: '12px',
              padding: '24px',
              border: '1px solid var(--border-color, #e2e8f0)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary, #0f172a)', lineHeight: '1' }}>
                  {stats.pollsMissed}
                </div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary, #64748b)' }}>
                  Polls Missed
                </div>
              </div>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                background: '#fee2e2',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <XSquare size={20} strokeWidth={2} />
              </div>
            </div>

            {/* Card 4: Earned Points % */}
            <div style={{
              background: 'var(--bg-card, #ffffff)',
              borderRadius: '12px',
              padding: '24px',
              border: '1px solid var(--border-color, #e2e8f0)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary, #0f172a)', lineHeight: '1' }}>
                  {stats.earnedPointsPct}%
                </div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary, #64748b)' }}>
                  Earned Points %
                </div>
              </div>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                background: '#f3e8ff',
                color: '#a855f7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <TrendingUp size={20} strokeWidth={2} />
              </div>
            </div>
          </div>

          {/* Quick Join Card */}
          <div style={{
            background: 'var(--bg-card, #ffffff)',
            borderRadius: '12px',
            padding: '24px',
            border: '1px solid var(--border-color, #e2e8f0)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700', color: 'var(--text-primary, #0f172a)' }}>
              Quick Join
            </h2>
            <form onSubmit={handleJoin} style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Enter room code..."
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  background: 'var(--bg-primary, #ffffff)',
                  color: 'var(--text-primary, #0f172a)',
                  fontSize: '14px',
                  outline: 'none',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  background: '#e2e8f0', // Lighter grey to match image
                  color: '#475569',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: roomCode.trim() ? 'pointer' : 'default',
                  transition: 'all 0.2s ease',
                  opacity: roomCode.trim() ? 1 : 0.7
                }}
              >
                Join Room
              </button>
            </form>
          </div>

          {/* Analytics Section */}
          <div style={{
            background: 'var(--bg-card, #ffffff)',
            borderRadius: '12px',
            padding: '24px',
            border: '1px solid var(--border-color, #e2e8f0)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            flex: 1,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <h2 style={{ margin: '0 0 24px 0', fontSize: '16px', fontWeight: '700', color: 'var(--text-primary, #0f172a)' }}>
              Recent Performance
            </h2>
            
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '16px', minHeight: '200px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
              {(stats.weeklyRollup?.length > 0 ? stats.weeklyRollup : [65, 45, 80, 55, 90, 70, 85]).map((val, idx) => (
                <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{
                    width: '100%',
                    maxWidth: '40px',
                    height: `${val}%`,
                    background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)',
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.3s ease',
                    opacity: 0.85
                  }} />
                  <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary, #64748b)' }}>
                    W{idx + 1}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary, #64748b)' }}>
              <span>Showing performance for the last 7 weeks</span>
              <span style={{ fontWeight: '600', color: '#3b82f6', cursor: 'pointer' }} onClick={() => navigate('/student/room-history')}>Detailed Report →</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default StudentDashboard