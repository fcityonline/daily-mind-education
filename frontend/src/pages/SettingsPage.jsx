// frontend/src/pages/SettingsPage.jsx
import React, { useState, useContext, useEffect } from "react";
import { AuthContext } from "../context/AuthContext";
import API from "../utils/api";
import DarkModeToggle from "../components/DarkModeToggle";
import BottomNavBar from "../components/BottomNavBar";
import ProfileDrawer from "../components/ProfileDrawer";
import "../styles/global.css";

export default function SettingsPage() {
  const { user, logout } = useContext(AuthContext);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState({
    quizReminders: true,
    paymentAlerts: true,
    winnerAnnouncements: true
  });
  const [language, setLanguage] = useState(localStorage.getItem('lang') || 'en');
  const [statusMessage, setStatusMessage] = useState("");
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(0);

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to logout?")) {
      try {
        await logout();
        window.location.href = "/login";
      } catch (error) {
        console.error("Logout failed:", error);
      }
    }
  };

  const handleNotificationChange = (key) => {
    const updated = { ...notifications, [key]: !notifications[key] };
    setNotifications(updated);
    // persist to server (best-effort)
    try { API.post('/auth/user/preferences', { preferences: { notifications: updated, language } }); } catch (e) { /* ignore */ }
  };

  // persist notification and language preferences locally (or call API to persist server-side)
  React.useEffect(() => {
    try {
      localStorage.setItem('prefs_notifications', JSON.stringify(notifications));
    } catch (e) {}
  }, [notifications]);

  // load preferences from server on mount (best-effort)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await API.get('/auth/user/preferences');
        if (!mounted) return;
        const prefs = resp?.data?.preferences || {};
        if (prefs.notifications) setNotifications(prefs.notifications);
        if (prefs.language) setLanguage(prefs.language);
      } catch (e) {
        // fallback to localStorage (already handled)
        console.warn('Could not load preferences from server', e.message || e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('prefs_notifications');
      if (saved) setNotifications(JSON.parse(saved));
    } catch (e) {}
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem('lang', language);
    } catch (e) {}
    // persist language to server when changed
    try { API.post('/auth/user/preferences', { preferences: { notifications, language } }); } catch (e) { /* ignore */ }
  }, [language, notifications]);

  const handleLanguageChange = (e) => setLanguage(e.target.value);

  const handleDeleteAccount = async () => {
    // open confirmation modal
    setShowConfirmModal(true);
  };

  const confirmDelete = async () => {
    try {
      setDeleting(true);
      setDeleteProgress(5);

      // enqueue deletion job
      const resp = await API.delete('/auth/delete-account');
      const jobId = resp?.data?.jobId;
      if (!jobId) throw new Error('No jobId returned');

      // poll job status
      const pollInterval = 1500;
  const id = setInterval(async () => {
        try {
          const s = await API.get(`/auth/delete-account/status/${jobId}`);
          const job = s?.data?.job;
          if (!job) return;
          setDeleteProgress(job.progress || 0);
          setStatusMessage(job.message || 'Deleting...');

            if (job.status === 'completed') {
            clearInterval(id);
            setDeleteProgress(100);
            // ensure token cleared
            localStorage.removeItem('token');
            setStatusMessage('Account deleted. Redirecting...');
            setTimeout(() => { window.location.href = '/'; }, 800);
          } else if (job.status === 'failed') {
            clearInterval(id);
            setStatusMessage('Failed: ' + (job.error || 'unknown'));
            alert('Delete failed: ' + (job.error || 'unknown'));
            setDeleting(false);
            setShowConfirmModal(false);
          }
        } catch (e) {
          console.warn('polling job status failed', e.message || e);
        }
      }, pollInterval);

    } catch (err) {
      console.error('Delete enqueue failed:', err);
      setStatusMessage(err.message || 'Failed to start deletion');
      alert('Failed to enqueue deletion: ' + (err.message || 'unknown'));
      setDeleting(false);
      setShowConfirmModal(false);
      setDeleteProgress(0);
    }
  };

  return (
    <>
      <header className="header page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div className="logo">
            <img src="/imgs/logo-DME.png" alt="Logo" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 20, margin: 0 }}>SETTINGS</h1>
            {/* <div style={{ fontSize: 13, opacity: 0.9 }}>Manage your account and preferences</div> */}
          </div>
        </div>
        <div style={{ position: 'absolute', right: 16, top: 14 }}>
          <DarkModeToggle />
        </div>
      </header>

      <main className="settings-container home-container">
        <div className="settings-section">
          <h3>🔔 Notifications</h3>
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Quiz Reminders</span>
              <span className="setting-desc">Get notified before daily quiz starts</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={notifications.quizReminders}
                onChange={() => handleNotificationChange('quizReminders')}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Payment Alerts</span>
              <span className="setting-desc">Notifications for payment status</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={notifications.paymentAlerts}
                onChange={() => handleNotificationChange('paymentAlerts')}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Winner Announcements</span>
              <span className="setting-desc">Get notified when quiz results are announced</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={notifications.winnerAnnouncements}
                onChange={() => handleNotificationChange('winnerAnnouncements')}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h3>👤 Account</h3>
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Profile Information</span>
              <span className="setting-desc">Update your profile details</span>
            </div>
            <button 
              className="action-btn"
              onClick={() => window.location.href = "/edit-profile"}
            >
              Edit Profile
            </button>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Change Password</span>
              <span className="setting-desc">Update your account password</span>
            </div>
            {!showChangePassword ? (
              <button 
                className="action-btn"
                onClick={() => setShowChangePassword(true)}
              >
                Change Password
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="password" placeholder="Old password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} />
                <input type="password" placeholder="New password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                <input type="password" placeholder="Confirm new" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                <button className="action-btn" onClick={async () => {
                  // client-side validation
                  if (!oldPassword || !newPassword) return alert('Please provide both old and new passwords');
                  if (newPassword !== confirmPassword) return alert('New passwords do not match');
                  try {
                    setStatusMessage('Changing password...');
                    // server expects currentPassword
                    await API.post('/auth/change-password', { currentPassword: oldPassword, newPassword });
                    setStatusMessage('Password changed successfully');
                    setShowChangePassword(false);
                    setOldPassword(''); setNewPassword(''); setConfirmPassword('');
                    setTimeout(() => setStatusMessage(''), 2000);
                  } catch (err) {
                    console.error('Change password failed', err);
                    setStatusMessage(err.message || 'Failed to change password');
                    alert('Failed: ' + (err.message || 'unknown'));
                  }
                }}>Save</button>
                <button className="action-btn" onClick={() => { setShowChangePassword(false); setOldPassword(''); setNewPassword(''); setConfirmPassword(''); }}>Cancel</button>
              </div>
            )}
          </div>
        </div>

        {/* <aside className="settings-sidebar"> */}
          {/* <div className="profile-card">
            <div className="profile-header">
              <div className="profile-avatar">
                {user?.profileImage ? <img src={`/images/${user.profileImage}`} alt="avatar" /> : <div className="avatar-placeholder">{(user?.fullName || user?.phone || 'U').charAt(0)}</div>}
              </div>
              <div className="profile-info">
                <h2>{user?.fullName || 'Unknown'}</h2>
                <p>{user?.email || user?.phone}</p>
              </div>
            </div>
            <div className="profile-stats" style={{ marginTop: 6 }}>
              <div className="stat-item"><h3>Total Quizzes</h3><p>0</p></div>
              <div className="stat-item"><h3>Best Score</h3><p>0</p></div>
              <div className="stat-item"><h3>Avg Rank</h3><p>—</p></div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="action-button primary" onClick={() => window.location.href = '/profile'}>Edit Profile</button>
              <button className="action-button secondary" onClick={() => window.location.href = '/payment-history'}>Payments</button>
            </div>
          </div> */}
        {/* </aside> */}

        <div className="settings-section">
          <h3>📱 App Preferences</h3>
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Dark Mode</span>
              <span className="setting-desc">Toggle between light and dark themes</span>
            {/* <DarkModeToggle /> */}
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Language</span>
              <span className="setting-desc">Choose your preferred language</span>
            </div>
            <select className="language-select" value={language} onChange={handleLanguageChange}>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
            </select>
          </div>
  </div>

          <div className="settings-section">
          <h3>ℹ️ About</h3>
          <div className="about-info">
            <div className="about-item">
              <span className="about-label">App Version:</span>
              <span className="about-value">1.0.0</span>
            </div>
            <div className="about-item">
              <span className="about-label">Build Date:</span>
              <span className="about-value">October 2025</span>
            </div>
            <div className="about-item">
              <span className="about-label">Developer:</span>
              <span className="about-value">fcityonline Team</span>
            </div>
          </div>
        </div>

        {statusMessage && (
          <div style={{ padding: 12, color: '#d32f2f' }}>{statusMessage}</div>
        )}

        <div className="settings-section danger-zone">
          <h3>⚠️ Danger Zone</h3>
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Logout</span>
              <span className="setting-desc">Sign out from your account</span>
            </div>
            <button 
              className="danger-btn"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Delete Account</span>
              <span className="setting-desc">Permanently delete your account and all data</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="danger-btn2" onClick={handleDeleteAccount}>Delete Account</button>
            </div>
          </div>
        </div>
        </main>

      {showConfirmModal && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            {!deleting ? (
              <>
                <h4>Delete account — Are you sure?</h4>
                <p>This will permanently delete your account, your blogs, quiz history, payments and cannot be undone.</p>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>Please confirm to proceed. This action is irreversible.</div>
                <div className="modal-actions">
                  <button className="btn cancel" onClick={() => setShowConfirmModal(false)}>Cancel</button>
                  <button className="btn confirm" onClick={confirmDelete}>Delete Account</button>
                </div>
              </>
            ) : (
              <div className="delete-progress">
                <div className="spinner-small" aria-hidden></div>
                <div style={{ flex: 1 }}>
                  <div className="progress-text">Deleting your account — please wait...</div>
                  <div style={{ marginTop: 8 }} className="progress-bar-background">
                    <div className="progress-bar-fill" style={{ width: `${deleteProgress}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ProfileDrawer 
        key={user?._id || 'no-user'} 
        open={drawerOpen} 
        onClose={() => setDrawerOpen(false)} 
      />
      <BottomNavBar onProfileClick={() => setDrawerOpen(true)} />
    </>
  );
}
