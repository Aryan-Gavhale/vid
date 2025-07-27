// src/controllers/orderController.js
import { ApiError } from "../Utils/ApiError.js";
import { ApiResponse } from "../Utils/ApiResponse.js";
import prisma from "../prismaClient.js";
import { v4 as uuidv4 } from "uuid";
import logger from "../Utils/logger.js"; // Assuming a Winston or Pino logger
import { queueNotification } from "../Utils/notificationService.js"; // For async notifications

// Create Order
const createOrder = async (req, res, next) => {
  try {
    console.log("Order creation started", { body: req.body, user: req.user });
    
    if (!req.user || !req.user.id) {
      throw new ApiError(401, "Unauthorized: User not authenticated");
    }
    const clientId = req.user.id;
    // const { gigId, selectedPackage, requirements, isUrgent, customDetails } = req.body;

    const {
      gigId,
      selectedPackage,
      title,
      description,
      videoType,
      numberOfVideos,
      totalDuration,
      referenceUrl,
      aspectRatio,
      addSubtitles,
      expressDelivery,
      uploadedFiles, // You’d store file links, or handle upload before order create
      requirements,
      customDetails,
    } = req.body;

    if (!gigId || !selectedPackage) {
      throw new ApiError(400, "Gig ID and package are required");
    }

    const orderNumber = `ORD-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}${String(new Date().getDate()).padStart(2, "0")}-${uuidv4().slice(0, 4).toUpperCase()}`;

    // Quick validation first
    const gig = await prisma.gig.findUnique({
      where: { id: parseInt(gigId) },
      include: { freelancer: true },
    });
    
    if (!gig || gig.status !== "ACTIVE") {
      throw new ApiError(404, "Gig not found or not active");
    }

    // Validate package
    const pricingData = typeof gig.pricing === "string" ? JSON.parse(gig.pricing) : gig.pricing;
    const selectedPackageData = pricingData.find((pkg) => pkg.name === selectedPackage);
    
    if (!selectedPackageData) {
      throw new ApiError(400, "Invalid package selected");
    }

    // Calculate price and order details
    const basePrice = Number(selectedPackageData.price);
    if (isNaN(basePrice)) {
      throw new ApiError(500, "Invalid package price format");
    }

    const totalPrice = expressDelivery ? basePrice * 1.5 : basePrice;
    const priorityFee = expressDelivery ? basePrice * 0.5 : null;
    const deliveryDeadline = new Date(Date.now() + (gig.deliveryTime || 7) * 24 * 60 * 60 * 1000);

    // Create order with minimal transaction
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          gigId: gig.id,
          clientId,
          freelancerId: gig.freelancerId,
          title,
          description,
          videoType,
          numberOfVideos,
          totalDuration,
          referenceUrl,
          aspectRatio,
          addSubtitles,
          expressDelivery,
          uploadedFiles,
          package: selectedPackage,
          totalPrice,
          requirements,
          isUrgent: expressDelivery || false,
          priorityFee,
          customDetails,
          orderNumber,
          deliveryDeadline,
          orderSource: req.headers["user-agent"]?.includes("Mobile") ? "MOBILE" : "WEB",
          urgencyLevel: expressDelivery ? "EXPRESS" : "STANDARD",
          orderPriority: expressDelivery ? 1 : 0,
          metadata: { clientIp: req.ip },
          statusHistory: {
            create: {
              status: "PENDING",
              changedBy: clientId,
            },
          },
        },
        include: { gig: true, freelancer: { include: { user: true } }, statusHistory: true },
      });

      // Update gig metrics (non-blocking)
      tx.gig.update({
        where: { id: gig.id },
        data: {
          orderCount: { increment: 1 },
          lastOrderedAt: new Date(),
          views: { increment: 1 },
        },
      }).catch(console.error);

      // Update freelancer profile (non-blocking)
      tx.freelancerProfile.update({
        where: { id: gig.freelancerId },
        data: {
          orderCount: { increment: 1 },
          activeOrders: { increment: 1 },
          lastActiveAt: new Date(),
        },
      }).catch(console.error);

      return newOrder;
    });

    // Queue notifications for async delivery (non-blocking)
    queueNotification({
      orderId: order.id,
      clientId,
      freelancerId: order.freelancer.userId,
      orderNumber,
    }).catch(error => console.error("Notification queue error:", error));

    // Create notifications asynchronously
    prisma.notification.createMany({
      data: [
        {
          userId: clientId,
          type: "ORDER_UPDATE",
          content: `Your order #${orderNumber} has been placed.`,
          entityType: "ORDER",
          entityId: order.id,
          priority: "HIGH",
          deliveryMethod: "IN_APP",
        },
        {
          userId: order.freelancer.userId,
          type: "ORDER_UPDATE",
          content: `You have a new order #${orderNumber}.`,
          entityType: "ORDER",
          entityId: order.id,
          priority: "HIGH",
          deliveryMethod: "IN_APP",
        },
      ],
    }).catch(error => console.error("Notification creation error:", error));

    logger.info(`Order created: #${order.orderNumber} by client ${clientId}`);
    return res.status(201).json(new ApiResponse(201, order, "Order created successfully"));
  } catch (error) {
    console.error("Order creation error:", error);
    logger.error(`Error creating order for client ${req.user?.id}: ${error.message}`, { error });
    return next(new ApiError(500, "Failed to create order", error.message));
  }
};

