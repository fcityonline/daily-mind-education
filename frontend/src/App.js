// // // // frontend/src/App.js
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useState, useContext } from "react";
import { AuthContext } from "./context/AuthContext";

import RegisterPage from "./pages/RegisterPage";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminRegisterPage from "./pages/AdminRegisterPage";
import AdminForgotPasswordPage from "./pages/AdminForgotPasswordPage";
import AdminPanel from "./pages/AdminPanel";
import LandingPage from "./pages/LandingPage";
import HomePage from "./pages/HomePage";
import EditBlogPage from "./pages/EditBlogPage";
import QuizPage from "./pages/QuizPage";
import WinnersPage from "./pages/WinnersPage";
import ProfilePage from "./pages/ProfilePage";
import EditProfilePage from "./pages/EditProfilePage";
import PaymentPage from "./pages/PaymentPage";
import PaymentHistoryPage from "./pages/PaymentHistoryPage";
import QuizAnalyticsPage from "./pages/QuizAnalyticsPage";
import SettingsPage from "./pages/SettingsPage";
import UserBlogsPage from "./pages/UserBlogsPage";

import ProtectedRoute from "./components/ProtectedRoute";
import AdminProtectedRoute from "./components/AdminProtectedRoute";
import BottomNavBar from "./components/BottomNavBar";
import ProfileDrawer from "./components/ProfileDrawer";
import AdminAuthProvider from "./context/AdminAuthContext";

import NotificationListener from "./components/NotificationListener";

// import AppLayout from "./layouts/AppLayout";

function AppContent() {
  const { user } = useContext(AuthContext);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  const handleOpenDrawer = () => setDrawerOpen(true);
  const handleCloseDrawer = () => setDrawerOpen(false);

  // Check if current route is admin route
  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />


        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        
        {/* Admin Routes */}
        <Route path="/admin-login" element={
          <AdminAuthProvider>
            <AdminLoginPage />
          </AdminAuthProvider>
        } />
        <Route path="/admin-register" element={
          <AdminAuthProvider>
            <AdminRegisterPage />
          </AdminAuthProvider>
        } />
        <Route path="/admin-forgot-password" element={
          <AdminAuthProvider>
            <AdminForgotPasswordPage />
          </AdminAuthProvider>
        } />
        <Route path="/admin-dashboard" element={
          <AdminAuthProvider>
            <AdminProtectedRoute>
              <AdminPanel />
            </AdminProtectedRoute>
          </AdminAuthProvider>
        } />

        <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/edit-blog" element={<ProtectedRoute><EditBlogPage /></ProtectedRoute>} />
        <Route path="/quiz" element={<ProtectedRoute><QuizPage /></ProtectedRoute>} />
        <Route path="/winners" element={<ProtectedRoute><WinnersPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/edit-profile" element={<ProtectedRoute><EditProfilePage /></ProtectedRoute>} />
        <Route path="/payment" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />
        <Route path="/payment-history" element={<ProtectedRoute><PaymentHistoryPage /></ProtectedRoute>} />
        <Route path="/quiz-analytics" element={<ProtectedRoute><QuizAnalyticsPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/user/:userId/blogs" element={<ProtectedRoute><UserBlogsPage /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* bottom nav only visible for non-admin routes */}
      {!isAdminRoute && <BottomNavBar onProfileClick={handleOpenDrawer} />}

      {/* Profile drawer shared globally */}
      <ProfileDrawer 
        key={user?._id || 'no-user'} 
        open={drawerOpen} 
        onClose={handleCloseDrawer} 
      />
    </>
  );
}


export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}