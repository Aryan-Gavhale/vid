import { ApiError } from "../Utils/ApiError.js";
import { ApiResponse } from "../Utils/ApiResponse.js";
import prisma from "../prismaClient.js";
import { uploadFileToS3 } from "../Utils/fileUpload.js"; // Adjust based on your S3 upload logic

// Existing Functions (unchanged unless modified)
const applyJob = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }

    const freelancerId = req.user.id;
    const jobId = Number(req.params.jobId);
    const { aboutFreelancer } = req.body;

    if (req.user.role !== "FREELANCER") {
      return next(new ApiError(403, "Only freelancers can apply for jobs"));
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      return next(new ApiError(404, "Job not found"));
    }

    const freelancer = await prisma.user.findUnique({
      where: { id: freelancerId },
      include: { freelancerProfile: true },
    });
    if (!freelancer || !freelancer.freelancerProfile) {
      return next(new ApiError(404, "Freelancer profile not found"));
    }

    const existingApplication = await prisma.application.findFirst({
      where: { freelancerId, jobId },
    });
    if (existingApplication) {
      return next(new ApiError(400, "You have already applied to this job"));
    }

    const appliedJob = await prisma.application.create({
      data: {
        aboutFreelancer,
        freelancer: { connect: { id: freelancerId } },
        job: { connect: { id: jobId } },
      },
    });

    await prisma.user.update({
      where: { id: freelancerId },
      data: {
        appliedJobsId: { push: jobId },
      },
    });

    return res.status(200).json(
      new ApiResponse(200, { appliedJob }, "Applied to job successfully")
    );
  } catch (error) {
    console.error("Error applying for job:", error);
    return next(new ApiError(500, "Failed to apply for job: " + error.message));
  }
};

const createJob = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const postedById = req.user.id;

    const {
      title,
      description,
      category,
      budgetMin,
      budgetMax,
      deadline,
      jobDifficulty,
      projectLength,
      keyResponsibilities,
      requiredSkills,
      tools,
      scope,
      name,
      email,
      company,
      note,
      videoFileUrl,
    } = req.body;

    let finalVideoFileUrl = videoFileUrl;
    if (req.files && req.files.videoFile) {
      const file = req.files.videoFile;
      if (!file.mimetype.startsWith("video/")) {
        return next(new ApiError(400, "Invalid file type. Only videos are allowed"));
      }
      finalVideoFileUrl = await uploadFileToS3(file, `jobs/${postedById}/${Date.now()}-${file.name}`);
    }

    const job = await prisma.job.create({
      data: {
        title,
        description,
        category,
        budgetMin,
        budgetMax,
        deadline: new Date(deadline),
        jobDifficulty,
        projectLength,
        keyResponsibilities,
        requiredSkills,
        tools: tools || [],
        scope,
        postedById,
        name,
        email,
        company,
        note,
        videoFileUrl: finalVideoFileUrl,
        isVerified: false, // Jobs require admin verification
      },
      include: { postedBy: { select: { firstname: true, lastname: true } } },
    });

    return res.status(201).json(new ApiResponse(201, job, "Job posted successfully"));
  } catch (error) {
    console.error("Error creating job:", error);
    return next(new ApiError(500, "Failed to post job", error.message));
  }
};

