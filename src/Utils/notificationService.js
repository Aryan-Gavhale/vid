// src/utils/notificationService.js
import Queue from "bull";
const notificationQueue = new Queue("notifications", process.env.REDIS_URL);

export const queueNotification = async ({ orderId, clientId, freelancerId, orderNumber, status }) => {
  await notificationQueue.add({
    orderId,
    clientId,
    freelancerId,
    orderNumber,
    status,
    type: status ? "ORDER_STATUS_UPDATE" : "ORDER_CREATED",
  });
};