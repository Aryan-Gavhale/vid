// src/controllers/profileController.js
import { ApiError } from "../Utils/ApiError.js";
import { ApiResponse } from "../Utils/ApiResponse.js";
import prisma from "../prismaClient.js";

const createFreelancerProfile = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;

    const {
      city, state, pinCode, jobTitle, overview, skills, tools,
      equipmentCameras, equipmentLenses, equipmentLighting, equipmentOther, certifications,
      minimumRate, maximumRate, availabilityStatus, weeklyHours,
    } = req.body;

    if (!jobTitle || !overview || !skills || skills.length === 0) {
      return next(new ApiError(400, "Missing required fields: jobTitle, overview, and skills are mandatory"));
    }

    if ((minimumRate !== undefined && maximumRate !== undefined) && (parseFloat(minimumRate) < 0 || parseFloat(maximumRate) < parseFloat(minimumRate))) {
      return next(new ApiError(400, "Invalid rate values. Ensure minimumRate is positive and less than maximumRate"));
    }

    const existingProfile = await prisma.freelancerProfile.findUnique({
      where: { userId },
    });
    if (existingProfile) {
      return next(new ApiError(400, "A freelancer profile already exists for this user"));
    }

    const freelancerProfile = await prisma.freelancerProfile.create({
      data: {
        userId,
        city,
        state,
        pinCode,
        jobTitle,
        overview,
        skills: Array.isArray(skills) ? skills : [skills],
        tools: Array.isArray(tools) ? tools : tools ? [tools] : [],
        equipmentCameras,
        equipmentLenses,
        equipmentLighting,
        equipmentOther,
        certifications,
        minimumRate: minimumRate ? parseFloat(minimumRate) : null,
        maximumRate: maximumRate ? parseFloat(maximumRate) : null,
        availabilityStatus: availabilityStatus || "UNAVAILABLE",
        weeklyHours: weeklyHours ? parseInt(weeklyHours) : null,
      },
      include: { user: { select: { firstname: true, lastname: true } } },
    });

    return res.status(201).json(new ApiResponse(201, freelancerProfile, "Freelancer profile created successfully"));
  } catch (error) {
    console.error("Error creating freelancer profile:", error);
    return next(new ApiError(500, "Failed to create freelancer profile", error.message));
  }
};

const updateFreelancerProfile = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;

    const {
      city, state, pinCode, jobTitle, overview, skills, tools,
      equipmentCameras, equipmentLenses, equipmentLighting, equipmentOther, certifications,
      minimumRate, maximumRate, availabilityStatus, weeklyHours,
    } = req.body;

    const existingProfile = await prisma.freelancerProfile.findUnique({
      where: { userId },
    });
    if (!existingProfile) {
      return next(new ApiError(404, "Freelancer profile not found for this user"));
    }

    if ((minimumRate !== undefined && maximumRate !== undefined) && (parseFloat(minimumRate) < 0 || parseFloat(maximumRate) < parseFloat(minimumRate))) {
      return next(new ApiError(400, "Invalid rate values. Ensure minimumRate is positive and less than maximumRate"));
    }

    const updateData = {};
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    if (pinCode !== undefined) updateData.pinCode = pinCode;
    if (jobTitle !== undefined) updateData.jobTitle = jobTitle;
    if (overview !== undefined) updateData.overview = overview;
    if (skills !== undefined) updateData.skills = Array.isArray(skills) ? skills : [skills];
    if (tools !== undefined) updateData.tools = Array.isArray(tools) ? tools : tools ? [tools] : [];
    if (equipmentCameras !== undefined) updateData.equipmentCameras = equipmentCameras;
    if (equipmentLenses !== undefined) updateData.equipmentLenses = equipmentLenses;
    if (equipmentLighting !== undefined) updateData.equipmentLighting = equipmentLighting;
    if (equipmentOther !== undefined) updateData.equipmentOther = equipmentOther;
    if (certifications !== undefined) updateData.certifications = certifications;
    if (minimumRate !== undefined) updateData.minimumRate = parseFloat(minimumRate);
    if (maximumRate !== undefined) updateData.maximumRate = parseFloat(maximumRate);
    if (availabilityStatus) updateData.availabilityStatus = availabilityStatus;
    if (weeklyHours !== undefined) updateData.weeklyHours = parseInt(weeklyHours);

    if (Object.keys(updateData).length === 0) {
      return next(new ApiError(400, "No valid fields provided for update"));
    }

    const updatedProfile = await prisma.freelancerProfile.update({
      where: { userId },
      data: updateData,
      include: { user: { select: { firstname: true, lastname: true } } },
    });

    return res.status(200).json(new ApiResponse(200, updatedProfile, "Freelancer profile updated successfully"));
  } catch (error) {
    console.error("Error updating freelancer profile:", error);
    return next(new ApiError(500, "Failed to update freelancer profile", error.message));
  }
};

const getFreelancerProfile = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;

    const freelancerProfile = await prisma.freelancerProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { firstname: true, lastname: true, email: true, country: true } },
        portfolioVideos: true,
        gigs: { select: { id: true, title: true, status: true } },
        reviewsReceived: { take: 5, orderBy: { createdAt: "desc" } }, // Limit for performance
      },
    });

    if (!freelancerProfile) {
      return next(new ApiError(404, "Freelancer profile not found for this user"));
    }

    return res.status(200).json(new ApiResponse(200, freelancerProfile, "Freelancer profile retrieved successfully"));
  } catch (error) {
    console.error("Error retrieving freelancer profile:", error);
    return next(new ApiError(500, "Failed to retrieve freelancer profile", error.message));
  }
};

