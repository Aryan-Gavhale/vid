import express from "express";
import {
  createContactSubmission,
  getContactSubmissions,
  getContactSubmissionById,
  updateContactSubmission,
  deleteContactSubmission,
  assignAdminToSubmission,
  addResolutionNote,
  getSubmissionFiles,
  deleteSubmissionFile,
  submitContact,
  getAllContacts,
  getContactById,
  updateContactStatus,
  deleteContact,
} from "../Controllers/contact.controller.js";
import {uploadMultiple} from "../Middlewares/upload.middleware.js";
import { protect, restrictTo } from "../Middlewares/auth.middleware.js"; 
import { isAdmin } from "../Middlewares/admin.middleware.js";

const router = express.Router();

// Public routes (for users submitting contact forms)
router.post("/", uploadMultiple("files", 5), createContactSubmission);
router.post("/submit", submitContact);

// Admin-only routes
router.use("/admin", protect, isAdmin); // Protect admin routes
router.get("/admin", getAllContacts);
router.get("/admin/:id", getContactById);
router.patch("/admin/:id/status", updateContactStatus);
router.delete("/admin/:id", deleteContact);

// Admin-only routes (alternative pattern)
router.use(protect); // All routes below require authentication
router.use(restrictTo("admin")); // All routes below require admin role

router.get("/", getContactSubmissions); // List all submissions with filters
router.get("/:id", getContactSubmissionById); // Get a single submission with files
router.patch("/:id", updateContactSubmission); // Update submission (status, isResolved, etc.)
router.delete("/:id", deleteContactSubmission); // Delete a submission and its files
router.patch("/:id/assign", assignAdminToSubmission); // Assign an admin to a submission
router.post("/:id/notes", addResolutionNote); // Add a resolution note
router.get("/:id/files", getSubmissionFiles); // Get files for a submission
router.delete("/:id/files/:fileId", deleteSubmissionFile); // Delete a specific file

export default router;