// Update Order Status
const updateOrderStatus = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      throw new ApiError(401, "Unauthorized: User not authenticated");
    }
    const userId = req.user.id;
    const { orderId } = req.params;
    const { status, extensionReason } = req.body;

    const updatedOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: parseInt(orderId) },
        include: { 
          client: true, 
          freelancer: { include: { user: true } } 
        },
      });
      if (!order) {
        throw new ApiError(404, "Order not found");
      }

      const isClient = order.clientId === userId;
      console.log("order.freelancer:", order.freelancer);
      console.log("order.freelancer.user:", order.freelancer?.user);

      const isFreelancer = order.freelancer?.user?.id === userId;

      if (!isClient && !isFreelancer) {
        throw new ApiError(403, "Forbidden: You can only update your own orders");
      }

      const validTransitions = {
        PENDING: ["CURRENT", "REJECTED"],
        CURRENT: ["COMPLETED", "REJECTED"],
        COMPLETED: [],
        REJECTED: [],
      };
      if (!status || !validTransitions[order.status]?.includes(status)) {
        throw new ApiError(400, `Invalid status transition from ${order.status} to ${status}`);
      }

      const updateData = { status };
      if (status === "REJECTED") {
        updateData.cancellationReason =
          req.body.cancellationReason || "Freelancer rejected the order.";
        updateData.cancellationDate = new Date();
      }

      if (status === "COMPLETED") {
        updateData.completedAt = new Date();
      }

      const updated = await tx.order.update({
        where: { id: parseInt(orderId) },
        data: {
          ...updateData,
          statusHistory: { create: { status, changedBy: userId } },
          lastNotifiedAt: new Date(),
        },
        include: {
          statusHistory: true,
          freelancer: { include: { user: true } }, // ADD THIS!
        },
      });

      // Create notification for status update
      await tx.notification.create({
        data: {
          userId: isClient ? order.freelancer.user.id : order.clientId,
          type: "ORDER_UPDATE",
          content: `Order #${order.orderNumber} status updated to ${status}.`,
          entityType: "ORDER",
          entityId: order.id,
          priority: "HIGH",
          deliveryMethod: "IN_APP",
        },
      });

      return updated;
    });

    await queueNotification({
      orderId: updatedOrder.id,
      clientId: updatedOrder.clientId,
      freelancerId: updatedOrder.freelancer.user.id,
      orderNumber: updatedOrder.orderNumber,
      status,
    });

    logger.info(`Order #${updatedOrder.orderNumber} status updated to ${status} by user ${userId}`);
    return res.status(200).json(new ApiResponse(200, updatedOrder, "Order status updated successfully"));
  } catch (error) {
    logger.error(`Error updating order status for order ${req.params.orderId}: ${error.message}`, { error });
    return next(new ApiError(500, "Failed to update order status", error.message));
  }
};

