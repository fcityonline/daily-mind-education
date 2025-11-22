import Notification from "../models/Notification.js";

export const getNotifications = async (req, res) => {
  const notifications = await Notification
    .find({ user: req.user._id })
    .sort({ createdAt: -1 });

  res.json(notifications);
};

export const markAsRead = async (req, res) => {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { isRead: true }
  );
  res.json({ message: "Marked as read" });
};

export const markAllAsRead = async (req, res) => {
  await Notification.updateMany(
    { user: req.user._id, isRead: false },
    { isRead: true }
  );
  res.json({ message: "All notifications marked as read" });
};
