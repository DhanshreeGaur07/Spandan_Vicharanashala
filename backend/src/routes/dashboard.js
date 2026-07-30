import express from 'express';
import Room from '../models/Room.js';
import Question from '../models/Question.js';
import User from '../models/User.js';
import RoomMember from '../models/RoomMember.js';
import Response from '../models/Response.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

const DEFAULT_ROOM_STATS = {
  totalStudents: 0,
  averageAccuracy: 0,
  averageTTAMs: 0,
  flaggedTabSwitches: 0
};

const DEFAULT_QUESTION_STATS = {
  correctPercentage: 0,
  averageTTAMs: 0,
  tabSwitchesDuringQuestion: 0,
  answerDistribution: {}
};

// Teacher Dashboard: Get stats for a specific past room/session
router.get('/teacher/:roomCode', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

    const room = await Room.findOne({ code: req.params.roomCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    
    // In a full production app, we would only allow the teacher who created it
    if (room.teacher.toString() !== req.user._id.toString()) {
       return res.status(403).json({ error: 'Not your room' });
    }

    const questions = await Question.find({ roomId: room._id });
    
    res.json({
      sessionData: {
        roomCode: room.code,
        endTime: room.endedAt || new Date(), // fallback for demo
        stats: room.stats || {
          ...DEFAULT_ROOM_STATS,
          totalQuestions: questions.length
        }
      },
      questions: questions.map(q => ({
        _id: q._id,
        text: q.question,
        stats: q.stats || DEFAULT_QUESTION_STATS
      })),
      leaderboard: room.leaderboard || []
    });
  } catch (error) {
    console.error('[dashboard]', error);
    res.status(500).json({ error: 'Failed to load teacher dashboard' });
  }
});

// Student Dashboard: Get personal stats
router.get('/student', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Forbidden' });

    const studentId = req.user._id;

    const memberships = await RoomMember.find({ studentId }).lean();
    const roomIds = memberships.map(m => m.roomId);

    const totalRooms = roomIds.length;

    const responses = await Response.find({ studentId }).lean();
    const pollsTaken = responses.length;
    const correctCount = responses.filter(r => r.isCorrect).length;

    const totalQuestionsInJoinedRooms = roomIds.length > 0
      ? await Question.countDocuments({ roomId: { $in: roomIds } })
      : 0;

    const pollsMissed = Math.max(0, totalQuestionsInJoinedRooms - pollsTaken);
    const earnedPointsPct = pollsTaken > 0 ? Math.round((correctCount / pollsTaken) * 100) : 0;

    const user = await User.findById(studentId);

    // Compute weeklyRollup from Response data (last 7 weeks)
    const sevenWeeksAgo = new Date()
    sevenWeeksAgo.setDate(sevenWeeksAgo.getDate() - 49) // 7 weeks

    const weeklyAgg = await Response.aggregate([
      { $match: { studentId: studentId, createdAt: { $gte: sevenWeeksAgo } } },
      { $group: {
        _id: { $isoWeek: '$createdAt' },
        weekStart: { $min: '$createdAt' },
        questionsAnswered: { $sum: 1 },
        correctCount: { $sum: { $cond: ['$isCorrect', 1, 0] } }
      }},
      { $sort: { weekStart: 1 } },
      { $limit: 7 }
    ])

    const weeklyRollup = weeklyAgg.map(w => ({
      weekStartDate: w.weekStart,
      questionsAnswered: w.questionsAnswered,
      accuracyPercentage: w.questionsAnswered > 0
        ? Math.round((w.correctCount / w.questionsAnswered) * 100)
        : 0,
      averageTTAMs: 0
    }))

    res.json({
      success: true,
      stats: {
        totalRooms,
        pollsTaken,
        pollsMissed,
        earnedPointsPct
      },
      studentStats: {
        lifetimeScore: user?.studentStats?.lifetimeScore || 0,
        questionsAnswered: pollsTaken,
        correctCount,
        weeklyRollup
      }
    });
  } catch (error) {
    console.error('[dashboard:student]', error);
    res.status(500).json({ error: 'Failed to load student dashboard' });
  }
});

// Demo endpoint to populate fake aggregates for UI testing without simulating a whole session manually
router.post('/demo-seed/:roomCode', async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).end();
  try {
    const room = await Room.findOne({ code: req.params.roomCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Seed Room Stats
    room.stats = {
      totalStudents: 42,
      totalQuestions: 5,
      averageAccuracy: 78.5,
      averageTTAMs: 8500,
      flaggedTabSwitches: 3
    };
    room.endedAt = new Date();
    room.leaderboard = [
      { studentId: '60d21b4667d0d8992e610c85', name: 'Alice', totalScore: 4800, correctAnswers: 5 },
      { studentId: '60d21b4667d0d8992e610c86', name: 'Bob', totalScore: 4500, correctAnswers: 5 },
      { studentId: '60d21b4667d0d8992e610c87', name: 'Charlie', totalScore: 3200, correctAnswers: 4 }
    ];
    await room.save();

    // Seed Questions
    const questions = await Question.find({ roomId: room._id });
    for (let q of questions) {
      q.stats = {
        correctPercentage: Math.floor(Math.random() * 40) + 60,
        averageTTAMs: Math.floor(Math.random() * 5000) + 5000,
        tabSwitchesDuringQuestion: Math.floor(Math.random() * 2),
        answerDistribution: { "True": 30, "False": 12 }
      };
      await q.save();
    }

    res.json({ message: 'Seed successful' });
  } catch (error) {
    console.error('[dashboard]', error);
    res.status(500).json({ error: 'Failed to seed demo data' });
  }
});

export default router;
