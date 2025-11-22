// // backend/controllers/userController.js

// backend/controllers/userController.js

import User from '../models/User.js'; // assuming you have a User model

export const getTodayJoinedCount = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const count = await User.countDocuments({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    res.json({ count });
  } catch (error) {
    console.error('Error fetching today joined count:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
