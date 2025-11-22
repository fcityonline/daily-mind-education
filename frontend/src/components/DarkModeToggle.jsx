// // // frontend/src/components/DarkModeToggle.jsx
import React, { useEffect, useState } from "react";

export default function DarkModeToggle() {
  const [dark, setDark] = useState(false);

  // On mount: apply saved theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      document.body.classList.add("dark");
      setDark(true);
    } else {
      document.body.classList.remove("dark");
      setDark(false);
    }
  }, []);

  // When toggled: update both DOM + localStorage
  const toggleDarkMode = () => {
    const newDark = !dark;
    setDark(newDark);
    document.body.classList.toggle("dark", newDark);
    localStorage.setItem("theme", newDark ? "dark" : "light");
  };

  return (
    <button
      className="dark-toggle"
      onClick={toggleDarkMode}
      title="Toggle dark mode"
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