const deleteFreelancerProfile = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;

    const freelancerProfile = await prisma.freelancerProfile.findUnique({
      where: { userId },
    });

    if (!freelancerProfile) {
      return next(new ApiError(404, "Freelancer profile not found for this user"));
    }

    await prisma.freelancerProfile.delete({
      where: { userId },
    });

    return res.status(200).json(new ApiResponse(200, null, "Freelancer profile deleted successfully"));
  } catch (error) {
    console.error("Error deleting freelancer profile:", error);
    return next(new ApiError(500, "Failed to delete freelancer profile", error.message));
  }
};

const addPortfolioVideo = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;

    const { videoUrl, title, description } = req.body;

    if (!videoUrl) {
      return next(new ApiError(400, "Video URL is required"));
    }

    const freelancerProfile = await prisma.freelancerProfile.findUnique({
      where: { userId },
    });
    if (!freelancerProfile) {
      return next(new ApiError(404, "Freelancer profile not found for this user"));
    }

    const portfolioVideo = await prisma.portfolioVideo.create({
      data: {
        freelancerId: freelancerProfile.id,
        videoUrl: req.fileUrl || videoUrl, // Use uploaded URL if available
        title,
        description,
      },
    });

    return res.status(201).json(new ApiResponse(201, portfolioVideo, "Portfolio video added successfully"));
  } catch (error) {
    console.error("Error adding portfolio video:", error);
    return next(new ApiError(500, "Failed to add portfolio video", error.message));
  }
};

const updatePortfolioVideo = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;
    const { videoId } = req.params;
    const { videoUrl, title, description } = req.body;

    const freelancerProfile = await prisma.freelancerProfile.findUnique({
      where: { userId },
    });
    if (!freelancerProfile) {
      return next(new ApiError(404, "Freelancer profile not found for this user"));
    }

    const portfolioVideo = await prisma.portfolioVideo.findUnique({
      where: { id: parseInt(videoId) },
    });
    if (!portfolioVideo || portfolioVideo.freelancerId !== freelancerProfile.id) {
      return next(new ApiError(404, "Portfolio video not found or you don't own it"));
    }

    const updateData = {};
    if (videoUrl !== undefined) updateData.videoUrl = req.fileUrl || videoUrl; // Use uploaded URL if available
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;

    if (Object.keys(updateData).length === 0) {
      return next(new ApiError(400, "No valid fields provided for update"));
    }

    const updatedVideo = await prisma.portfolioVideo.update({
      where: { id: parseInt(videoId) },
      data: updateData,
    });

    return res.status(200).json(new ApiResponse(200, updatedVideo, "Portfolio video updated successfully"));
  } catch (error) {
    console.error("Error updating portfolio video:", error);
    return next(new ApiError(500, "Failed to update portfolio video", error.message));
  }
};

const deletePortfolioVideo = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;
    const { videoId } = req.params;

    const freelancerProfile = await prisma.freelancerProfile.findUnique({
      where: { userId },
    });
    if (!freelancerProfile) {
      return next(new ApiError(404, "Freelancer profile not found for this user"));
    }

    const portfolioVideo = await prisma.portfolioVideo.findUnique({
      where: { id: parseInt(videoId) },
    });
    if (!portfolioVideo || portfolioVideo.freelancerId !== freelancerProfile.id) {
      return next(new ApiError(404, "Portfolio video not found or you don't own it"));
    }

    await prisma.portfolioVideo.delete({
      where: { id: parseInt(videoId) },
    });

    return res.status(200).json(new ApiResponse(200, null, "Portfolio video deleted successfully"));
  } catch (error) {
    console.error("Error deleting portfolio video:", error);
    return next(new ApiError(500, "Failed to delete portfolio video", error.message));
  }
};

const getPublicFreelancerProfile = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const parsedUserId = parseInt(userId);

    // First check if user exists and is active
    const user = await prisma.user.findUnique({
      where: { id: parsedUserId },
      select: { isActive: true, role: true }
    });

    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    if (!user.isActive) {
      return next(new ApiError(404, "User account is deactivated"));
    }

    if (user.role !== "FREELANCER") {
      return next(new ApiError(404, "User is not a freelancer"));
    }

    const freelancerProfile = await prisma.freelancerProfile.findUnique({
      where: { userId: parsedUserId },
      include: {
        user: { 
          select: { 
            firstname: true, 
            lastname: true, 
            country: true, 
            profilePicture: true, 
            createdAt: true,
            bio: true,
            isVerified: true
          } 
        },
        portfolioVideos: { orderBy: { uploadedAt: "desc" } },
        gigs: { 
          where: { status: "ACTIVE" }, 
          select: { 
            id: true, 
            title: true, 
            pricing: true, 
            deliveryTime: true,
            description: true,
            category: true,
            thumbnailUrl: true
          } 
        },
        reviewsReceived: { 
          take: 5, 
          orderBy: { createdAt: "desc" }, 
          include: { 
            client: { select: { firstname: true, lastname: true } } 
          } 
        },
      },
    });

    if (!freelancerProfile) {
      return next(new ApiError(404, "Freelancer profile not found"));
    }

    // Add the moved fields to the response
    const response = {
      ...freelancerProfile,
      user: {
        ...freelancerProfile.user,
      }
    };

    return res.status(200).json(new ApiResponse(200, response, "Public freelancer profile retrieved successfully"));
  } catch (error) {
    console.error("Error retrieving public freelancer profile:", error);
    return next(new ApiError(500, "Failed to retrieve public freelancer profile", error.message));
  }
};

export {
  createFreelancerProfile,
  updateFreelancerProfile,
  getFreelancerProfile,
  deleteFreelancerProfile,
  addPortfolioVideo,
  updatePortfolioVideo,
  deletePortfolioVideo,
  getPublicFreelancerProfile,
};