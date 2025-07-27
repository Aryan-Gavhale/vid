// src/controllers/messageController.js
import { ApiError } from "../Utils/ApiError.js";
import { ApiResponse } from "../Utils/ApiResponse.js";
import prisma from "../prismaClient.js";

const sendMessage = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const senderId = req.user.id;
    const { receiverId, orderId, content, subject, parentId, attachments } = req.body;

    // Validate required fields
    if (!receiverId || !content) {
      return next(new ApiError(400, "Receiver ID and content are required"));
    }

    // Validate receiver exists
    const receiver = await prisma.user.findUnique({ where: { id: parseInt(receiverId) } });
    if (!receiver) {
      return next(new ApiError(404, "Receiver not found"));
    }

    // Validate order if provided
    let order = null;
    if (orderId) {
      order = await prisma.order.findUnique({
        where: { id: parseInt(orderId) },
        include: { client: true, freelancer: true },
      });
      if (!order || (order.clientId !== senderId && order.freelancer.userId !== senderId)) {
        return next(new ApiError(404, "Order not found or you don't have access"));
      }
    }

    // Validate parent message if provided
    if (parentId) {
      const parentMessage = await prisma.message.findUnique({ where: { id: parseInt(parentId) } });
      if (!parentMessage || (parentMessage.senderId !== senderId && parentMessage.receiverId !== senderId)) {
        return next(new ApiError(404, "Parent message not found or you don't have access"));
      }
    }

    // Handle attachments from req.fileUrls (set by upload middleware)
    const attachmentData = req.fileUrls ? req.fileUrls.map(url => ({
      fileUrl: url,
      fileType: "video/mp4", // Placeholder; adjust based on actual file type
      fileName: url.split("/").pop(),
    })) : [];

    const message = await prisma.message.create({
      data: {
        senderId,
        receiverId: parseInt(receiverId),
        orderId: orderId ? parseInt(orderId) : null,
        content,
        subject,
        parentId: parentId ? parseInt(parentId) : null,
        attachments: { create: attachmentData },
      },
      include: { sender: { select: { firstname: true, lastname: true } }, receiver: { select: { firstname: true, lastname: true } } },
    });

    // Notify receiver (optional: integrate with notification controller later)
    await prisma.notification.create({
      data: {
        userId: receiverId,
        type: "MESSAGE",
        content: `New message from ${req.user.firstname}: ${subject || content.substring(0, 50)}...`,
      },
    });

    return res.status(201).json(new ApiResponse(201, message, "Message sent successfully"));
  } catch (error) {
    console.error("Error sending message:", error);
    return next(new ApiError(500, "Failed to send message", error.message));
  }
};

const getMessages = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;
    const { orderId, receiverId, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      OR: [
        { senderId: userId },
        { receiverId: userId },
      ],
      isDeleted: false,
    };

    if (orderId) {
      const order = await prisma.order.findUnique({
        where: { id: parseInt(orderId) },
        include: { client: true, freelancer: true },
      });

      if (!order || (order.clientId !== userId && order.freelancer.userId !== userId)) {
        return next(new ApiError(403, "Forbidden: You don't have access to this order's messages"));
      }

      where.orderId = parseInt(orderId);
    }

    if (receiverId) {
      where.receiverId = parseInt(receiverId);
    }

    const messages = await prisma.message.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            profilePicture: true,
          },
        },
        receiver: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            profilePicture: true,
          },
        },
        order: { select: { orderNumber: true } },
        replies: {
          include: {
            sender: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
              },
            },
          },
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
              },
            },
          },
        },
      },
      orderBy: { timestamp: "desc" },
      skip,
      take: parseInt(limit),
    });

    const total = await prisma.message.count({ where });

    return res.status(200).json(
      new ApiResponse(200, {
        messages,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      }, "Messages retrieved successfully")
    );
  } catch (error) {
    console.error("Error retrieving messages:", error);
    return next(new ApiError(500, "Failed to retrieve messages", error.message));
  }
};

