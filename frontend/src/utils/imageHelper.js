const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

export const getImageURL = (path) => {
  if (!path) return "/default-user.png";

  // Full URL? return as-is
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  // Remove leading slashes like /uploads/images...
  const clean = path.replace(/^\/+/, "");

  // If MongoDB stored full relative path: "uploads/images/abc.jpg"
  if (clean.startsWith("uploads/")) {
    return `${API_BASE}/${clean}`;
  }

  // If MongoDB stored only filename: "abc.jpg"
  return `${API_BASE}/uploads/images/${clean}`;
};
