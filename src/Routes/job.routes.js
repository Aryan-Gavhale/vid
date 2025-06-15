import express from "express";
import {
  createJob,
  updateJob,
  deleteJob,
  getJob,
  getClientJobs,
  getAllJobs,
  applyJob,
  checkApplicationStatus,
  getCurrentJobs,
  getAppliedJobs,
  getCompletedJobs,
  getJobApplications,
  acceptApplication,
  rejectApplication,
  getAllJobsAdmin,
  verifyJob,
  unverifyJob,
  deleteJobAdmin,
  getAllApplicationsAdmin,
  getActiveJobs,
} from "../Controllers/job.controller.js";
import { authenticateToken } from "../Middlewares/protect.middleware.js";
import { restrictTo } from "../Middlewares/restrict.middleware.js";
import { validateBody, validateQuery } from "../Middlewares/validate.middleware.js";
import { uploadSingle } from "../Middlewares/upload.middleware.js";
import Joi from "joi";

const router = express.Router();

// Joi schemas for validation
const jobSchema = Joi.object({
  title: Joi.string().max(100).required().messages({ "string.max": "Title must be 100 characters or less" }),
  description: Joi.string().max(5000).required().messages({ "string.max": "Description must be 5000 characters or less" }),
  category: Joi.array().items(Joi.string().max(50)).min(1).required().messages({ "array.min": "At least one category is required" }),
  budgetMin: Joi.number().positive().required(),
  budgetMax: Joi.number().positive().greater(Joi.ref("budgetMin")).required(),
  deadline: Joi.date().greater("now").required(),
  jobDifficulty: Joi.string().valid("EASY", "INTERMEDIATE", "HARD").required(),
  projectLength: Joi.string().valid("SHORT_TERM", "MEDIUM_TERM", "LONG_TERM").required(),
  keyResponsibilities: Joi.array().items(Joi.string().max(100)).required(),
  requiredSkills: Joi.array().items(Joi.string().max(100)).min(1).required().messages({ "array.min": "At least one skill is required" }),
  tools: Joi.array().items(Joi.string().max(100)).optional(),
  scope: Joi.string().max(5000).required(),
  name: Joi.string().max(100).required(),
  email: Joi.string().email().required(),
  company: Joi.string().max(100).optional(),
  note: Joi.string().max(2000).optional(),
  videoFileUrl: Joi.string().uri().optional(),
});

const updateJobSchema = jobSchema.fork(Object.keys(jobSchema.describe().keys), (field) => field.optional()).min(1);

const getJobsSchema = Joi.object({
  category: Joi.string().optional(),
  search: Joi.string().max(100).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

const applicationActionSchema = Joi.object({
  freelancerId: Joi.number().integer().min(1).required(),
});

// Public routes
router.get("/all", validateQuery(getJobsSchema), getAllJobs); // GET /api/v1/all
router.get("/current", authenticateToken, getCurrentJobs); // GET /api/v1/current
router.get("/applied", authenticateToken, getAppliedJobs); // GET /api/v1/applied
router.get("/completed", authenticateToken, getCompletedJobs); // GET /api/v1/completed
router.get("/active", authenticateToken, restrictTo(["FREELANCER"]), getActiveJobs); // GET /api/v1/active
router.get("/:jobId", getJob); // GET /api/v1/:jobId

// Protected routes (require authentication)
router.use(authenticateToken);
router.get("/apply/status/:jobId", checkApplicationStatus); // GET /api/v1/apply/status/:jobId
router.post("/", uploadSingle("videoFile"), validateBody(jobSchema), createJob); // POST /api/v1/
router.put("/:jobId", uploadSingle("videoFile"), validateBody(updateJobSchema), updateJob); // PUT /api/v1/:jobId
router.delete("/:jobId", deleteJob); // DELETE /api/v1/:jobId
router.get("/", validateQuery(getJobsSchema), getClientJobs); // GET /api/v1/
router.post("/apply/:jobId", validateBody(Joi.object({
  aboutFreelancer: Joi.string().max(5000).required(),
})), applyJob); // POST /api/v1/apply/:jobId

// Client-specific routes (for Shortlist component)
router.get("/:jobId/applications", restrictTo(["CLIENT"]), getJobApplications); // GET /api/v1/:jobId/applications
router.get('/:jobId/applications', authenticateToken, restrictTo('CLIENT'), getJobApplications);
router.post('/:jobId/apply/accept',authenticateToken,validateBody(applicationActionSchema),restrictTo('CLIENT'),acceptApplication);
router.post('/:jobId/apply/reject',authenticateToken,validateBody(applicationActionSchema),restrictTo('CLIENT'),rejectApplication);

// Application routes
router.post("/:jobId/apply", authenticateToken, restrictTo("FREELANCER"), applyJob);
router.get("/:jobId/apply/status", authenticateToken, checkApplicationStatus);
router.post("/:jobId/accept", authenticateToken, restrictTo("CLIENT"), acceptApplication);
router.post("/:jobId/reject", authenticateToken, restrictTo("CLIENT"), rejectApplication);

// Admin routes
router.use("/admin", restrictTo(["ADMIN", "SUPERADMIN"]));
router.get("/admin/jobs", validateQuery(getJobsSchema), getAllJobsAdmin); // GET /api/v1/admin/jobs
router.put("/admin/jobs/:jobId/verify", restrictTo(["SUPERADMIN"]), verifyJob); // PUT /api/v1/admin/jobs/:jobId/verify
router.put("/admin/jobs/:jobId/unverify", restrictTo(["SUPERADMIN"]), unverifyJob); // PUT /api/v1/admin/jobs/:jobId/unverify
router.delete("/admin/jobs/:jobId", deleteJobAdmin); // DELETE /api/v1/admin/jobs/:jobId
router.get("/admin/applications", validateQuery(getJobsSchema), getAllApplicationsAdmin); // GET /api/v1/admin/applications

export default router;