const getMessagesByJob = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;
    const { jobId } = req.params;

    // Verify user has access to the job
    const job = await prisma.job.findUnique({
      where: { id: parseInt(jobId) },
      select: { postedById: true, freelancerId: true },
    });

    if (!job) {
      return next(new ApiError(404, "Job not found"));
    }

    if (userId !== job.postedById && userId !== job.freelancerId) {
      return next(new ApiError(403, "Unauthorized access to job messages"));
    }

    const messages = await prisma.message.findMany({
      where: {
        jobId: parseInt(jobId),
        deletedAt: null, // Exclude soft-deleted messages
      },
      include: {
        sender: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            profilePicture: true,
          },
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
              },
            },
          },
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    const formattedMessages = messages.map(message => ({
      id: message.id,
      jobId: message.jobId,
      content: message.content,
      sender: {
        id: message.sender.id,
        name: `${message.sender.firstname} ${message.sender.lastname}`,
        avatar: message.sender.profilePicture || null,
      },
      reactions: message.reactions.map(reaction => ({
        id: reaction.id,
        emoji: reaction.emoji,
        user: {
          id: reaction.user.id,
          name: `${reaction.user.firstname} ${reaction.user.lastname}`,
        },
      })),
      timestamp: message.timestamp.toISOString(),
    }));

    return res.status(200).json(
      new ApiResponse(200, formattedMessages, "Messages retrieved successfully")
    );
  } catch (error) {
    console.error("Error retrieving job messages:", error);
    return next(new ApiError(500, "Failed to retrieve job messages", error.message));
  }
};

const markMessageAsRead = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;
    const { messageId } = req.params;

    const message = await prisma.message.findUnique({
      where: { id: parseInt(messageId) },
    });
    if (!message || message.receiverId !== userId) {
      return next(new ApiError(404, "Message not found or you are not the receiver"));
    }
    if (message.isRead) {
      return next(new ApiError(400, "Message is already marked as read"));
    }

    const updatedMessage = await prisma.message.update({
      where: { id: parseInt(messageId) },
      data: {
        isRead: true,
        readAt: new Date(),
      },
      include: { sender: { select: { firstname: true, lastname: true } } },
    });

    return res.status(200).json(new ApiResponse(200, updatedMessage, "Message marked as read successfully"));
  } catch (error) {
    console.error("Error marking message as read:", error);
    return next(new ApiError(500, "Failed to mark message as read", error.message));
  }
};

const deleteMessage = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }

    const userId = req.user.id;
    const { messageId } = req.params;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: true,
        job: true
      }
    });

    if (!message) {
      return next(new ApiError(404, "Message not found"));
    }

    const isSender = message.senderId === parseInt(userId);
    const isJobOwner = message.job.postedById === parseInt(userId);

    if (!isSender && !isJobOwner) {
      return next(new ApiError(403, "Forbidden: You can only delete your own messages or messages in your job"));
    }

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: { 
        isDeleted: true,
        content: "This message was deleted",
        attachments: []
      },
      include: {
        sender: true,
        job: true
      }
    });

    if (req.io) {
      req.io.to(`job-${message.jobId}`).emit('messageDeleted', {
        messageId: message.id,
        jobId: message.jobId
      });
    }

    return res.status(200).json(
      new ApiResponse(200, null, "Message deleted successfully")
    );
  } catch (error) {
    console.error("Error deleting message:", error);
    return next(
      new ApiError(500, "Failed to delete message", error.message)
    );
  }
};

// Bonus: Flag a message for moderation
const flagMessage = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;
    const { messageId } = req.params;
    const { reason } = req.body;

    const message = await prisma.message.findUnique({
      where: { id: parseInt(messageId) },
    });
    if (!message || (message.senderId !== userId && message.receiverId !== userId)) {
      return next(new ApiError(404, "Message not found or you don't have access"));
    }
    if (message.isFlagged) {
      return next(new ApiError(400, "Message is already flagged"));
    }

    const updatedMessage = await prisma.message.update({
      where: { id: parseInt(messageId) },
      data: {
        isFlagged: true,
        flaggedReason: reason || "Not specified",
      },
      include: { sender: { select: { firstname: true, lastname: true } }, receiver: { select: { firstname: true, lastname: true } } },
    });

    // Notify admin (optional: integrate with notification controller)
    await prisma.notification.create({
      data: {
        userId: 1, // Placeholder admin ID; adjust logic
        type: "SYSTEM",
        content: `Message #${messageId} flagged by user ${userId} for: ${reason || "Not specified"}`,
      },
    });

    return res.status(200).json(new ApiResponse(200, updatedMessage, "Message flagged successfully"));
  } catch (error) {
    console.error("Error flagging message:", error);
    return next(new ApiError(500, "Failed to flag message", error.message));
  }
};

