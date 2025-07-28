// src/middlewares/rateLimit.middleware.js
import rateLimit from "express-rate-limit";
import { ApiError } from "../Utils/ApiError.js";

/**
 * Rate limiter with customizable options
 * @param {Object} options - Rate limit options
 * @returns {Function} Middleware function
 */
const rateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per IP
    message: "Too many requests from this IP, please try again later",
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false, // Disable X-RateLimit headers
    keyGenerator: (req) => req.ip, // Rate limit by IP
    handler: (req, res, next) => {
      next(new ApiError(429, "Too Many Requests", [{ message: "Rate limit exceeded" }]));
    },
  };

  return rateLimit({ ...defaultOptions, ...options });
};

/**
 * Advanced: Rate limit by user ID (authenticated users)
 * @param {Object} options - Rate limit options
 * @returns {Function} Middleware function
 */
const rateLimiterByUser = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // 50 requests per user
    message: "Too many requests from this user, please try again later",
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user ? req.user.id : req.ip, // Use user ID if authenticated, else IP
    skip: (req) => !req.user, // Skip for unauthenticated users
    handler: (req, res, next) => {
      next(new ApiError(429, "Too Many Requests", [{ message: "User rate limit exceeded" }]));
    },
  };

  return rateLimit({ ...defaultOptions, ...options });
};

export { rateLimiter, rateLimiterByUser };