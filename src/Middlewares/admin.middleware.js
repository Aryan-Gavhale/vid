import { ApiError } from "../Utils/ApiError.js";

/**
 * Middleware to check if the authenticated user is an admin
 * This should be used after the authentication middleware
 */
export const isAdmin = (req, res, next) => {
  try {
    // Check if user exists and has admin role
    if (!req.user) {
      throw new ApiError(401, "Authentication required");
    }

    if (req.user.role !== "ADMIN") {
      throw new ApiError(403, "Admin access required");
    }

    // User is an admin, proceed to the next middleware/controller
    next();
  } catch (error) {
    next(error);
  }
}; 