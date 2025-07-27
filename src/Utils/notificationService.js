// src/utils/notificationService.js
import Queue from "bull";

let notificationQueue;

try {
  notificationQueue = new Queue("notifications", process.env.REDIS_URL || "redis://localhost:6379");
} catch (error) {
  console.error("Failed to initialize notification queue:", error);
  notificationQueue = null;
}

export const queueNotification = async ({ orderId, clientId, freelancerId, orderNumber, status }) => {
  if (!notificationQueue) {
    console.warn("Notification queue not available, skipping notification");
    return;
  }
  
  try {
    await notificationQueue.add({
      orderId,
      clientId,
      freelancerId,
      orderNumber,
      status,
      type: status ? "ORDER_STATUS_UPDATE" : "ORDER_CREATED",
    });
  } catch (error) {
    console.error("Failed to queue notification:", error);
  }
};