// Get Order
const getOrder = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      throw new ApiError(401, "Unauthorized: User not authenticated");
    }
    const userId = req.user.id;
    const { orderId } = req.params;

    if (!orderId || isNaN(parseInt(orderId))) {
      throw new ApiError(400, "Valid orderId is required");
    }

    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId) },
      include: {
        gig: true,
        client: { select: { firstname: true, lastname: true, email: true } },
        freelancer: { include: { user: { select: { firstname: true, lastname: true, email: true } } } },
        review: true,
        messages: true,
        dispute: true,
        statusHistory: true,
      },
    });
    if (!order) {
      throw new ApiError(404, "Order not found");
    }
    if (order.clientId !== userId && order.freelancer.user.id !== userId) {
      throw new ApiError(403, "Forbidden: You can only view your own orders");
    }

    const orderWithDaysLeft = {
      ...order,
      daysLeft: order.deliveryDeadline
        ? Math.max(0, Math.ceil((new Date(order.deliveryDeadline) - new Date()) / (1000 * 60 * 60 * 24)))
        : null,
    };

    logger.info(`Order #${order.orderNumber} retrieved by user ${userId}`);
    return res.status(200).json(new ApiResponse(200, orderWithDaysLeft, "Order retrieved successfully"));
  } catch (error) {
    logger.error(`Error retrieving order ${req.params.orderId}: ${error.message}`, { error });
    return next(new ApiError(500, "Failed to retrieve order", error.message));
  }
};

// Get Client Orders
const getClientOrders = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      throw new ApiError(401, "Unauthorized: User not authenticated");
    }
    const clientId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { clientId };
    if (status) where.status = status;

    const [orders, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: {
          gig: true,
          freelancer: { include: { user: { select: { firstname: true, lastname: true } } } },
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
      }),
      prisma.order.count({ where }),
    ]);

    const ordersWithDaysLeft = orders.map((order) => ({
      ...order,
      daysLeft: order.deliveryDeadline
        ? Math.max(0, Math.ceil((new Date(order.deliveryDeadline) - new Date()) / (1000 * 60 * 60 * 24)))
        : null,
    }));

    logger.info(`Retrieved ${orders.length} client orders for user ${clientId}`);
    return res.status(200).json(
      new ApiResponse(200, {
        orders: ordersWithDaysLeft,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      }, "Client orders retrieved successfully")
    );
  } catch (error) {
    logger.error(`Error retrieving client orders for user ${req.user?.id}: ${error.message}`, { error });
    return next(new ApiError(500, "Failed to retrieve client orders", error.message));
  }
};

// Get Freelancer Orders
const getFreelancerOrders = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      throw new ApiError(401, "Unauthorized: User not authenticated");
    }
    const userId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const freelancer = await prisma.freelancerProfile.findUnique({ where: { userId } });
    if (!freelancer) {
      throw new ApiError(404, "Freelancer profile not found");
    }

    const where = { freelancerId: freelancer.id };
    if (status) where.status = status;

    const [orders, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: {
          gig: true,
          client: { select: { firstname: true, lastname: true } },
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
      }),
      prisma.order.count({ where }),
    ]);

    const ordersWithDaysLeft = orders.map((order) => ({
      ...order,
      daysLeft: order.deliveryDeadline
        ? Math.max(0, Math.ceil((new Date(order.deliveryDeadline) - new Date()) / (1000 * 60 * 60 * 24)))
        : null,
    }));

    logger.info(`Retrieved ${orders.length} freelancer orders for freelancer ${freelancer.id}`);
    return res.status(200).json(
      new ApiResponse(200, {
        orders: ordersWithDaysLeft,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      }, "Freelancer orders retrieved successfully")
    );
  } catch (error) {
    logger.error(`Error retrieving freelancer orders for user ${req.user?.id}: ${error.message}`, { error });
    return next(new ApiError(500, "Failed to retrieve freelancer orders", error.message));
  }
};

