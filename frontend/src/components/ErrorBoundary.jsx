// frontend/src/components/ErrorBoundary.jsx
import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("💥 ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            textAlign: "center",
            padding: "2rem",
            color: "#ff5555",
          }}
        >
          <h2>⚠ Something went wrong.</h2>
          <p>{this.state.error?.message || "An unexpected error occurred."}</p>
          <button
            style={{
              marginTop: "1rem",
              padding: "0.6rem 1.2rem",
              borderRadius: "6px",
              border: "none",
              background: "#333",
              color: "#fff",
              cursor: "pointer",
            }}
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
