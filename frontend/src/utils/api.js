// frontend/src/utils/api.js
import axios from "axios";

// Get the API URL from environment variables or default to localhost
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

// Log the API URL for debugging
console.log("🌐 API Base URL:", API_URL);

const API = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Add token to requests
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Global Axios interceptor for error handling
API.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("🚨 API Error:", error?.response || error);

    const message =
      error?.response?.data?.message ||
      error?.message ||
      "Network error occurred. Please try again.";

    // Handle 401 unauthorized
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      if (!["/login", "/register"].includes(window.location.pathname)) {
        window.location.href = "/login";
      }
    }

    return Promise.reject(new Error(message));
  }
);

export default API;


// import axios from "axios";

// // Detect if we're on mobile or desktop and set appropriate base URL
// const getBaseURL = () => {
//   // Check if we're accessing from mobile (non-localhost)
//   const hostname = window.location.hostname;
  
//   if (hostname === 'localhost' || hostname === '127.0.0.1') {
//     // Desktop access
//     return "http://localhost:5000/api";
//   } else {
//     // Mobile access - use the same hostname but port 5000
//     return `http://${hostname}:5000/api`;
//   }
// };

// const baseURL = getBaseURL();
// console.log(`🌐 Current hostname: ${window.location.hostname}`);
// console.log(`🌐 API Base URL: ${baseURL}`);
// console.log(`📱 Full URL: ${window.location.href}`);

// const API = axios.create({
//   baseURL: baseURL,
//   withCredentials: true,
//   timeout: 10000, // 10 second timeout
// });

// // (in utils/api.js) add after API creation
// API.interceptors.response.use(
//   res => {
//     // Normalize some responses so frontend code can expect array for quiz history
//     // If backend returns { quizHistory: [...] }, unwrap it automatically
//     if (res?.data && typeof res.data === "object" && Array.isArray(res.data.quizHistory)) {
//       return { ...res, data: res.data.quizHistory };
//     }
//     return res;
//   },
//   err => {
//     // existing 401 handling etc.
//     return Promise.reject(err);
//   }
// );


// // Request interceptor to add token to headers
// API.interceptors.request.use(
//   (config) => {
//     const token = localStorage.getItem("token");
//     if (token) {
//       config.headers.Authorization = `Bearer ${token}`;
//     }
//     return config;
//   },
//   (error) => {
//     return Promise.reject(error);
//   }
// );

// // Response interceptor to handle 401 errors
// API.interceptors.response.use(
//   (res) => res,
//   (err) => {
//     const status = err?.response?.status;
//     const config = err?.config;
    
//     console.error(`🚨 API Error:`, {
//       url: config?.url,
//       baseURL: config?.baseURL,
//       fullURL: `${config?.baseURL}${config?.url}`,
//       status: status,
//       message: err?.message,
//       code: err?.code,
//       hostname: window.location.hostname
//     });
    
//     if (status === 401) {
//       // Clear token and redirect to login
//       localStorage.removeItem("token");
//       if (!["/login", "/register"].includes(window.location.pathname)) {
//         window.location.href = "/login";
//       }
//     }
//     return Promise.reject(err);
//   }
// );

// export default API;

