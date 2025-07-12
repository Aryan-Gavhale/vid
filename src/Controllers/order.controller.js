// src/controllers/orderController.js
import { ApiError } from "../Utils/ApiError.js";
import { ApiResponse } from "../Utils/ApiResponse.js";
import prisma from "../prismaClient.js";
import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger.js"; // Assuming a Winston or Pino logger
import { queueNotification } from "../utils/notificationService.js"; // For async notifications

// Create Order
const createOrder = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      throw new ApiError(401, "Unauthorized: User not authenticated");
    }
    const clientId = req.user.id;
    const { gigId, selectedPackage, requirements, isUrgent, customDetails } = req.body;

    if (!gigId || !selectedPackage) {
      throw new ApiError(400, "Gig ID and package are required");
    }

    const order = await prisma.$transaction(async (tx) => {
      // Validate gig
      const gig = await tx.gig.findUnique({
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
      const totalPrice = isUrgent ? selectedPackageData.price * 1.5 : selectedPackageData.price;
      const orderNumber = `ORD-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}${String(new Date().getDate()).padStart(2, "0")}-${uuidv4().slice(0, 4).toUpperCase()}`;
      const deliveryDeadline = new Date(Date.now() + (gig.deliveryTime || 7) * 24 * 60 * 60 * 1000);

      // Create order
      const newOrder = await tx.order.create({
        data: {
          gigId: gig.id,
          clientId,
          freelancerId: gig.freelancerId,
          package: selectedPackage,
          totalPrice,
          requirements,
          isUrgent: isUrgent || false,
          priorityFee: isUrgent ? selectedPackageData.price * 0.5 : null,
          customDetails,
          orderNumber,
          deliveryDeadline,
          orderSource: req.headers["user-agent"]?.includes("Mobile") ? "MOBILE" : "WEB",
          urgencyLevel: isUrgent ? "EXPRESS" : "STANDARD",
          orderPriority: isUrgent ? 1 : 0,
          statusHistory: { create: { status: "PENDING", changedBy: clientId } },
          metadata: { clientIp: req.ip },
        },
        include: { gig: true, freelancer: { include: { user: true } }, statusHistory: true },
      });

      // Update gig metrics
      await tx.gig.update({
        where: { id: gig.id },
        data: {
          orderCount: { increment: 1 },
          lastOrderedAt: new Date(),
          views: { increment: 1 },
          conversionRate: {
            set: gig.orderCount > 0 ? (gig.orderCount + 1) / (gig.views + 1) : 0,
          },
        },
      });

      // Update freelancer profile
      await tx.freelancerProfile.update({
        where: { id: gig.freelancerId },
        data: {
          orderCount: { increment: 1 },
          activeOrders: { increment: 1 },
          lastActiveAt: new Date(),
        },
      });

      // Create notifications
      await tx.notification.createMany({
        data: [
          {
            userId: clientId,
            type: "ORDER_UPDATE",
            content: `Your order #${orderNumber} has been placed.`,
            entityType: "ORDER",
            entityId: newOrder.id,
            priority: "HIGH",
            deliveryMethod: "IN_APP",
          },
          {
            userId: gig.freelancer.userId,
            type: "ORDER_UPDATE",
            content: `You have a new order #${orderNumber}.`,
            entityType: "ORDER",
            entityId: newOrder.id,
            priority: "HIGH",
            deliveryMethod: "IN_APP",
          },
        ],
      });

      return newOrder;
    });

    // Queue notifications for async delivery
    await queueNotification({
      orderId: order.id,
      clientId,
      freelancerId: order.freelancer.userId,
      orderNumber,
    });

    logger.info(`Order created: #${order.orderNumber} by client ${clientId}`);
    return res.status(201).json(new ApiResponse(201, order, "Order created successfully"));
  } catch (error) {
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
        include: { client: true, freelancer: true },
      });
      if (!order) {
        throw new ApiError(404, "Order not found");
      }

      const isClient = order.clientId === userId;
      const isFreelancer = order.freelancer.userId === userId;
      if (!isClient && !isFreelancer) {
        throw new ApiError(403, "Forbidden: You can only update your own orders");
      }

      const validTransitions = {
        PENDING: ["ACCEPTED", "CANCELLED"],
        ACCEPTED: ["IN_PROGRESS", "CANCELLED"],
        IN_PROGRESS: ["DELIVERED", "CANCELLED"],
        DELIVERED: ["COMPLETED", "DISPUTED"],
        DISPUTED: ["COMPLETED", "CANCELLED"],
      };
      if (!status || !validTransitions[order.status]?.includes(status)) {
        throw new ApiError(400, `Invalid status transition from ${order.status} to ${status}`);
      }

      const updateData = { status };
      if (status === "CANCELLED") {
        updateData.cancellationReason = req.body.cancellationReason || "Not specified";
        updateData.cancellationDate = new Date();
        await tx.freelancerProfile.update({
          where: { id: order.freelancerId },
          data: { activeOrders: { decrement: 1 } },
        });
      } else if (status === "COMPLETED") {
        updateData.completedAt = new Date();
        await tx.freelancerProfile.update({
          where: { id: order.freelancerId },
          data: { activeOrders: { decrement: 1 } },
        });
      } else if (extensionReason) {
        updateData.deliveryExtensions = { increment: 1 };
        updateData.extensionReason = extensionReason;
        updateData.deliveryDeadline = new Date(order.deliveryDeadline.getTime() + 7 * 24 * 60 * 60 * 1000);
      }

      const updated = await tx.order.update({
        where: { id: parseInt(orderId) },
        data: {
          ...updateData,
          statusHistory: { create: { status, changedBy: userId } },
          lastNotifiedAt: new Date(),
        },
        include: { statusHistory: true },
      });

      // Create notification for status update
      await tx.notification.create({
        data: {
          userId: isClient ? order.freelancer.userId : order.clientId,
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
      freelancerId: updatedOrder.freelancer.userId,
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
    if (order.clientId !== userId && order.freelancer.userId !== userId) {
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
      if (order.clientId !== userId && order.freelancer.userId !== userId) {
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
          userId: order.clientId === userId ? order.freelancer.userId : order.clientId,
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
      freelancerId: updatedOrder.freelancer.userId,
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
        status: { in: ["ACCEPTED", "IN_PROGRESS"] },
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
};