// Cancel Order
const cancelOrder = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      throw new ApiError(401, "Unauthorized: User not authenticated");
    }
    const userId = req.user.id;
    const { orderId } = req.params;
    const { cancellationReason } = req.body;

    const updatedOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: parseInt(orderId) },
        include: { client: true, freelancer: true },
      });
      if (!order) {
        throw new ApiError(404, "Order not found");
      }
      if (order.clientId !== userId && order.freelancer.user.id !== userId) {
        throw new ApiError(403, "Forbidden: You can only cancel your own orders");
      }
      if (!["PENDING", "ACCEPTED", "IN_PROGRESS"].includes(order.status)) {
        throw new ApiError(400, "Order cannot be cancelled in its current status");
      }

      const updated = await tx.order.update({
        where: { id: parseInt(orderId) },
        data: {
          status: "CANCELLED",
          cancellationReason: cancellationReason || "Not specified",
          cancellationDate: new Date(),
          statusHistory: { create: { status: "CANCELLED", changedBy: userId } },
          lastNotifiedAt: new Date(),
        },
        include: { statusHistory: true },
      });

      // Update freelancer active orders
      await tx.freelancerProfile.update({
        where: { id: order.freelancerId },
        data: { activeOrders: { decrement: 1 } },
      });

      // Notify stakeholders
      await tx.notification.create({
        data: {
          userId: order.clientId === userId ? order.freelancer.user.id : order.clientId,
          type: "ORDER_UPDATE",
          content: `Order #${order.orderNumber} has been cancelled.`,
          entityType: "ORDER",
          entityId: order.id,
          priority: "HIGH",
          deliveryMethod: "IN_APP",
        },
      });

      return updated;
    });

    await queueNotification({
      orderId: updatedOrder.id,
      clientId: updatedOrder.clientId,
      freelancerId: updatedOrder.freelancer.user.id,
      orderNumber: updatedOrder.orderNumber,
      status: "CANCELLED",
    });

    logger.info(`Order #${updatedOrder.orderNumber} cancelled by user ${userId}`);
    return res.status(200).json(new ApiResponse(200, updatedOrder, "Order cancelled successfully"));
  } catch (error) {
    logger.error(`Error cancelling order ${req.params.orderId}: ${error.message}`, { error });
    return next(new ApiError(500, "Failed to cancel order", error.message));
  }
};

// Get Current Orders
const getCurrentOrders = async (req, res, next) => {
  try {
    console.log("getCurrentOrders: Starting...");
    console.log("getCurrentOrders: req.user:", req.user);
    
    if (!req.user || !req.user.id) {
      console.log("getCurrentOrders: No user or user.id");
      throw new ApiError(401, "Unauthorized: User not authenticated");
    }
    const userId = req.user.id;
    console.log("getCurrentOrders: userId:", userId);

    console.log("getCurrentOrders: Querying freelancer profile...");
    const freelancer = await prisma.freelancerProfile.findUnique({ where: { userId } });
    console.log("getCurrentOrders: freelancer:", freelancer);
    
    if (!freelancer) {
      console.log("getCurrentOrders: No freelancer profile found, returning empty array");
      return res.status(200).json(new ApiResponse(200, [], "No freelancer profile found, no current orders"));
    }

    console.log("getCurrentOrders: Querying orders...");
    const orders = await prisma.order.findMany({
      where: {
        freelancerId: freelancer.id,
        status: "CURRENT",
      },
      include: {
        gig: true,
        client: { select: { firstname: true, lastname: true } },
      },
      orderBy: [
        { orderPriority: "desc" },
        { createdAt: "desc" }
      ],
    });
    console.log("getCurrentOrders: orders found:", orders.length);

    const ordersWithDaysLeft = orders.map((order) => ({
      ...order,
      daysLeft: order.deliveryDeadline
        ? Math.max(0, Math.ceil((new Date(order.deliveryDeadline) - new Date()) / (1000 * 60 * 60 * 24)))
        : null,
    }));

    console.log("getCurrentOrders: Returning success response");
    logger.info(`Retrieved ${orders.length} current orders for freelancer ${freelancer.id}`);
    return res.status(200).json(new ApiResponse(200, ordersWithDaysLeft, "Current orders retrieved successfully"));
  } catch (error) {
    console.error("getCurrentOrders: Error:", error);
    logger.error(`Error retrieving current orders for user ${req.user?.id}: ${error.message}`, { error });
    return next(new ApiError(500, "Failed to retrieve current orders", error.message));
  }
};

