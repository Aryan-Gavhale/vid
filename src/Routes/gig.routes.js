import express from "express";
import {
  createGig,
  createGigDraft,
  updateGig,
  updateGigDraft,
  deleteGig,
  deleteGigDraft,
  getGig,
  getGigAnalytics,
  getFreelancerGigs,
  getAllGigs,
  pauseGig,
} from "../Controllers/gig.controller.js";
import { authenticateToken } from "../Middlewares/protect.middleware.js";
import { checkOwnership } from "../Middlewares/ownership.middlware.js";

const router = express.Router();

// Public routes
router.get("/all", getAllGigs);

// Protected routes
router.use(authenticateToken);
router.get("/freelancer", getFreelancerGigs);
router.get("/:gigId", getGig);
router.get("/:gigId/analytics", checkOwnership("Gig", "gigId", "freelancerId"), getGigAnalytics); // New analytics endpoint
router.post("/", createGig);
router.post("/draft", createGigDraft);
router.put("/:gigId", checkOwnership("Gig", "gigId", "freelancerId"), updateGig);
router.put("/draft/:gigId", checkOwnership("Gig", "gigId", "freelancerId"), updateGigDraft);
router.delete("/:gigId", checkOwnership("Gig", "gigId", "freelancerId"), deleteGig);
router.delete("/draft/:gigId", checkOwnership("Gig", "gigId", "freelancerId"), deleteGigDraft);
router.patch("/:gigId/pause", checkOwnership("Gig", "gigId", "freelancerId"), pauseGig);

export default router;