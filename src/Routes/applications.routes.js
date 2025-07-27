import express from "express";
import prisma from "../prismaClient.js";
import { authenticateToken } from "../Middlewares/protect.middleware.js";

const router = express.Router();

// GET /api/v1/client/jobs
router.get("/client/jobs", authenticateToken, async (req, res) => {
  const clientId = req.user.id;
  const jobs = await prisma.job.findMany({
    where: {
      postedById: clientId
    }
  });

  return res.json({ success: true, data: jobs });
});

// GET /api/v1/jobs/applications/:jobId
router.get("/jobs/applications/:jobId", authenticateToken, async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { postedById: true }
    });

    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    if (req.user.role !== 'ADMIN' && job.postedById !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized to view these applications' });
    }
    const applications = await prisma.application.findMany({
      where: { jobId },
      include: {
        freelancer: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            username: true,
            profilePicture: true,
            rating: true,
            totalJobs: true,
            successRate: true,
            freelancerProfile: {
              select: {
                jobTitle: true,
                experienceLevel: true,
                skills: true,
                totalEarnings: true,
                hourlyRate: true,
                rating: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      count: applications.length,
      data: applications
    });

  } catch (error) {
    console.error('Error fetching applications by job ID:', error);
    return res.status(500).json({
      message: 'Server error while fetching applications',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router; 