// Get Pending Orders
const getPendingOrders = async (req, res, next) => {
  try {
    console.log("getPendingOrders: Starting...");
    console.log("getPendingOrders: req.user:", req.user);
    
    if (!req.user || !req.user.id) {
      console.log("getPendingOrders: No user or user.id");
      throw new ApiError(401, "Unauthorized: User not authenticated");
    }
    const userId = req.user.id;
    console.log("getPendingOrders: userId:", userId);

    console.log("getPendingOrders: Querying freelancer profile...");
    const freelancer = await prisma.freelancerProfile.findUnique({ where: { userId } });
    console.log("getPendingOrders: freelancer:", freelancer);
    
    if (!freelancer) {
      console.log("getPendingOrders: No freelancer profile found, returning empty array");
      return res.status(200).json(new ApiResponse(200, [], "No freelancer profile found, no pending orders"));
    }

    console.log("getPendingOrders: Querying orders...");
    const orders = await prisma.order.findMany({
      where: {
        freelancerId: freelancer.id,
        status: "PENDING",
      },
      include: {
        gig: true,
        client: { select: { firstname: true, lastname: true } },
      },
      orderBy: [
        { orderPriority: "desc" },
        { createdAt: "desc" }
      ],
    });
    console.log("getPendingOrders: orders found:", orders.length);

    const ordersWithDaysLeft = orders.map((order) => ({
      ...order,
      daysLeft: order.deliveryDeadline
        ? Math.max(0, Math.ceil((new Date(order.deliveryDeadline) - new Date()) / (1000 * 60 * 60 * 24)))
        : null,
    }));

    console.log("getPendingOrders: Returning success response");
    logger.info(`Retrieved ${orders.length} pending orders for freelancer ${freelancer.id}`);
    return res.status(200).json(new ApiResponse(200, ordersWithDaysLeft, "Pending orders retrieved successfully"));
  } catch (error) {
    console.error("getPendingOrders: Error:", error);
    logger.error(`Error retrieving pending orders for user ${req.user?.id}: ${error.message}`, { error });
    return next(new ApiError(500, "Failed to retrieve pending orders", error.message));
  }
};

// Get Completed Orders
const getCompletedOrders = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      throw new ApiError(401, "Unauthorized: User not authenticated");
    }
    const userId = req.user.id;

    const freelancer = await prisma.freelancerProfile.findUnique({ where: { userId } });
    if (!freelancer) {
      return res.status(200).json(new ApiResponse(200, [], "No freelancer profile found, no completed orders"));
    }

    const orders = await prisma.order.findMany({
      where: {
        freelancerId: freelancer.id,
        status: "COMPLETED",
      },
      include: {
        gig: true,
        client: { select: { firstname: true, lastname: true } },
      },
      orderBy: { completedAt: "desc" },
    });

    const ordersWithDaysLeft = orders.map((order) => ({
      ...order,
      daysLeft: order.deliveryDeadline
        ? Math.max(0, Math.ceil((new Date(order.deliveryDeadline) - new Date()) / (1000 * 60 * 60 * 24)))
        : null,
    }));

    logger.info(`Retrieved ${orders.length} completed orders for freelancer ${freelancer.id}`);
    return res.status(200).json(new ApiResponse(200, ordersWithDaysLeft, "Completed orders retrieved successfully"));
  } catch (error) {
    logger.error(`Error retrieving completed orders for user ${req.user?.id}: ${error.message}`, { error });
    return next(new ApiError(500, "Failed to retrieve completed orders", error.message));
  }
};

// Get Rejected Orders
const getRejectedOrders = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      throw new ApiError(401, "Unauthorized: User not authenticated");
    }
    const userId = req.user.id;

    const freelancer = await prisma.freelancerProfile.findUnique({ where: { userId } });
    if (!freelancer) {
      return res.status(200).json(new ApiResponse(200, [], "No freelancer profile found, no rejected orders"));
    }

    const orders = await prisma.order.findMany({
      where: {
        freelancerId: freelancer.id,
        status: "REJECTED",
      },
      include: {
        gig: true,
        client: { select: { firstname: true, lastname: true } },
      },
      orderBy: { updatedAt: "desc" }, // or completedAt if you prefer
    });

    // Calculate daysLeft if you want, optional:
    const ordersWithDaysLeft = orders.map((order) => ({
      ...order,
      daysLeft: order.deliveryDeadline
        ? Math.max(0, Math.ceil((new Date(order.deliveryDeadline) - new Date()) / (1000 * 60 * 60 * 24)))
        : null,
    }));

    logger.info(`Retrieved ${orders.length} rejected orders for freelancer ${freelancer.id}`);
    return res.status(200).json(new ApiResponse(200, ordersWithDaysLeft, "Rejected orders retrieved successfully"));
  } catch (error) {
    logger.error(`Error retrieving rejected orders for user ${req.user?.id}: ${error.message}`, { error });
    return next(new ApiError(500, "Failed to retrieve rejected orders", error.message));
  }
};

