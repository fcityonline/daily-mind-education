// frontend/src/pages/AdminPanel.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import AdminAPI from '../utils/adminApi';
import './AdminPanel.css';

// Import Chart.js
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut, Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const AdminPanel = () => {
  const navigate = useNavigate();
  const { admin, adminLogout } = useAdminAuth();
  const [currentView, setCurrentView] = useState('dashboard');
  const [sidebarActive, setSidebarActive] = useState(false);
  
  // Dashboard data
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalQuizzes: 0,
    totalRevenue: 0,
    todayUsers: 0
  });
  
  // User management
  const [users, setUsers] = useState([]);
  
  // Quiz management
  const [quizzes, setQuizzes] = useState([]);
  
  // Payment history
  const [payments, setPayments] = useState([]);
  
  // Modal states
  const [showUserModal, setShowUserModal] = useState(false);
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editingQuiz, setEditingQuiz] = useState(null);

  const checkAdminAccess = useCallback(() => {
    // Check if admin is logged in
    if (!admin) {
      navigate('/admin-login');
    }
  }, [admin, navigate]);

  useEffect(() => {
    checkAdminAccess();
    loadDashboardData();
  }, [checkAdminAccess]);

  const loadDashboardData = async () => {
    try {
      // Load dashboard stats
      const statsRes = await AdminAPI.get('/admin/dashboard');
      setStats(statsRes.data);
      
      // Load users
      const usersRes = await AdminAPI.get('/admin/users');
      setUsers(usersRes.data.users || []);
      
      // Load quizzes
      const quizzesRes = await AdminAPI.get('/admin/quizzes');
      setQuizzes(quizzesRes.data.quizzes || []);
      
      // Load payments
      const paymentsRes = await AdminAPI.get('/admin/payments');
      setPayments(paymentsRes.data.payments || []);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  };

  const handleLogout = async () => {
    await adminLogout();
    navigate('/admin-login');
  };

  const handleViewChange = (view) => {
    setCurrentView(view);
    setSidebarActive(false);
  };

  const toggleSidebar = () => {
    setSidebarActive(!sidebarActive);
  };

  // User management functions
  const openUserForm = (user = null) => {
    setEditingUser(user);
    setShowUserModal(true);
  };

  const closeUserForm = () => {
    setEditingUser(null);
    setShowUserModal(false);
  };

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    // Implement user create/update logic
    closeUserForm();
    loadDashboardData();
  };

  const deleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await AdminAPI.delete(`/admin/users/${userId}`);
        loadDashboardData();
      } catch (error) {
        console.error('Failed to delete user:', error);
      }
    }
  };

  const toggleUserStatus = async (userId, isBanned) => {
    try {
      if (isBanned) {
        await AdminAPI.put(`/admin/users/${userId}/unban`);
      } else {
        await AdminAPI.put(`/admin/users/${userId}/ban`);
      }
      loadDashboardData();
    } catch (error) {
      console.error('Failed to toggle user status:', error);
    }
  };

  // Quiz management functions
  const openQuizForm = (quiz = null) => {
    setEditingQuiz(quiz);
    setShowQuizModal(true);
  };

  const closeQuizForm = () => {
    setEditingQuiz(null);
    setShowQuizModal(false);
  };

  const handleQuizSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const quizData = {
      title: formData.get('title'),
      description: formData.get('description'),
      totalQuestions: parseInt(formData.get('totalQuestions')),
      scheduledAt: formData.get('scheduledAt'),
      scheduleType: formData.get('scheduleType') || 'one-off'
    };

    try {
      if (editingQuiz) {
        await AdminAPI.put(`/admin/quizzes/${editingQuiz._id}`, quizData);
      } else {
        // Create sample questions for testing
        const sampleQuestions = Array.from({ length: quizData.totalQuestions }, (_, i) => ({
          text: `Sample Question ${i + 1}?`,
          options: ['Option A', 'Option B', 'Option C', 'Option D'],
          correctIndex: Math.floor(Math.random() * 4),
          points: 1
        }));
        
        await AdminAPI.post('/admin/quizzes', {
          ...quizData,
          questions: sampleQuestions
        });
      }
      closeQuizForm();
      loadDashboardData();
    } catch (error) {
      console.error('Failed to save quiz:', error);
    }
  };

  const deleteQuiz = async (quizId) => {
    if (window.confirm('Are you sure you want to delete this quiz?')) {
      try {
        await AdminAPI.delete(`/admin/quizzes/${quizId}`);
        loadDashboardData();
      } catch (error) {
        console.error('Failed to delete quiz:', error);
      }
    }
  };

  // Publish/unpublish quiz
  const togglePublishQuiz = async (quiz) => {
    // Guard against changing published state when quiz is live
    if (quiz.isLive) {
      alert('Cannot change publish status while quiz is live!');
      return;
    }

    const action = quiz.published ? 'unpublish' : 'publish';
    const confirmed = window.confirm(
      `Are you sure you want to ${action} this quiz?\n\n` +
      `Title: ${quiz.title}\n` +
      `Questions: ${quiz.totalQuestions}\n` +
      `Scheduled: ${new Date(quiz.scheduledAt).toLocaleString()}\n\n` +
      `This action will ${quiz.published ? 'hide' : 'make visible'} the quiz to users.`
    );

    if (!confirmed) return;

    try {
      await AdminAPI.patch(`/admin/quizzes/${quiz._id}/schedule`, { published: !quiz.published });
      loadDashboardData();
      alert(`Quiz ${action}ed successfully!`);
    } catch (error) {
      console.error('Failed to toggle publish:', error);
      alert('Failed to toggle publish status');
    }
  };

  // Start quiz now (manual)
  const startQuizNow = async (quizId) => {
    try {
      await AdminAPI.post(`/admin/quizzes/${quizId}/start`);
      loadDashboardData();
      alert('✅ Quiz started successfully!');
    } catch (error) {
      console.error('Failed to start quiz:', error);
      const errorMsg = error?.response?.data?.message || error?.message || 'Failed to start quiz';
      if (errorMsg.includes('already live')) {
        alert('ℹ️ Quiz is already live. No action needed.');
      } else {
        alert(`❌ ${errorMsg}`);
      }
    }
  };

  // CSV upload
  const [uploading, setUploading] = useState(false);
  const uploadCSV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('csv', file);
    setUploading(true);
    try {
      await AdminAPI.post('/admin/quizzes/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      alert('Quiz CSV uploaded successfully');
      loadDashboardData();
    } catch (err) {
      console.error('CSV upload failed:', err);
      alert(err.response?.data?.message || 'CSV upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const downloadCSVTemplate = () => {
    const csvContent = `question,optionA,optionB,optionC,optionD,correctAnswer,points
What is the capital of India?,Delhi,Mumbai,Kolkata,Chennai,1,1
Which planet is known as the Red Planet?,Venus,Mars,Jupiter,Saturn,2,1
What is 2 + 2?,3,4,5,6,2,1
Who wrote Romeo and Juliet?,Charles Dickens,William Shakespeare,Mark Twain,Jane Austen,2,1
What is the largest mammal?,Elephant,Blue whale,Giraffe,Hippopotamus,2,1
What is the chemical symbol for gold?,Go,Au,Ag,Gd,2,1
Which country has the most population?,China,India,USA,Indonesia,1,1
What is the smallest prime number?,1,2,3,4,2,1
Who painted the Mona Lisa?,Vincent van Gogh,Leonardo da Vinci,Pablo Picasso,Michelangelo,2,1
What is the speed of light?,300,000 km/s,300,000 m/s,30,000 km/s,3,000 km/s,1,1
What is the largest ocean?,Atlantic,Pacific,Indian,Arctic,2,1
Which element has the symbol 'O'?,Oxygen,Gold,Silver,Copper,1,1
What is the currency of Japan?,Yen,Dollar,Euro,Pound,1,1
Who discovered gravity?,Isaac Newton,Albert Einstein,Galileo,Charles Darwin,1,1
What is the hardest natural substance?,Diamond,Gold,Silver,Platinum,1,1
Which planet is closest to the Sun?,Venus,Mercury,Earth,Mars,2,1
What is the largest continent?,Asia,Africa,North America,Europe,1,1
Who wrote 'To Kill a Mockingbird'?,Harper Lee,Mark Twain,Ernest Hemingway,F. Scott Fitzgerald,1,1
What is the chemical symbol for water?,H2O,CO2,O2,H2SO4,1,1
Which country is known as the Land of the Rising Sun?,China,Japan,South Korea,Thailand,2,1
What is the largest planet in our solar system?,Saturn,Jupiter,Neptune,Uranus,2,1
Who composed 'The Four Seasons'?,Johann Sebastian Bach,Antonio Vivaldi,Wolfgang Amadeus Mozart,Ludwig van Beethoven,2,1
What is the smallest country in the world?,Monaco,Vatican City,San Marino,Liechtenstein,2,1
Which gas makes up most of Earth's atmosphere?,Oxygen,Nitrogen,Carbon dioxide,Argon,2,1
What is the longest river in the world?,Amazon,Nile,Mississippi,Yangtze,2,1
Who wrote '1984'?,George Orwell,Aldous Huxley,Ray Bradbury,Philip K. Dick,1,1
What is the chemical symbol for iron?,Fe,Ir,In,I,1,1
Which planet is known for its rings?,Jupiter,Saturn,Uranus,Neptune,2,1
What is the largest desert in the world?,Sahara,Antarctic,Arctic,Gobi,2,1
Who painted 'The Starry Night'?,Vincent van Gogh,Claude Monet,Pablo Picasso,Salvador Dali,1,1
What is the chemical symbol for silver?,Si,Ag,Au,Al,2,1
Which country has the most time zones?,Russia,USA,China,Canada,1,1
What is the largest bird in the world?,Ostrich,Emu,Albatross,Condor,1,1
Who wrote 'Pride and Prejudice'?,Charlotte Bronte,Jane Austen,Emily Bronte,Virginia Woolf,2,1
What is the chemical symbol for carbon?,Ca,C,Co,Cu,2,1
Which planet is known as the Evening Star?,Venus,Mercury,Mars,Jupiter,1,1
What is the largest lake in the world?,Caspian Sea,Lake Superior,Lake Victoria,Lake Baikal,1,1
Who composed 'The Nutcracker'?,Pyotr Ilyich Tchaikovsky,Ludwig van Beethoven,Johann Sebastian Bach,Wolfgang Amadeus Mozart,1,1
What is the chemical symbol for nitrogen?,Ni,N,Na,Ne,2,1
Which country is known as the Emerald Isle?,Ireland,Scotland,Wales,England,1,1
What is the largest island in the world?,Greenland,Madagascar,Borneo,New Guinea,1,1
Who wrote 'The Great Gatsby'?,F. Scott Fitzgerald,Ernest Hemingway,Mark Twain,John Steinbeck,1,1
What is the chemical symbol for hydrogen?,H,He,Hi,Hy,1,1
Which planet is known as the Red Planet?,Venus,Mars,Jupiter,Saturn,2,1
What is the largest mountain in the world?,Mount Everest,K2,Kilimanjaro,Denali,1,1
Who painted 'The Last Supper'?,Leonardo da Vinci,Michelangelo,Raphael,Donatello,1,1
What is the chemical symbol for helium?,He,H,Hi,Hy,1,1
Which country is known as the Land of Fire and Ice?,Iceland,Greenland,Norway,Finland,1,1
What is the largest canyon in the world?,Grand Canyon,Colca Canyon,Copper Canyon,Kali Gandaki Gorge,1,1
Who wrote 'The Catcher in the Rye'?,J.D. Salinger,Ernest Hemingway,Mark Twain,John Steinbeck,1,1
What is the chemical symbol for calcium?,Ca,C,Co,Cu,1,1
Which planet is known as the Morning Star?,Venus,Mercury,Mars,Jupiter,1,1`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quiz_template_50_questions.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Chart data
  const studentChartData = {
    labels: ['Joined', 'Waiting'],
    datasets: [{
      data: [stats.totalUsers || 50, 50],
      backgroundColor: ['#660000', '#bd882f'],
      hoverOffset: 10
    }]
  };

  const liveChartData = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    datasets: [
      {
        label: 'Present',
        data: [3, 4, 2, 3, 5],
        borderColor: '#FF0000',
        fill: false,
        tension: 0.1
      },
      {
        label: 'Waiting',
        data: [2, 1, 3, 4, 2],
        borderColor: '#FFDB58',
        fill: false,
        tension: 0.1
      }
    ]
  };

  const paymentChartData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
    datasets: [{
      label: 'Revenue (₹)',
      data: [12000, 18000, 15000, 22000, 17000, 25000, 30000],
      backgroundColor: '#007bff'
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: 'bottom'
      }
    }
  };

  const doughnutOptions = {
    ...chartOptions,
    cutout: '70%'
  };

  return (
    <div className="admin-container">
      {/* Mobile Menu Toggle */}
      <button className="menu-toggle" onClick={toggleSidebar}>
        ☰
      </button>

      {/* Sidebar Overlay for Mobile */}
      {sidebarActive && (
        <div 
          className="sidebar-overlay active" 
          onClick={() => setSidebarActive(false)}
        />
      )}

      {/* Sidebar */}
      <nav className={`sidebar ${sidebarActive ? 'active' : ''}`} id="sidebar">
        <div className="logo">
          <img src="/imgs/logoo-DME.png" alt="Logo" onError={(e) => {
            e.target.style.display = 'none';
            e.target.nextSibling.textContent = 'DME Admin';
          }} />
          <span style={{ display: 'none' }}>DME Admin</span>
        </div>
        <ul id="menuList">
          <li className={currentView === 'dashboard' ? 'active' : ''} onClick={() => handleViewChange('dashboard')}>
            <button type="button" className="nav-link">Dashboard</button>
          </li>
          <li className={currentView === 'userManagement' ? 'active' : ''} onClick={() => handleViewChange('userManagement')}>
            <button type="button" className="nav-link">User Management</button>
          </li>
          <li className={currentView === 'quizManagement' ? 'active' : ''} onClick={() => handleViewChange('quizManagement')}>
            <button type="button" className="nav-link">Quiz Management</button>
          </li>
          <li className={currentView === 'paymentHistory' ? 'active' : ''} onClick={() => handleViewChange('paymentHistory')}>
            <button type="button" className="nav-link">Payment History</button>
          </li>
          <li className={currentView === 'settings' ? 'active' : ''} onClick={() => handleViewChange('settings')}>
            <button type="button" className="nav-link">Settings</button>
          </li>
          <li onClick={handleLogout}>
            <button type="button" className="nav-link logout">Logout</button>
          </li>
        </ul>
      </nav>

      {/* Main Content */}
      <div className="admin-main-content">
        {/* Dashboard View */}
        {currentView === 'dashboard' && (
          <div className="view-section">
            <h1>Daily Mind Education Admin Panel</h1>
            <h2>Welcome, {admin?.fullName || admin?.username}</h2>
            <div className="cards-grid">
              {/* Students Chart */}
              <div className="card">
                <h2>Students Joined</h2>
                <div className="chart-container">
                  <Doughnut data={studentChartData} options={doughnutOptions} />
                </div>
              </div>

              {/* Live Status Chart */}
              <div className="card">
                <h2>Live Status</h2>
                <div className="chart-container">
                  <Line data={liveChartData} options={chartOptions} />
                </div>
              </div>

              {/* Payment Analysis Card */}
              <div className="card payment-card">
                <h2>Payment Analysis</h2>
                <div className="chart-container">
                  <Bar data={paymentChartData} options={chartOptions} />
                </div>
                <div className="payment-summary">
                  <div><strong>Total Sales:</strong> ₹{stats.totalRevenue || '0'}</div>
                  <div><strong>Transactions:</strong> {payments.length || 0}</div>
                  <div><strong>Pending:</strong> ₹10,000</div>
                </div>
                <div className="recent-payments">
                  <h3>Recent Payments</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Name</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.slice(0, 3).map((payment) => (
                        <tr key={payment._id}>
                          <td>{new Date(payment.createdAt).toLocaleDateString()}</td>
                          <td>{payment.user?.fullName || 'Unknown'}</td>
                          <td>₹{payment.amount}</td>
                          <td>{payment.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* User Management View */}
        {currentView === 'userManagement' && (
          <div className="view-section">
            <h1>User Management</h1>
            <button className="add-btn" onClick={() => openUserForm()}>New User</button>
            <button className="add-btn2">Pending Approvals</button>
            <button className="add-btn3">Reports</button>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>🆔ID</th>
                        <th>🦕Name</th>
                        <th>💌Email</th>
                        <th>☎Phone</th>
                        <th>🔰Role</th>
                        <th>📊Status</th>
                        <th>
  <span className="live-badge">
    <span className="live-dot"></span>
  Actions
  </span>
</th>

                        {/* <th>🚨Actions</th> */}
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user._id}>
                          <td>{user._id.slice(-6)}</td>
                          <td>{user.fullName || user.username}</td>
                          <td>{user.email || 'N/A'}</td>
                          <td>{user.phone}</td>
                          <td>{user.role || 'user'}</td>
                          <td>{user.isBanned ? 'Banned' : 'Active'}</td>
                          <td>
                            <button className="action-btn edit" onClick={() => toggleUserStatus(user._id, user.isBanned)}>
                              {user.isBanned ? 'Unban' : 'Ban'}
                            </button>
                            <button className="action-btn delete" onClick={() => deleteUser(user._id)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
          </div>
        )}

        {/* Quiz Management View */}
        {currentView === 'quizManagement' && (
          <div className="view-section">
            <h1>Quiz Management</h1>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
              <button className="add-btn" onClick={() => openQuizForm()}>Add New Quiz</button>
              <label className="add-btn" style={{ background: '#6c757d', cursor: 'pointer' }}>
                {uploading ? '⌛️Uploading...' : 'Upload CSV (50 Qs)'}
                <input type="file" accept=".csv" onChange={uploadCSV} style={{ display: 'none' }} />
              </label>
              <button className="add-btn" onClick={downloadCSVTemplate} style={{ background: '#28a745' }}>
                
                📥 Download Template
              </button>
            </div>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Title</th>
                        <th>Description</th>
                        <th>Questions</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quizzes.map((quiz) => (
                        <tr key={quiz._id}>
                          <td>{quiz._id.slice(-6)}</td>
                          <td>{quiz.title}</td>
                          <td>{quiz.description || 'N/A'}</td>
                          <td>{quiz.totalQuestions || quiz.questions?.length || 0}</td>
                          <td>{new Date(quiz.date).toLocaleDateString()}</td>
                          <td>{quiz.isLive ? 'Live' : quiz.isCompleted ? 'Completed' : (quiz.published ? 'Scheduled' : 'Draft')}</td>
                          <td>
                            <button className="action-btn edit" onClick={() => openQuizForm(quiz)}>Edit</button>
                            <button 
                              className="action-btn" 
                              onClick={() => togglePublishQuiz(quiz)}
                              disabled={quiz.isLive}
                              style={{ 
                                opacity: quiz.isLive ? 0.5 : 1,
                                cursor: quiz.isLive ? 'not-allowed' : 'pointer'
                              }}
                            >
                              {quiz.published ? 'Unpublish' : 'Publish'}
                              {quiz.isLive && ' (Live)'}
                            </button>
                            <button 
                              className="action-btn" 
                              onClick={() => startQuizNow(quiz._id)}
                              disabled={quiz.isLive}
                              style={{ 
                                opacity: quiz.isLive ? 0.5 : 1,
                                cursor: quiz.isLive ? 'not-allowed' : 'pointer'
                              }}
                            >
                              {quiz.isLive ? 'Live' : 'Start Now'}
                            </button>
                            <button className="action-btn delete" onClick={() => deleteQuiz(quiz._id)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
          </div>
        )}

        {/* Payment History View */}
        {currentView === 'paymentHistory' && (
          <div className="view-section">
            <h1>Payment History</h1>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>User</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Transaction ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => (
                        <tr key={payment._id}>
                          <td>{new Date(payment.createdAt).toLocaleString()}</td>
                          <td>{payment.user?.fullName || 'Unknown'}</td>
                          <td>₹{payment.amount}</td>
                          <td>{payment.status}</td>
                          <td>{payment.transactionId || payment.razorpayPaymentId || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
          </div>
        )}

        {/* Settings View */}
        {currentView === 'settings' && (
          <div className="view-section">
            <h1>Settings</h1>
            <p>Settings feature coming soon...</p>
          </div>
        )}
      </div>

      {/* User Modal */}
      {showUserModal && (
        <div className="modal active">
          <div className="modal-content">
            <h3>{editingUser ? 'Edit User' : 'Add New User'}</h3>
            <form onSubmit={handleUserSubmit}>
              <label>Name:</label>
              <input type="text" required />
              <label>Email:</label>
              <input type="email" required />
              <label>Phone:</label>
              <input type="text" required />
              <label>Role:</label>
              <select required>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
              <div className="modal-footer">
                <button type="button" className="btn-cancel" onClick={closeUserForm}>Cancel</button>
                <button type="submit" className="btn-save">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quiz Modal */}
      {showQuizModal && (
        <div className="modal active">
          <div className="modal-content">
            <h3>{editingQuiz ? 'Edit Quiz' : 'Add New Quiz'}</h3>
            <form onSubmit={handleQuizSubmit}>
              <label>Title:</label>
              <input 
                type="text" 
                name="title" 
                defaultValue={editingQuiz?.title || ''}
                required 
              />
              <label>Description:</label>
              <textarea 
                rows="3" 
                name="description"
                defaultValue={editingQuiz?.description || ''}
                required
              ></textarea>
              <label>Number of Questions:</label>
              <input 
                type="number" 
                name="totalQuestions"
                min="1" 
                defaultValue={editingQuiz?.totalQuestions || 10}
                required 
              />
              <label>Schedule Date:</label>
              <input 
                type="datetime-local" 
                name="scheduledAt"
                defaultValue={editingQuiz?.scheduledAt ? new Date(editingQuiz.scheduledAt).toISOString().slice(0, 16) : ''}
              />
              <label>Schedule Type:</label>
              <select name="scheduleType" defaultValue={editingQuiz?.scheduleType || 'one-off'}>
                <option value="one-off">One-time</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
              <div className="modal-footer">
                <button type="button" className="btn-cancel" onClick={closeQuizForm}>Cancel</button>
                <button type="submit" className="btn-save">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
