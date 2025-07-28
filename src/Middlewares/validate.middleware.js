// src/middlewares/validate.middleware.js
import { ApiError } from "../Utils/ApiError.js";
import Joi from "joi";

const validateBody = (schema) => {
  return (req, res, next) => {
    let rawBody = { ...req.body }; // Clone original body
    const parsedBody = {};
    for (const [key, value] of Object.entries(rawBody)) {
      if (typeof value === "string") {
        try {
          parsedBody[key] = JSON.parse(value); // Parse JSON strings (e.g., "[\"wedding\"]")
        } catch {
          parsedBody[key] = value; // Use raw value if not JSON
        }
      } else {
        parsedBody[key] = value;
      }
    }
    if (parsedBody.budgetMin) parsedBody.budgetMin = Number(parsedBody.budgetMin);
    if (parsedBody.budgetMax) parsedBody.budgetMax = Number(parsedBody.budgetMax);

    console.log("Validated payload:", parsedBody); // Debug payload before validation

    const { error, value } = schema.validate(parsedBody, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errorDetails = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));
      console.log("Validation errors:", errorDetails); // Debug validation errors
      return next(new ApiError(400, "Validation failed", errorDetails));
    }

    req.body = value;
    next();
  };
};

const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errorDetails = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));
      return next(new ApiError(400, "Query validation failed", errorDetails));
    }

    req.query = value;
    next();
  };
};

export { validateBody, validateQuery };