// src/routes/notificationRoutes.js
import express from "express";
import {
  createNotification,
  getNotifications,
  markNotificationAsRead,
  deleteNotification,
  markAllNotificationsAsRead,
} from "../Controllers/notification.controller.js";
import { authenticateToken } from "../Middlewares/protect.middleware.js";
import { restrictTo } from "../Middlewares/restrict.middleware.js";
import { validateBody, validateQuery } from "../Middlewares/validate.middleware.js";
import Joi from "joi";

const router = express.Router();

const createNotificationSchema = Joi.object({
  userId: Joi.number().integer().required(),
  type: Joi.string().valid("ORDER_UPDATE", "MESSAGE", "PAYMENT", "REVIEW", "DISPUTE", "SYSTEM", "APPLICATION").required(),
  content: Joi.string().required(),
  entityType: Joi.string().valid("ORDER", "MESSAGE", "REVIEW", "TRANSACTION", "APPLICATION").optional(),
  entityId: Joi.number().integer().optional(),
  priority: Joi.string().valid("LOW", "NORMAL", "HIGH").optional(),
  expiresAt: Joi.date().optional(),
  metadata: Joi.object().optional(),
});

const getNotificationsSchema = Joi.object({
  type: Joi.string().valid("ORDER_UPDATE", "MESSAGE", "PAYMENT", "REVIEW", "DISPUTE", "SYSTEM", "APPLICATION").optional(),
  isRead: Joi.string().valid("true", "false").optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

// All routes require authentication
router.use(authenticateToken);

// Routes for creating notifications
router.post("/", validateBody(createNotificationSchema), createNotification);

// User-specific routes
router.get("/", validateQuery(getNotificationsSchema), getNotifications);
router.put("/:notificationId/read", markNotificationAsRead);
router.delete("/:notificationId", deleteNotification);
router.put("/read-all", markAllNotificationsAsRead);

export default router;