// Get Freelancer Active Orders for Workspace
const getFreelancerActiveOrders = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const freelancerId = req.user.id;

    // Get freelancer profile
    const freelancerProfile = await prisma.freelancerProfile.findUnique({
      where: { userId: freelancerId },
    });

    if (!freelancerProfile) {
      return next(new ApiError(404, "Freelancer profile not found"));
    }

    // Get active orders for this freelancer
    const activeOrders = await prisma.order.findMany({
      where: {
        freelancerId: freelancerProfile.id,
        status: {
          in: ["CURRENT", "COMPLETED"]
        }
      },
      include: {
        gig: true,
        client: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            profilePicture: true
          }
        },
        messages: {
          include: {
            sender: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
                profilePicture: true
              }
            }
          },
          orderBy: {
            timestamp: 'asc'
          }
        },
        statusHistory: {
          orderBy: {
            changedAt: 'desc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Transform orders into workspace projects format
    const workspaceProjects = activeOrders.map(order => ({
      id: order.id,
      title: order.title || `Order #${order.orderNumber}`,
      name: order.title || `Order #${order.orderNumber}`,
      status: order.status,
      progress: calculateOrderProgress(order),
      client: order.client,
      freelancerId: order.freelancerId,
      messages: order.messages,
      notes: order.requirements || "",
      timeline: generateOrderTimeline(order),
      tasks: generateOrderTasks(order),
      drafts: [], // Will be populated when draft system is implemented
      revenue: order.totalPrice,
      responseTime: order.responseTime || 24,
      completionRate: order.completionRate || 95,
      createdAt: order.createdAt,
      deliveryDeadline: order.deliveryDeadline,
      orderNumber: order.orderNumber,
      gigId: order.gigId,
      gig: order.gig
    }));

    return res.status(200).json(
      new ApiResponse(200, workspaceProjects, "Freelancer active orders retrieved successfully")
    );
  } catch (error) {
    console.error("Error retrieving freelancer active orders:", error);
    return next(new ApiError(500, "Failed to retrieve active orders", error.message));
  }
};

// Helper function to calculate order progress
const calculateOrderProgress = (order) => {
  const statusProgress = {
    'PENDING': 0,
    'CURRENT': 50,
    'COMPLETED': 100,
    'REJECTED': 0
  };
  return statusProgress[order.status] || 0;
};

// Helper function to generate order timeline
const generateOrderTimeline = (order) => {
  const timeline = [];
  
  // Add order creation
  timeline.push({
    id: `timeline-${order.id}-created`,
    title: "Order Created",
    date: order.createdAt,
    status: "completed"
  });

  // Add status changes from history
  order.statusHistory.forEach((history, index) => {
    timeline.push({
      id: `timeline-${order.id}-${index}`,
      title: `Status: ${history.status}`,
      date: history.changedAt,
      status: history.status === "COMPLETED" ? "completed" : 
              history.status === "CURRENT" ? "in-progress" : "pending"
    });
  });

  // Add delivery deadline
  if (order.deliveryDeadline) {
    timeline.push({
      id: `timeline-${order.id}-deadline`,
      title: "Delivery Deadline",
      date: order.deliveryDeadline,
      status: new Date() > new Date(order.deliveryDeadline) ? "completed" : "pending"
    });
  }

  return timeline.sort((a, b) => new Date(a.date) - new Date(b.date));
};

// Helper function to generate order tasks
const generateOrderTasks = (order) => {
  const tasks = [];
  
  // Add basic tasks based on order status
  tasks.push({
    id: `task-${order.id}-review`,
    name: "Review Order Requirements",
    status: order.status === "PENDING" ? "Pending" : "Completed",
    hours: 1,
    cost: 50,
    dueDate: new Date(order.createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString()
  });

  if (order.status !== "PENDING") {
    tasks.push({
      id: `task-${order.id}-work`,
      name: "Complete Video Editing",
      status: order.status === "COMPLETED" ? "Completed" : 
              order.status === "CURRENT" ? "In Progress" : "Pending",
      hours: 8,
      cost: order.totalPrice * 0.8,
      dueDate: order.deliveryDeadline?.toISOString() || new Date().toISOString()
    });
  }

  if (order.status === "COMPLETED") {
    tasks.push({
      id: `task-${order.id}-delivery`,
      name: "Deliver Final Files",
      status: "Completed",
      hours: 1,
      cost: order.totalPrice * 0.2,
      dueDate: order.deliveryDeadline?.toISOString() || new Date().toISOString()
    });
  }

  return tasks;
};


export {
  createOrder,
  updateOrderStatus,
  getOrder,
  getClientOrders,
  getFreelancerOrders,
  cancelOrder,
  getCurrentOrders,
  getPendingOrders,
  getCompletedOrders,
  getRejectedOrders,
  getFreelancerActiveOrders, // Add this export
};