const updateJob = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;
    const { jobId } = req.params;
    const {
      title,
      description,
      category,
      budgetMin,
      budgetMax,
      deadline,
      jobDifficulty,
      projectLength,
      keyResponsibilities,
      requiredSkills,
      tools,
      scope,
      name,
      email,
      company,
      note,
      videoFileUrl,
    } = req.body;

    const job = await prisma.job.findUnique({
      where: { id: parseInt(jobId) },
    });
    if (!job || job.postedById !== userId) {
      return next(new ApiError(404, "Job not found or you don’t own it"));
    }

    const updateData = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (category) updateData.category = Array.isArray(category) ? category : [category];
    if (budgetMin !== undefined) {
      const minBudget = parseFloat(budgetMin);
      if (isNaN(minBudget) || minBudget < 0) {
        return next(new ApiError(400, "Invalid budgetMin value"));
      }
      updateData.budgetMin = minBudget;
    }
    if (budgetMax !== undefined) {
      const maxBudget = parseFloat(budgetMax);
      if (isNaN(maxBudget) || maxBudget < (updateData.budgetMin || job.budgetMin)) {
        return next(new ApiError(400, "Invalid budgetMax value; must be greater than budgetMin"));
      }
      updateData.budgetMax = maxBudget;
    }
    if (deadline) {
      const parsedDeadline = new Date(deadline);
      if (isNaN(parsedDeadline.getTime()) || parsedDeadline < new Date()) {
        return next(new ApiError(400, "Invalid deadline. Please provide a future date"));
      }
      updateData.deadline = parsedDeadline;
    }
    if (jobDifficulty) updateData.jobDifficulty = jobDifficulty;
    if (projectLength) updateData.projectLength = projectLength;
    if (keyResponsibilities) updateData.keyResponsibilities = Array.isArray(keyResponsibilities) ? keyResponsibilities : keyResponsibilities ? [keyResponsibilities] : [];
    if (requiredSkills) updateData.requiredSkills = Array.isArray(requiredSkills) ? requiredSkills : [requiredSkills];
    if (tools) updateData.tools = Array.isArray(tools) ? tools : tools ? [tools] : [];
    if (scope) updateData.scope = scope;
    if (name) updateData.name = name;
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return next(new ApiError(400, "Invalid email format"));
      }
      updateData.email = email;
    }
    if (company !== undefined) updateData.company = company;
    if (note !== undefined) updateData.note = note;
    if (videoFileUrl !== undefined) updateData.videoFileUrl = videoFileUrl;

    const updatedJob = await prisma.job.update({
      where: { id: parseInt(jobId) },
      data: updateData,
      include: { postedBy: { select: { firstname: true, lastname: true } } },
    });

    return res.status(200).json(new ApiResponse(200, updatedJob, "Job updated successfully"));
  } catch (error) {
    console.error("Error updating job:", error);
    return next(new ApiError(500, "Failed to update job", error.message));
  }
};

const deleteJob = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;
    const { jobId } = req.params;

    const job = await prisma.job.findUnique({
      where: { id: parseInt(jobId) },
    });
    if (!job || job.postedById !== userId) {
      return next(new ApiError(404, "Job not found or you don’t own it"));
    }

    await prisma.job.delete({
      where: { id: parseInt(jobId) },
    });

    return res.status(200).json(new ApiResponse(200, null, "Job deleted successfully"));
  } catch (error) {
    console.error("Error deleting job:", error);
    return next(new ApiError(500, "Failed to delete job", error.message));
  }
};

const getJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;

    const parsedJobId = parseInt(jobId);
    if (isNaN(parsedJobId) || parsedJobId <= 0) {
      return next(new ApiError(400, "Invalid job ID"));
    }

    const job = await prisma.job.findUnique({
      where: { id: parsedJobId },
      include: {
        postedBy: { select: { firstname: true, lastname: true, email: true } },
        freelancer: {
          select: {
            firstname: true,
            lastname: true,
            profilePicture: true,
            rating: true,
            freelancerProfile: {
              select: { jobTitle: true, skills: true, overview: true },
            },
          },
        },
      },
    });

    if (!job) {
      return next(new ApiError(404, "Job not found"));
    }

    if (req.user && req.user.role === "FREELANCER" && req.user.id !== job.postedById) {
      await prisma.job.update({
        where: { id: parsedJobId },
        data: { proposals: { increment: 1 } },
      });
    }

    return res.status(200).json(new ApiResponse(200, job, "Job retrieved successfully"));
  } catch (error) {
    console.error(`Error retrieving job with ID ${req.params.jobId}:`, error);
    return next(new ApiError(500, "Failed to retrieve job", error.message));
  }
};

