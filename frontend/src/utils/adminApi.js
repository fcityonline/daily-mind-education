// frontend/src/utils/adminApi.js
import axios from "axios";

// Get the API URL from environment variables or default to localhost
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

console.log("🌐 Admin API Base URL:", API_URL);

const AdminAPI = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Add admin token to requests
AdminAPI.interceptors.request.use(
  (config) => {
    const adminToken = localStorage.getItem("adminToken");
    if (adminToken) {
      config.headers.Authorization = `Bearer ${adminToken}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Global Axios interceptor for error handling
AdminAPI.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("🚨 Admin API Error:", error?.response || error);

    const message =
      error?.response?.data?.message ||
      error?.message ||
      "Network error occurred. Please try again.";

    // Handle 401 unauthorized
    if (error.response?.status === 401) {
      localStorage.removeItem("adminToken");
      if (!["/admin-login", "/admin-register"].includes(window.location.pathname)) {
        window.location.href = "/admin-login";
      }
    }

    return Promise.reject(new Error(message));
  }
);

export default AdminAPI;