const addReaction = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }

    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user.id;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { reactions: true },
    });

    if (!message) {
      return next(new ApiError(404, "Message not found"));
    }

    let reactions = message.reactions || [];
    const reactionIndex = reactions.findIndex((r) => r.emoji === emoji);

    if (reactionIndex > -1) {
      const reaction = reactions[reactionIndex];
      if (reaction.users.includes(userId)) {
        reaction.users = reaction.users.filter((u) => u !== userId);
        reaction.count--;
        if (reaction.count === 0) {
          reactions.splice(reactionIndex, 1);
        }
      } else {
        reaction.users.push(userId);
        reaction.count++;
      }
    } else {
      reactions.push({ emoji, count: 1, users: [userId] });
    }

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: { reactions },
      select: { reactions: true },
    });

    return res
      .status(200)
      .json(new ApiResponse(200, updatedMessage, "Reaction updated successfully"));
  } catch (error) {
    console.error("Error adding reaction:", error);
    return next(new ApiError(500, "Failed to add reaction", error.message));
  }
};



const getMessagesByJobId = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;
    const { jobId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Validate job exists and user has access
    const job = await prisma.job.findUnique({
      where: { id: parseInt(jobId) },
      include: { postedBy: true, freelancer: true },
    });

    if (!job) {
      return next(new ApiError(404, "Job not found"));
    }

    // Check if user is the job poster or assigned freelancer
    if (job.postedById !== userId && job.freelancer?.userId !== userId) {
      return next(new ApiError(403, "Forbidden: You don't have access to this job's messages"));
    }

    // Get messages for this job
    const messages = await prisma.message.findMany({
      where: {
        jobId: parseInt(jobId),
        isDeleted: false,
      },
      include: {
        sender: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            profilePicture: true,
          },
        },
        parent: {
          include: {
            sender: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
              },
            },
          },
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
              },
            },
          },
        },
      },
      orderBy: { timestamp: "asc" },
      skip,
      take: parseInt(limit),
    });

    // Get total count for pagination
    const total = await prisma.message.count({
      where: {
        jobId: parseInt(jobId),
        isDeleted: false,
      },
    });

    return res.status(200).json(
      new ApiResponse(200, {
        messages,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      }, "Job messages retrieved successfully")
    );
  } catch (error) {
    console.error("Error retrieving job messages:", error);
    return next(new ApiError(500, "Failed to retrieve job messages", error.message));
  }
};

const getMessagesByOrderId = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;
    const { orderId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Validate order exists and user has access
    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId) },
      include: { client: true, freelancer: true },
    });

    if (!order) {
      return next(new ApiError(404, "Order not found"));
    }

    // Check if user is the client or freelancer
    if (order.clientId !== userId && order.freelancer.userId !== userId) {
      return next(new ApiError(403, "Forbidden: You don't have access to this order's messages"));
    }

    // Get messages for this order
    const messages = await prisma.message.findMany({
      where: {
        orderId: parseInt(orderId),
        isDeleted: false,
      },
      include: {
        sender: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            profilePicture: true,
          },
        },
        parent: {
          include: {
            sender: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
              },
            },
          },
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
              },
            },
          },
        },
      },
      orderBy: { timestamp: "asc" },
      skip,
      take: parseInt(limit),
    });

    // Get total count for pagination
    const total = await prisma.message.count({
      where: {
        orderId: parseInt(orderId),
        isDeleted: false,
      },
    });

    return res.status(200).json(
      new ApiResponse(200, {
        messages,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      }, "Order messages retrieved successfully")
    );
  } catch (error) {
    console.error("Error retrieving order messages:", error);
    return next(new ApiError(500, "Failed to retrieve order messages", error.message));
  }
};

export {
  sendMessage,
  getMessages,
  getMessagesByJob,
  markMessageAsRead,
  deleteMessage,
  flagMessage,
  addReaction,
  getMessagesByJobId,
  getMessagesByOrderId, // Add this export
};