const getClientJobs = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const postedById = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { postedById };

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          postedBy: { select: { firstname: true, lastname: true } },
          freelancer: {
            select: {
              firstname: true,
              lastname: true,
              profilePicture: true,
              rating: true,
              freelancerProfile: {
                select: { jobTitle: true, skills: true, overview: true },
              },
            },
          },
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
      }),
      prisma.job.count({ where }),
    ]);

    return res.status(200).json(
      new ApiResponse(200, {
        jobs,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      }, "Client jobs retrieved successfully")
    );
  } catch (error) {
    console.error("Error retrieving client jobs:", error);
    return next(new ApiError(500, "Failed to retrieve client jobs", error.message));
  }
};

const getAllJobs = async (req, res, next) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      isVerified: true,
    };
    if (category) {
      where.category = { has: category };
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { scope: { contains: search, mode: "insensitive" } },
      ];
    }

    const jobs = await prisma.job.findMany({

    })

    return res.status(200).json(
      new ApiResponse(200, {
        jobs,
      }, "All jobs retrieved successfully")
    );
  } catch (error) {
    console.error("Error retrieving all jobs:", error);
    return next(new ApiError(500, "Failed to retrieve all jobs", error.message));
  }
};

const checkApplicationStatus = async (req, res, next) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const userId = req.user.id;

    const application = await prisma.application.findFirst({
      where: {
        jobId,
        freelancerId: userId,
      },
    });

    return res.status(200).json(
      new ApiResponse(200, { hasApplied: !!application, status: application?.status || null }, "Application status retrieved")
    );
  } catch (error) {
    console.error("Error in checkApplicationStatus:", error);
    return next(new ApiError(500, "Failed to check application status"));
  }
};

