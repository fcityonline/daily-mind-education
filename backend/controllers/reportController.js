// backend/controllers/reportController.js
import Report from "../models/Report.js";
import Block from "../models/Block.js";
import Blog from "../models/Blog.js";
import User from "../models/User.js";
import AdminAudit from "../models/AdminAudit.js";

// Report a user/blog
export const reportUser = async (req, res) => {
  try {
    const { blogId, reason, description } = req.body;
    const reporterId = req.user.id;

    if (!blogId || !reason) {
      return res.status(400).json({ message: "Blog ID and reason are required" });
    }

    // Get the blog to find the author
    const blog = await Blog.findById(blogId).populate("author", "_id");
    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    const reportedUserId = blog.author._id.toString();

    // Prevent self-reporting
    if (reporterId === reportedUserId) {
      return res.status(400).json({ message: "You cannot report yourself" });
    }

    // Check if user already reported this blog
    const existingReport = await Report.findOne({
      reportedBy: reporterId,
      blog: blogId
    });

    if (existingReport) {
      return res.status(400).json({ message: "You have already reported this blog" });
    }

    // Create report
    const report = new Report({
      reportedBy: reporterId,
      reportedUser: reportedUserId,
      blog: blogId,
      reason,
      description: description || ""
    });

    await report.save();
    await report.populate("reportedBy", "fullName username");
    await report.populate("reportedUser", "fullName username");
    await report.populate("blog", "title");

    console.log(`[Report] User ${reporterId} reported blog ${blogId} by user ${reportedUserId}`);

    res.status(201).json({
      message: "Report submitted successfully. Admin will review it.",
      report: {
        id: report._id,
        reason: report.reason,
        status: report.status
      }
    });
  } catch (error) {
    console.error("Error reporting user:", error);
    res.status(500).json({ message: "Failed to submit report" });
  }
};

// Block a user
export const blockUser = async (req, res) => {
  try {
    const { userId, reason } = req.body;
    const blockerId = req.user.id;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Prevent self-blocking
    if (blockerId === userId) {
      return res.status(400).json({ message: "You cannot block yourself" });
    }

    // Check if user exists
    const userToBlock = await User.findById(userId);
    if (!userToBlock) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if already blocked
    const existingBlock = await Block.findOne({
      blockedBy: blockerId,
      blockedUser: userId
    });

    if (existingBlock) {
      return res.status(400).json({ message: "User is already blocked" });
    }

    // Create block
    const block = new Block({
      blockedBy: blockerId,
      blockedUser: userId,
      reason: reason || ""
    });

    await block.save();

    console.log(`[Block] User ${blockerId} blocked user ${userId}`);

    res.status(201).json({
      message: "User blocked successfully",
      block: {
        id: block._id,
        blockedUser: userId
      }
    });
  } catch (error) {
    console.error("Error blocking user:", error);
    if (error.code === 11000) {
      return res.status(400).json({ message: "User is already blocked" });
    }
    res.status(500).json({ message: "Failed to block user" });
  }
};

// Unblock a user
export const unblockUser = async (req, res) => {
  try {
    const { userId } = req.body;
    const blockerId = req.user.id;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const block = await Block.findOneAndDelete({
      blockedBy: blockerId,
      blockedUser: userId
    });

    if (!block) {
      return res.status(404).json({ message: "User is not blocked" });
    }

    console.log(`[Unblock] User ${blockerId} unblocked user ${userId}`);

    res.json({ message: "User unblocked successfully" });
  } catch (error) {
    console.error("Error unblocking user:", error);
    res.status(500).json({ message: "Failed to unblock user" });
  }
};

// Get blocked users for current user
export const getBlockedUsers = async (req, res) => {
  try {
    const userId = req.user.id;

    const blocks = await Block.find({ blockedBy: userId })
      .populate("blockedUser", "fullName username profileImage")
      .sort({ createdAt: -1 });

    res.json({
      blockedUsers: blocks.map(block => ({
        id: block.blockedUser._id,
        fullName: block.blockedUser.fullName,
        username: block.blockedUser.username,
        profileImage: block.blockedUser.profileImage,
        blockedAt: block.createdAt
      }))
    });
  } catch (error) {
    console.error("Error fetching blocked users:", error);
    res.status(500).json({ message: "Failed to fetch blocked users" });
  }
};

// Check if user is blocked
export const checkIfBlocked = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const block = await Block.findOne({
      $or: [
        { blockedBy: currentUserId, blockedUser: userId },
        { blockedBy: userId, blockedUser: currentUserId }
      ]
    });

    res.json({
      isBlocked: !!block,
      blockedByMe: block?.blockedBy.toString() === currentUserId,
      blockedByThem: block?.blockedUser.toString() === currentUserId
    });
  } catch (error) {
    console.error("Error checking block status:", error);
    res.status(500).json({ message: "Failed to check block status" });
  }
};

// Admin: Get all reports
export const getAllReports = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const { status, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (status) {
      query.status = status;
    }

    const reports = await Report.find(query)
      .populate("reportedBy", "fullName username phone")
      .populate("reportedUser", "fullName username phone")
      .populate("blog", "title content")
      .populate("reviewedBy", "fullName username")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Report.countDocuments(query);

    // Log admin action
    await AdminAudit.create({
      admin: req.user.id,
      action: 'view_reports',
      method: req.method,
      path: req.path,
      query: req.query
    });

    res.json({
      reports,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalReports: total,
        hasNext: skip + reports.length < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({ message: "Failed to fetch reports" });
  }
};

// Admin: Update report status
export const updateReportStatus = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const { reportId } = req.params;
    const { status, adminNotes } = req.body;

    if (!status || !['pending', 'reviewed', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ message: "Valid status is required" });
    }

    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    report.status = status;
    report.reviewedBy = req.user.id;
    report.reviewedAt = new Date();
    if (adminNotes) {
      report.adminNotes = adminNotes;
    }

    await report.save();

    // If resolved and reason is serious, consider banning user
    if (status === 'resolved' && ['harassment', 'inappropriate'].includes(report.reason)) {
      // Count reports for this user
      const reportCount = await Report.countDocuments({
        reportedUser: report.reportedUser,
        status: 'resolved',
        reason: { $in: ['harassment', 'inappropriate'] }
      });

      // Auto-ban if 3+ serious reports
      if (reportCount >= 3) {
        const reportedUser = await User.findById(report.reportedUser);
        if (reportedUser && !reportedUser.isBanned) {
          reportedUser.isBanned = true;
          await reportedUser.save();
          console.log(`[Auto-Ban] User ${report.reportedUser} banned due to multiple reports`);
        }
      }
    }

    // Log admin action
    await AdminAudit.create({
      admin: req.user.id,
      action: 'update_report_status',
      method: req.method,
      path: req.path,
      body: { reportId, status, adminNotes }
    });

    res.json({
      message: "Report status updated successfully",
      report: await Report.findById(reportId)
        .populate("reportedBy", "fullName username")
        .populate("reportedUser", "fullName username")
        .populate("blog", "title")
    });
  } catch (error) {
    console.error("Error updating report status:", error);
    res.status(500).json({ message: "Failed to update report status" });
  }
};

