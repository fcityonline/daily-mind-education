import { useState, useEffect } from "react";
import { socket } from "../socket";  // Assuming you have socket initialized
import { useAuth } from "../contexts/AuthContext";  // Assuming you're using context for user data
import { Link } from "react-router-dom";
import { getUnreadNotifications } from "../api/notifications";  // API to fetch unread notifications

const NotificationBell = () => {
  const { user } = useAuth();  // Access logged-in user
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    // Listen to notifications (Real-time via socket)
    socket.on("notification", (notif) => {
      if (!notif.isRead && notif.user === user._id) {
        setUnreadCount((prev) => prev + 1);  // Increment unread notifications
      }
    });

    // Fetch unread notifications count from backend (for page reloads)
    const fetchUnreadCount = async () => {
      const response = await getUnreadNotifications(user._id);
      setUnreadCount(response.unreadCount);
    };

    fetchUnreadCount();

    return () => {
      socket.off("notification");  // Clean up the socket listener
    };
  }, [user]);

  return (
    <div className="notification-bell">
      <Link to="/notifications">  {/* Assuming you have a notifications page */}
        <span className="bell-icon">
          <i className="fa fa-bell"></i>
          {unreadCount > 0 && (
            <span className="badge">{unreadCount}</span>
          )}
        </span>
      </Link>
    </div>
  );
};

export default NotificationBell;
