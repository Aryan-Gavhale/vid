import express from "express";
import {
  createGig,
  createGigDraft,
  updateGig,
  updateGigDraft,
  deleteGig,
  deleteGigDraft,
  getGig,
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
router.post("/", createGig);
router.post("/draft", createGigDraft); // New endpoint for creating drafts
router.put("/:gigId", checkOwnership("Gig", "gigId", "freelancerId"), updateGig);
router.put("/draft/:gigId", checkOwnership("Gig", "gigId", "freelancerId"), updateGigDraft); // New endpoint for updating drafts
router.delete("/:gigId", deleteGig);
router.delete("/draft/:gigId", deleteGigDraft); // New endpoint for deleting drafts
router.patch("/:gigId/pause", checkOwnership("Gig", "gigId", "freelancerId"), pauseGig);

// Public route - AFTER specific routes
router.get("/:gigId", getGig);

export default router;