// // frontend/src/components/ProtectedRoute.jsx

// frontend/src/components/ProtectedRoute.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";

/**
 * Wrap a route element in <ProtectedRoute>{<Page/>}</ProtectedRoute>
 * It will show children only when authenticated. While loading, it shows null (or a spinner).
 */
export default function ProtectedRoute({ children }) {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    // you can return a spinner here
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
