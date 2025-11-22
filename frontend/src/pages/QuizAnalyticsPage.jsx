// frontend/src/pages/QuizAnalyticsPage.jsx
import React, { useState, useEffect, useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import API from "../utils/api";
import DarkModeToggle from "../components/DarkModeToggle";
import BottomNavBar from "../components/BottomNavBar";
import ProfileDrawer from "../components/ProfileDrawer";
import "../styles/global.css";

export default function QuizAnalyticsPage() {
  const { user } = useContext(AuthContext);
  const [quizHistory, setQuizHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalQuizzes: 0,
    averageScore: 0,
    bestScore: 0,
    totalCorrect: 0,
    totalQuestions: 0,
    averageRank: 0,
    bestRank: 0
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      window.location.href = "/login";
      return;
    }
    loadQuizHistory();
  }, [user]);

  // const loadQuizHistory = async () => {
  //   try {
  //     const response = await API.get("/quiz/history");
  //     const history = response.data;
  //     setQuizHistory(history);

  //     // Calculate statistics
  //     if (history.length > 0) {
  //       const totalQuizzes = history.length;
  //       const totalScore = history.reduce((sum, quiz) => sum + quiz.score, 0);
  //       const totalCorrect = history.reduce((sum, quiz) => sum + quiz.correctAnswers, 0);
  //       const totalQuestions = history.reduce((sum, quiz) => sum + quiz.totalQuestions, 0);
  //       const totalRank = history.reduce((sum, quiz) => sum + quiz.rank, 0);

  //       setStats({
  //         totalQuizzes,
  //         averageScore: Math.round(totalScore / totalQuizzes),
  //         bestScore: Math.max(...history.map(q => q.score)),
  //         totalCorrect,
  //         totalQuestions,
  //         averageRank: Math.round(totalRank / totalQuizzes),
  //         bestRank: Math.min(...history.map(q => q.rank))
  //       });
  //     }
  //   } catch (error) {
  //     console.error("Failed to load quiz history:", error);
  //   } finally {
  //     setLoading(false);
  //   }
  // };
    const loadQuizHistory = async () => {
    setLoading(true);
    try {
      const response = await API.get("/quiz/history");
      // Backend currently returns { quizHistory: [...] }
      // Defensive extraction:
      const maybeData = response?.data;
      const history = Array.isArray(maybeData)
        ? maybeData
        : Array.isArray(maybeData?.quizHistory)
          ? maybeData.quizHistory
          : [];

      setQuizHistory(history);

      if (history.length > 0) {
        const totalQuizzes = history.length;
        const totalScore = history.reduce((sum, q) => sum + (Number(q.score) || 0), 0);
        const totalCorrect = history.reduce((sum, q) => sum + (Number(q.correctAnswers) || 0), 0);
        const totalQuestions = history.reduce((sum, q) => sum + (Number(q.totalQuestions) || 50), 0);
        const validRanks = history.filter(q => q.rank && Number(q.rank) > 0);
        const totalRank = validRanks.reduce((sum, q) => sum + (Number(q.rank) || 0), 0);

        setStats({
          totalQuizzes,
          averageScore: totalQuizzes > 0 ? Math.round(totalScore / totalQuizzes) : 0,
          bestScore: Math.max(...history.map(q => Number(q.score) || 0), 0),
          totalCorrect,
          totalQuestions,
          averageRank: validRanks.length > 0 ? Math.round(totalRank / validRanks.length) : 0,
          bestRank: validRanks.length > 0 ? Math.min(...validRanks.map(q => Number(q.rank) || Infinity)) : 0
        });
      } else {
        setStats({
          totalQuizzes: 0, averageScore: 0, bestScore: 0,
          totalCorrect: 0, totalQuestions: 0, averageRank: 0, bestRank: 0
        });
      }
    } catch (err) {
      console.error("Failed to load quiz history:", err);
      // Show fallback empty state
      setQuizHistory([]);
      setStats({
        totalQuizzes: 0, averageScore: 0, bestScore: 0,
        totalCorrect: 0, totalQuestions: 0, averageRank: 0, bestRank: 0
      });
    } finally {
      setLoading(false);
    }
  };


  const formatDate = (dateString) => {
    if (!dateString) return 'Date not available';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  const getAccuracy = (correct, total) => {
    return total > 0 ? Math.round((correct / total) * 100) : 0;
  };

  const getRankBadge = (rank) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    if (rank <= 10) return "🏆";
    return "📊";
  };

  if (!user) {
    return null;
  }

  return (
    <>
            <header className="header">
              <div className="logo">
                <img src="/imgs/logo-DME.png" alt="Logo" />
              </div>
              <DarkModeToggle />
              <h2>QUIZ ANALYTICS</h2>
            </header>

      <main className="analytics-wrapper home-container">
        <div className="analytics-container">
        <div className="stats-overview">
          <h2>📊 Quiz Performance</h2>
          
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">🎯</div>
              <div className="stat-info">
                <span className="stat-value">{stats.totalQuizzes}</span>
                <span className="stat-label">Total Quizzes</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">⭐</div>
              <div className="stat-info">
                <span className="stat-value">{stats.averageScore}</span>
                <span className="stat-label">Avg Score</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">🏆</div>
              <div className="stat-info">
                <span className="stat-value">{stats.bestScore}</span>
                <span className="stat-label">Best Score</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">🎯</div>
              <div className="stat-info">
                <span className="stat-value">{getAccuracy(stats.totalCorrect, stats.totalQuestions)}%</span>
                <span className="stat-label">Accuracy</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">📈</div>
              <div className="stat-info">
                <span className="stat-value">{stats.averageRank || 0}</span>
                <span className="stat-label">Avg Rank</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">🥇</div>
              <div className="stat-info">
                <span className="stat-value">{stats.bestRank || 0}</span>
                <span className="stat-label">Best Rank</span>
              </div>
            </div>
          </div>
        </div>

        <div className="quiz-history-section">
          <h3>📚 Quiz History</h3>
          
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>⌛️Loading quiz history...</p>
            </div>
          ) : quizHistory.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📝</div>
              <h3>No quiz history yet</h3>
              <p>You haven't participated in any quizzes yet.</p>
              <button 
                className="quiz-btn"
                onClick={() => window.location.href = "/quiz"}
              >
                Take Your First Quiz
              </button>
            </div>
          ) : (
            <div className="quiz-list">
              {quizHistory.map((quiz, index) => (
                <div key={quiz._id || quiz.quizId || `quiz-${index}`} className="quiz-item">
                  <div className="quiz-header">
                    <div className="quiz-date">
                      <span className="date-icon">📅</span>
                      <span>{formatDate(quiz.date)}</span>
                    </div>
                    <div className="quiz-rank">
                      <span className="rank-badge">{getRankBadge(quiz.rank || 0)}</span>
                      <span className="rank-text">Rank #{quiz.rank || 'N/A'}</span>
                    </div>
                  </div>

                  <div className="quiz-stats">
                    <div className="stat-row">
                      <span className="stat-label">Score:</span>
                      <span className="stat-value">{quiz.score || 0} points</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Correct:</span>
                      <span className="stat-value">{quiz.correctAnswers || 0}/{quiz.totalQuestions || 50}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Accuracy:</span>
                      <span className="stat-value">{getAccuracy(quiz.correctAnswers || 0, quiz.totalQuestions || 50)}%</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Time:</span>
                      <span className="stat-value">{quiz.timeSpent ? Math.round(quiz.timeSpent / 60) : 0} min</span>
                    </div>
                  </div>

                  <div className="quiz-performance">
                    <div className="performance-bar">
                      <div 
                        className="performance-fill"
                        style={{ width: `${getAccuracy(quiz.correctAnswers || 0, quiz.totalQuestions || 50)}%` }}
                      ></div>
                    </div>
                    <span className="performance-text">
                      {getAccuracy(quiz.correctAnswers || 0, quiz.totalQuestions || 50)}% accuracy
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="analytics-actions">
          <button 
            className="action-btn primary"
            onClick={() => window.location.href = "/quiz"}
          >
            Take Today's Quiz
          </button>
          <button 
            className="action-btn secondary"
            onClick={() => window.location.href = "/winners"}
          >
            View Winners
          </button>
        </div>
        </div>
      </main>

      <ProfileDrawer 
        key={user?._id || 'no-user'} 
        open={drawerOpen} 
        onClose={() => setDrawerOpen(false)} 
      />
      <BottomNavBar onProfileClick={() => setDrawerOpen(true)} />
    </>
  );
}
