// src/controllers/notificationController.js
import { ApiError } from "../Utils/ApiError.js";
import { ApiResponse } from "../Utils/ApiResponse.js";
import prisma from "../prismaClient.js";

const createNotification = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const creatorId = req.user.id; // Admin or system creating the notification
    const { userId, type, content, entityType, entityId, priority, expiresAt, metadata } = req.body;

    // Validate required fields
    if (!userId || !type || !content) {
      return next(new ApiError(400, "User ID, type, and content are required"));
    }

    // Validate user exists
    const targetUser = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
    if (!targetUser) {
      return next(new ApiError(404, "Target user not found"));
    }

    // Restrict to admins or system-initiated notifications (adjust as needed)
    if (req.user.role !== "ADMIN" && creatorId !== userId && type !== "SYSTEM") {
      return next(new ApiError(403, "Forbidden: Only admins can create notifications for others"));
    }

    // Validate entity if provided
    if (entityType && entityId) {
      const validEntities = ["ORDER", "MESSAGE", "REVIEW", "TRANSACTION", "APPLICATION"];
      if (!validEntities.includes(entityType)) {
        return next(new ApiError(400, `Invalid entity type. Allowed: ${validEntities.join(", ")}`));
      }
      // Add entity-specific validation if needed (e.g., check order exists)
    }

    const notification = await prisma.notification.create({
      data: {
        userId: parseInt(userId),
        type,
        content,
        entityType,
        entityId: entityId ? parseInt(entityId) : null,
        priority: priority || "NORMAL",
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        metadata,
      },
      include: { user: { select: { firstname: true, lastname: true } } },
    });

    return res.status(201).json(new ApiResponse(201, notification, "Notification created successfully"));
  } catch (error) {
    console.error("Error creating notification:", error);
    return next(new ApiError(500, "Failed to create notification", error.message));
  }
};

const getNotifications = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;
    const { type, isRead, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      userId: parseInt(userId), // Ensure we're filtering by the current user's ID
      OR: [
        { expiresAt: { gte: new Date() } },  // Active notifications
        { expiresAt: null }  // Notifications that never expire
      ]
    };
    if (type) where.type = type;
    if (isRead !== undefined) where.isRead = isRead === "true";

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: { 
          user: { 
            select: { 
              firstname: true, 
              lastname: true 
            } 
          }
        },
        orderBy: [
          { priority: 'desc' },  // Show high priority first
          { createdAt: 'desc' }  // Then most recent
        ],
        skip,
        take: parseInt(limit)
      }),
      prisma.notification.count({ where })
    ]);

    return res.status(200).json(
      new ApiResponse(200, {
        notifications,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      }, "Notifications retrieved successfully")
    );
  } catch (error) {
    console.error("Error retrieving notifications:", error);
    return next(new ApiError(500, "Failed to retrieve notifications", error.message));
  }
};

const markNotificationAsRead = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;
    const { notificationId } = req.params;

    const notification = await prisma.notification.findUnique({
      where: { id: parseInt(notificationId) },
    });
    if (!notification || notification.userId !== userId) {
      return next(new ApiError(404, "Notification not found or you don't own it"));
    }
    if (notification.isRead) {
      return next(new ApiError(400, "Notification is already marked as read"));
    }

    const updatedNotification = await prisma.notification.update({
      where: { id: parseInt(notificationId) },
      data: {
        isRead: true,
        readAt: new Date(),
      },
      include: { user: { select: { firstname: true, lastname: true } } },
    });

    return res.status(200).json(new ApiResponse(200, updatedNotification, "Notification marked as read successfully"));
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return next(new ApiError(500, "Failed to mark notification as read", error.message));
  }
};

const deleteNotification = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;
    const { notificationId } = req.params;

    const notification = await prisma.notification.findUnique({
      where: { id: parseInt(notificationId) },
    });
    if (!notification || notification.userId !== userId) {
      return next(new ApiError(404, "Notification not found or you don't own it"));
    }

    await prisma.notification.delete({
      where: { id: parseInt(notificationId) },
    });

    return res.status(200).json(new ApiResponse(200, null, "Notification deleted successfully"));
  } catch (error) {
    console.error("Error deleting notification:", error);
    return next(new ApiError(500, "Failed to delete notification", error.message));
  }
};

// Bonus: Mark all notifications as read
const markAllNotificationsAsRead = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;

    const unreadCount = await prisma.notification.count({
      where: { userId, isRead: false, expiresAt: { gte: new Date() } },
    });
    if (unreadCount === 0) {
      return next(new ApiError(400, "No unread notifications to mark"));
    }

    await prisma.notification.updateMany({
      where: { userId, isRead: false, expiresAt: { gte: new Date() } },
      data: { isRead: true, readAt: new Date() },
    });

    return res.status(200).json(new ApiResponse(200, null, "All notifications marked as read successfully"));
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return next(new ApiError(500, "Failed to mark all notifications as read", error.message));
  }
};

export { createNotification, getNotifications, markNotificationAsRead, deleteNotification, markAllNotificationsAsRead };