const getCurrentJobs = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const freelancerId = req.user.id;

    const jobs = await prisma.job.findMany({
      where: {
        freelancerId,
        status: { in: ["ACCEPTED", "IN_PROGRESS"] },
      },
      include: {
        postedBy: { select: { firstname: true, lastname: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const formattedJobs = jobs.map((job) => {
      const deadline = job.deadline ? new Date(job.deadline) : null;
      const daysLeft = deadline
        ? Math.max(0, Math.ceil((deadline - new Date()) / (1000 * 60 * 60 * 24)))
        : 0;

      return {
        id: job.id,
        title: job.title,
        client: job.postedBy
          ? { firstname: job.postedBy.firstname || "", lastname: job.postedBy.lastname || "" }
          : { firstname: "Unknown", lastname: "" },
        deadline: deadline?.toISOString() || null,
        progress: job.progress || 0,
        daysLeft,
        totalPrice: job.budgetMax || 0,
      };
    });

    return res.status(200).json(new ApiResponse(200, formattedJobs, "Current jobs retrieved successfully"));
  } catch (error) {
    console.error(`Error retrieving current jobs for freelancer ${freelancerId}:`, error);
    return next(new ApiError(500, "Failed to retrieve current jobs", error.message));
  }
};

const getAppliedJobs = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const freelancerId = req.user.id;

    const applications = await prisma.application.findMany({
      where: { freelancerId },
      include: {
        job: {
          include: { postedBy: { select: { firstname: true, lastname: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formattedJobs = applications
      .filter((app) => app.job)
      .map((app) => {
        const job = app.job;
        const deadline = job.deadline ? new Date(job.deadline) : null;
        const daysLeft = deadline
          ? Math.max(0, Math.ceil((deadline - new Date()) / (1000 * 60 * 60 * 24)))
          : 0;

        return {
          id: job.id,
          title: job.title,
          client: job.postedBy
            ? { firstname: job.postedBy.firstname || "", lastname: job.postedBy.lastname || "" }
            : { firstname: "Unknown", lastname: "" },
          applicationDate: app.createdAt?.toISOString() || new Date().toISOString(),
          applicationStatus: app.status || "PENDING",
          deadline: deadline?.toISOString() || null,
          progress: job.progress || 0,
          daysLeft,
          totalPrice: job.budgetMax || 0,
        };
      });

    return res.status(200).json(new ApiResponse(200, formattedJobs, "Applied jobs retrieved successfully"));
  } catch (error) {
    console.error(`Error retrieving applied jobs for freelancer ${freelancerId}:`, error);
    return next(new ApiError(500, "Failed to retrieve applied jobs", error.message));
  }
};

const getCompletedJobs = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const freelancerId = req.user.id;

    const jobs = await prisma.job.findMany({
      where: {
        freelancerId,
        status: "COMPLETED",
      },
      include: {
        postedBy: { select: { firstname: true, lastname: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const formattedJobs = jobs.map((job) => {
      const deadline = job.deadline ? new Date(job.deadline) : null;
      const daysLeft = deadline
        ? Math.max(0, Math.ceil((deadline - new Date()) / (1000 * 60 * 60 * 24)))
        : 0;

      return {
        id: job.id,
        title: job.title,
        client: job.postedBy
          ? { firstname: job.postedBy.firstname || "", lastname: job.postedBy.lastname || "" }
          : { firstname: "Unknown", lastname: "" },
        completedAt: job.updatedAt?.toISOString() || new Date().toISOString(),
        deadline: deadline?.toISOString() || null,
        progress: job.progress || 100,
        daysLeft,
        totalPrice: job.budgetMax || 0,
      };
    });

    return res.status(200).json(new ApiResponse(200, formattedJobs, "Completed jobs retrieved successfully"));
  } catch (error) {
    console.error(`Error retrieving completed jobs for freelancer ${freelancerId}:`, error);
    return next(new ApiError(500, "Failed to retrieve completed jobs", error.message));
  }
};

// New Functions for Client (Shortlist Component)
const getJobApplications = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const clientId = req.user.id;
    const { jobId } = req.params;

    const job = await prisma.job.findUnique({
      where: { id: parseInt(jobId) },
      select: { postedById: true },
    });

    if (!job || job.postedById !== clientId) {
      return next(new ApiError(403, "You are not authorized to view applications for this job"));
    }

    const applications = await prisma.application.findMany({
      where: { jobId: parseInt(jobId) },
      include: {
        freelancer: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            profilePicture: true,
            rating: true,
            freelancerProfile: {
              select: {
                jobTitle: true,
                skills: true,
                overview: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json(new ApiResponse(200, applications, "Applications retrieved successfully"));
  } catch (error) {
    console.error(`Error fetching applications for job ${req.params.jobId}:`, error);
    return next(new ApiError(500, "Failed to retrieve applications", error.message));
  }
};

const acceptApplication = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const clientId = req.user.id;
    const { jobId } = req.params;
    const { freelancerId } = req.body;

    const job = await prisma.job.findUnique({
      where: { id: parseInt(jobId) },
      select: { postedById: true, status: true },
    });

    if (!job || job.postedById !== clientId) {
      return next(new ApiError(403, "Unauthorized"));
    }

    if (job.status !== "OPEN") {
      return next(new ApiError(400, "Job is not open for applications"));
    }

    await prisma.$transaction([
      prisma.application.update({
        where: { jobId_freelancerId: { jobId: parseInt(jobId), freelancerId } },
        data: { status: "ACCEPTED" },
      }),
      prisma.job.update({
        where: { id: parseInt(jobId) },
        data: { status: "ACCEPTED", freelancerId },
      }),
    ]);

    return res.status(200).json(new ApiResponse(200, null, "Application accepted successfully"));
  } catch (error) {
    console.error(`Error accepting application for job ${req.params.jobId}:`, error);
    return next(new ApiError(500, "Failed to accept application", error.message));
  }
};

const rejectApplication = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const clientId = req.user.id;
    const { jobId } = req.params;
    const { freelancerId } = req.body;

    const job = await prisma.job.findUnique({
      where: { id: parseInt(jobId) },
      select: { postedById: true },
    });

    if (!job || job.postedById !== clientId) {
      return next(new ApiError(403, "Unauthorized"));
    }

    await prisma.application.update({
      where: { jobId_freelancerId: { jobId: parseInt(jobId), freelancerId } },
      data: { status: "REJECTED" },
    });

    return res.status(200).json(new ApiResponse(200, null, "Application rejected successfully"));
  } catch (error) {
    console.error(`Error rejecting application for job ${req.params.jobId}:`, error);
    return next(new ApiError(500, "Failed to reject application", error.message));
  }
};

// New Functions for Admin
const getAllJobsAdmin = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const { category, search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (category) {
      where.category = { has: category };
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { scope: { contains: search, mode: "insensitive" } },
      ];
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          postedBy: { select: { firstname: true, lastname: true, email: true } },
          freelancer: {
            select: {
              firstname: true,
              lastname: true,
              profilePicture: true,
              rating: true,
              freelancerProfile: {
                select: { jobTitle: true, skills: true, overview: true },
              },
            },
          },
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
      }),
      prisma.job.count({ where }),
    ]);

    return res.status(200).json(
      new ApiResponse(200, {
        jobs,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      }, "All jobs retrieved successfully")
    );
  } catch (error) {
    console.error("Error retrieving all jobs for admin:", error);
    return next(new ApiError(500, "Failed to retrieve all jobs", error.message));
  }
};

const verifyJob = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const { jobId } = req.params;

    const job = await prisma.job.findUnique({
      where: { id: parseInt(jobId) },
    });

    if (!job) {
      return next(new ApiError(404, "Job not found"));
    }

    const updatedJob = await prisma.job.update({
      where: { id: parseInt(jobId) },
      data: { isVerified: true },
      include: { postedBy: { select: { firstname: true, lastname: true } } },
    });

    return res.status(200).json(new ApiResponse(200, updatedJob, "Job verified successfully"));
  } catch (error) {
    console.error(`Error verifying job ${req.params.jobId}:`, error);
    return next(new ApiError(500, "Failed to verify job", error.message));
  }
};

const unverifyJob = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const { jobId } = req.params;

    const job = await prisma.job.findUnique({
      where: { id: parseInt(jobId) },
    });

    if (!job) {
      return next(new ApiError(404, "Job not found"));
    }

    const updatedJob = await prisma.job.update({
      where: { id: parseInt(jobId) },
      data: { isVerified: false },
      include: { postedBy: { select: { firstname: true, lastname: true } } },
    });

    return res.status(200).json(new ApiResponse(200, updatedJob, "Job unverified successfully"));
  } catch (error) {
    console.error(`Error unverifying job ${req.params.jobId}:`, error);
    return next(new ApiError(500, "Failed to unverify job", error.message));
  }
};

const deleteJobAdmin = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const { jobId } = req.params;

    const job = await prisma.job.findUnique({
      where: { id: parseInt(jobId) },
    });

    if (!job) {
      return next(new ApiError(404, "Job not found"));
    }

    await prisma.job.delete({
      where: { id: parseInt(jobId) },
    });

    return res.status(200).json(new ApiResponse(200, null, "Job deleted successfully"));
  } catch (error) {
    console.error(`Error deleting job ${req.params.jobId}:`, error);
    return next(new ApiError(500, "Failed to delete job", error.message));
  }
};

const getAllApplicationsAdmin = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        include: {
          job: {
            select: { title: true, postedById: true },
          },
          freelancer: {
            select: {
              firstname: true,
              lastname: true,
              profilePicture: true,
              rating: true,
              freelancerProfile: {
                select: { jobTitle: true, skills: true, overview: true },
              },
            },
          },
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
      }),
      prisma.application.count(),
    ]);

    return res.status(200).json(
      new ApiResponse(200, {
        applications,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      }, "All applications retrieved successfully")
    );
  } catch (error) {
    console.error("Error retrieving all applications for admin:", error);
    return next(new ApiError(500, "Failed to retrieve applications", error.message));
  }
};

export {
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
};
