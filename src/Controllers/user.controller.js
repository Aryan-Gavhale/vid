import { ApiError } from "../Utils/ApiError.js";
import { ApiResponse } from "../Utils/ApiResponse.js";
import prisma from "../prismaClient.js";
import { hashPassword, comparePasswords } from "../Services/authService.js";
import jwt from "jsonwebtoken";
import { isFreelancerProfileComplete } from "../Utils/profileUtils.js";

const generateJwt = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET || "your_jwt_secret",
    { expiresIn: "7d" }
  );
};

// Register a new user
const registerUser = async (req, res, next) => {
  try {
    const { firstname, lastname, email, password, country, role, company, companyEmail } = req.body;

    console.log("Received registration data:", req.body);

    if (!firstname || !lastname || !email || !password || !country || !role) {
      console.log("Missing fields:", { firstname, lastname, email, password, country, role });
      return next(new ApiError(400, "All fields (firstname, lastname, email, password, country, role) are required"));
    }

    const validRoles = ["FREELANCER", "CLIENT", "ADMIN"];
    if (!validRoles.includes(role)) {
      return next(new ApiError(400, `Invalid role. Must be one of: ${validRoles.join(", ")}`));
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return next(new ApiError(400, "A user with this email already exists"));
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return next(new ApiError(400, "Invalid email format"));
    }
    if (companyEmail && !emailRegex.test(companyEmail)) {
      return next(new ApiError(400, "Invalid company email format"));
    }

    const hashedPassword = await hashPassword(password);
    let newUser;

    if (role === "FREELANCER") {
      newUser = await prisma.user.create({
        data: {
          firstname,
          lastname,
          email,
          password: hashedPassword,
          country,
          role,
          company: company || null,
          companyEmail: companyEmail || null,
          isProfileComplete: false,
          freelancerProfile: {
            create: {
              totalJobs: 0,
              totalHours: 0,
              successRate: 0,
              rating: 0,
              totalEarnings: 0,
              skills: [],
              languages: [],
              tools: [],
              certifications: [],
              availabilityStatus: "UNAVAILABLE",
              experienceLevel: "ENTRY"
            },
          },
        },
        include: { freelancerProfile: true },
      });
    } else {
      newUser = await prisma.user.create({
        data: {
          firstname,
          lastname,
          email,
          password: hashedPassword,
          country,
          role,
          company: company || null,
          companyEmail: companyEmail || null,
          isProfileComplete: true,
        },
      });
    }

    const token = generateJwt(newUser);
    const userResponse = {
      id: newUser.id,
      firstname: newUser.firstname,
      lastname: newUser.lastname,
      email: newUser.email,
      country: newUser.country,
      role: newUser.role,
      company: newUser.company,
      companyEmail: newUser.companyEmail,
      isProfileComplete: newUser.isProfileComplete,
      freelancerProfile: newUser.freelancerProfile || null,
    };

    return res.status(201).json(new ApiResponse(201, { user: userResponse, token }, "User registered successfully"));
  } catch (error) {
    console.error("Error registering user:", error.message, error.stack);
    return next(new ApiError(500, "Failed to register user", error.message));
  }
};

// Login an existing user
const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new ApiError(400, "Email and password are required"));
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { freelancerProfile: true },
    });
    if (!user || !user.isActive) {
      return next(new ApiError(404, "User not found or account is deactivated"));
    }

    const isPasswordValid = await comparePasswords(password, user.password);
    if (!isPasswordValid) {
      return next(new ApiError(401, "Invalid credentials"));
    }

    const token = generateJwt(user);
    const userResponse = {
      id: user.id,
      firstname: user.firstname,
      lastname: user.lastname,
      email: user.email,
      country: user.country,
      role: user.role,
      company: user.company,
      companyEmail: user.companyEmail,
      isProfileComplete: user.isProfileComplete,
      freelancerProfile: user.freelancerProfile || null,
    };

    return res.status(200).json(new ApiResponse(200, { user: userResponse, token }, "Login successful"));
  } catch (error) {
    console.error("Error logging in user:", error);
    return next(new ApiError(500, "Failed to login user", error.message));
  }
};

// Fetch user profile (own or public)
const getUserProfile = async (req, res, next) => {
  try {
    const userId = req.params.userId || req.user?.id;
    if (!userId) {
      console.log("getUserProfile: No user ID from token or params");
      return next(new ApiError(401, "Unauthorized: No user ID provided"));
    }

    const parsedUserId = parseInt(userId); // Convert to integer
    const user = await prisma.user.findUnique({
      where: { id: parsedUserId },
      select: {
        id: true,
        appliedJobsId: true,
        firstname: true,
        lastname: true,
        email: true,
        country: true,
        username: true,
        role: true,
        profilePicture: true,
        bio: true,
        isActive: true,
        isProfileComplete: true,
        createdAt: true,
        company: true,
        companyEmail: true,
        lastNameChange: true,
        isVerified: true,
        totalJobs: true,
        totalHours: true,
        successRate: true,
        rating: true,
        freelancerProfile: {
          select: {
            id: true,
            city: true,
            state: true,
            pinCode: true,
            jobTitle: true,
            overview: true,
            skills: true,
            languages: true,
            socialLinks: true,
            tools: true,
            equipmentCameras: true,
            equipmentLenses: true,
            equipmentLighting: true,
            equipmentOther: true,
            certifications: true,
            minimumRate: true,
            maximumRate: true,
            hourlyRate: true,
            weeklyHours: true,
            availabilityStatus: true,
            experienceLevel: true,
            portfolioVideos: true,
            services: true,
            gigs: true,
            userBadges: { include: { badge: true } },
          },
        },
      },
    });

    console.log("getUserProfile: Queried user:", user);

    if (!user || !user.isActive) {
      return next(new ApiError(404, "User not found or account is deactivated"));
    }

    const userResponse = {
      id: user.id,
      firstname: user.firstname,
      lastname: user.lastname,
      email: user.email,
      country: user.country,
      role: user.role,
      company: user.company,
      companyEmail: user.companyEmail,
      isProfileComplete: user.isProfileComplete,
      username: user.username,
      profilePicture: user.profilePicture,
      bio: user.bio,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastNameChange: user.lastNameChange,
      isVerified: user.isVerified,
      totalJobs: user.totalJobs || 0,
      totalHours: user.totalHours || 0,
      successRate: user.successRate || 0,
      rating: user.rating || 0,
      freelancerProfile: user.freelancerProfile
        ? {
            ...user.freelancerProfile,
            portfolio: user.freelancerProfile.portfolioVideos,
            gigs: user.freelancerProfile.gigs,
          }
        : null,
    };

    return res.status(200).json(new ApiResponse(200, userResponse, "User profile fetched successfully"));
  } catch (error) {
    console.error("Error fetching user profile:", error.message, error.stack);
    return next(new ApiError(500, "Failed to fetch user profile", error.message));
  }
};

// Update user profile
const updateUser = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;
    const {
      firstname,
      lastname,
      email,
      country,
      password,
      username,
      bio,
      company,
      companyEmail,
      city,
      pinCode,
      state,
      jobTitle,
      overview,
      skills,
      isVerified,
      portfolioVideos,
      services,
      gigs,
      userBadges,
      languages,
      socialLinks,
      tools,
      equipmentCameras,
      equipmentLenses,
      equipmentLighting,
      equipmentOther,
      certifications,
      minimumRate,
      maximumRate,
      hourlyRate,
      weeklyHours,
      availabilityStatus,
      experienceLevel,
    } = req.body;
    const profilePicture = req.fileUrl || req.body.profilePicture;

    console.log("Update payload:", req.body, "File URL:", profilePicture);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { freelancerProfile: true },
    });
    if (!user || !user.isActive) {
      return next(new ApiError(404, "User not found or account is deactivated"));
    }

    // Name change restriction
    if ((firstname || lastname) && user.lastNameChange) {
      const lastChange = new Date(user.lastNameChange);
      const now = new Date();
      if ((now - lastChange) / (1000 * 60 * 60 * 24 * 30) < 3) {
        return next(new ApiError(400, "Name can only be changed every 3 months"));
      }
    }

    const userUpdateData = {};
    if (firstname) userUpdateData.firstname = firstname;
    if (lastname) userUpdateData.lastname = lastname;
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return next(new ApiError(400, "Invalid email format"));
      }
      if (email !== user.email && (await prisma.user.findUnique({ where: { email } }))) {
        return next(new ApiError(400, "Email is already in use"));
      }
      userUpdateData.email = email;
    }
    if (country) userUpdateData.country = country;
    if (password) userUpdateData.password = await hashPassword(password);
    if (username) {
      if (username !== user.username && (await prisma.user.findUnique({ where: { username } }))) {
        return next(new ApiError(400, "Username is already in use"));
      }
      userUpdateData.username = username;
    }
    if (bio !== undefined) userUpdateData.bio = bio;
    if (company !== undefined) userUpdateData.company = company;
    if (companyEmail !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (companyEmail && !emailRegex.test(companyEmail)) {
        return next(new ApiError(400, "Invalid company email format"));
      }
      if (
        companyEmail &&
        companyEmail !== user.companyEmail &&
        (await prisma.user.findFirst({ where: { companyEmail } }))
      ) {
        return next(new ApiError(400, "Company email is already in use"));
      }
      userUpdateData.companyEmail = companyEmail;
    }
    if (profilePicture !== undefined) userUpdateData.profilePicture = profilePicture;
    if (isVerified !== undefined) userUpdateData.isVerified = isVerified;
    if (firstname || lastname) userUpdateData.lastNameChange = new Date();

    let freelancerProfileUpdateData = {};
    if (user.role === "FREELANCER") {
      freelancerProfileUpdateData = {
        city: city !== undefined ? city : user.freelancerProfile?.city,
        pinCode: pinCode !== undefined ? pinCode : user.freelancerProfile?.pinCode,
        state: state !== undefined ? state : user.freelancerProfile?.state,
        jobTitle: jobTitle !== undefined ? jobTitle : user.freelancerProfile?.jobTitle,
        overview: overview !== undefined ? overview : user.freelancerProfile?.overview,
        skills: skills !== undefined ? skills : user.freelancerProfile?.skills,
        languages: languages !== undefined ? languages : user.freelancerProfile?.languages,
        socialLinks: socialLinks !== undefined ? socialLinks : user.freelancerProfile?.socialLinks,
        tools: tools !== undefined ? tools : user.freelancerProfile?.tools,
        equipmentCameras: equipmentCameras !== undefined ? equipmentCameras : user.freelancerProfile?.equipmentCameras,
        equipmentLenses: equipmentLenses !== undefined ? equipmentLenses : user.freelancerProfile?.equipmentLenses,
        equipmentLighting: equipmentLighting !== undefined ? equipmentLighting : user.freelancerProfile?.equipmentLighting,
        equipmentOther: equipmentOther !== undefined ? equipmentOther : user.freelancerProfile?.equipmentOther,
        certifications: certifications !== undefined ? certifications : user.freelancerProfile?.certifications,
        minimumRate: minimumRate !== undefined ? parseFloat(minimumRate) : user.freelancerProfile?.minimumRate,
        maximumRate: maximumRate !== undefined ? parseFloat(maximumRate) : user.freelancerProfile?.maximumRate,
        hourlyRate: hourlyRate !== undefined ? parseFloat(hourlyRate) : user.freelancerProfile?.hourlyRate,
        weeklyHours: weeklyHours !== undefined ? parseInt(weeklyHours) : user.freelancerProfile?.weeklyHours,
        availabilityStatus: availabilityStatus !== undefined ? availabilityStatus : user.freelancerProfile?.availabilityStatus,
        experienceLevel: experienceLevel !== undefined ? experienceLevel : user.freelancerProfile?.experienceLevel,
        portfolioVideos: portfolioVideos !== undefined ? portfolioVideos : user.freelancerProfile?.portfolioVideos,
        services: services !== undefined ? services : user.freelancerProfile?.services,
        gigs: gigs !== undefined ? gigs : user.freelancerProfile?.gigs,
        userBadges: userBadges && {
          upsert: userBadges.map((b) => ({
            where: { id: b.id || "" },
            update: { isVisible: b.isVisible },
            create: { badgeId: b.badgeId, isVisible: b.isVisible },
          })),
        },
      };
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...userUpdateData,
        freelancerProfile: user.role === "FREELANCER" && Object.keys(freelancerProfileUpdateData).length > 0
          ? {
              upsert: {
                update: freelancerProfileUpdateData,
                create: freelancerProfileUpdateData,
              },
            }
          : undefined,
      },
      include: { freelancerProfile: true },
    });

    if (user.role === "FREELANCER") {
      const isComplete = !!isFreelancerProfileComplete(updatedUser.freelancerProfile);
      if (isComplete !== updatedUser.isProfileComplete) {
        await prisma.user.update({
          where: { id: userId },
          data: { isProfileComplete: isComplete },
        });
        updatedUser.isProfileComplete = isComplete;
      }
    }

    if (Object.keys(userUpdateData).length === 0 && Object.keys(freelancerProfileUpdateData).length === 0) {
      return next(new ApiError(400, "No valid fields provided for update"));
    }

    const userResponse = {
      id: updatedUser.id,
      firstname: updatedUser.firstname,
      lastname: updatedUser.lastname,
      email: updatedUser.email,
      country: updatedUser.country,
      username: updatedUser.username,
      role: updatedUser.role,
      profilePicture: updatedUser.profilePicture,
      bio: updatedUser.bio,
      isActive: updatedUser.isActive,
      isProfileComplete: updatedUser.isProfileComplete,
      createdAt: updatedUser.createdAt,
      company: updatedUser.company,
      companyEmail: updatedUser.companyEmail,
      freelancerProfile: updatedUser.freelancerProfile,
    };

    return res.status(200).json(new ApiResponse(200, userResponse, "User updated successfully"));
  } catch (error) {
    console.error("Error updating user:", error);
    return next(new ApiError(500, "Failed to update user", error.message));
  }
};

// Delete specific item (portfolio, services, gigs)
const deleteItem = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;
    const { type, id } = req.params;

    const validTypes = ["portfolio", "services", "gigs"];
    if (!validTypes.includes(type)) {
      return next(new ApiError(400, "Invalid type. Must be portfolio, services, or gigs"));
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { freelancerProfile: { include: { portfolioVideos: true, gigs: true } } },
    });
    if (!user || !user.isActive) {
      return next(new ApiError(404, "User not found or account is deactivated"));
    }

    if (!user.freelancerProfile) {
      return next(new ApiError(404, "Freelancer profile not found"));
    }

    if (type === "portfolio") {
      await prisma.portfolioVideo.delete({
        where: { id: parseInt(id), freelancerId: user.freelancerProfile.id },
      });
    } else if (type === "services") {
      const currentServices = user.freelancerProfile.services || [];
      const updatedServices = currentServices.filter((item) => item.id !== id);
      await prisma.freelancerProfile.update({
        where: { id: user.freelancerProfile.id },
        data: { services: updatedServices },
      });
    } else if (type === "gigs") {
      await prisma.gig.delete({
        where: { id: parseInt(id), freelancerId: user.freelancerProfile.id },
      });
    }

    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { freelancerProfile: { include: { portfolioVideos: true, gigs: true } } },
    });

    const userResponse = {
      id: updatedUser.id,
      firstname: updatedUser.firstname,
      lastname: updatedUser.lastname,
      email: updatedUser.email,
      country: updatedUser.country,
      username: updatedUser.username,
      role: updatedUser.role,
      profilePicture: updatedUser.profilePicture,
      bio: updatedUser.bio,
      isActive: updatedUser.isActive,
      isProfileComplete: updatedUser.isProfileComplete,
      createdAt: updatedUser.createdAt,
      company: updatedUser.company,
      companyEmail: updatedUser.companyEmail,
      freelancerProfile: updatedUser.freelancerProfile
        ? {
            ...updatedUser.freelancerProfile,
            portfolio: updatedUser.freelancerProfile.portfolioVideos,
            gigs: updatedUser.freelancerProfile.gigs,
          }
        : null,
    };

    return res.status(200).json(new ApiResponse(200, userResponse, `${type} item deleted successfully`));
  } catch (error) {
    console.error("Error deleting item:", error);
    return next(new ApiError(500, "Failed to delete item", error.message));
  }
};

// Deactivate user account
const deleteUser = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      return next(new ApiError(404, "User not found or already deactivated"));
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    console.log(`User ${userId} deactivated at ${new Date().toISOString()}`);
    return res.status(200).json(new ApiResponse(200, null, "User account deactivated successfully"));
  } catch (error) {
    console.error("Error deleting user:", error);
    return next(new ApiError(500, "Failed to delete user", error.message));
  }
};

// Fetch all available badges
const getAllBadges = async (req, res, next) => {
  try {
    const badges = await prisma.badge.findMany({
      select: { id: true, name: true, icon: true, color: true, description: true },
    });
    return res.status(200).json(new ApiResponse(200, badges, "Badges fetched successfully"));
  } catch (error) {
    console.error("Error fetching badges:", error);
    return next(new ApiError(500, "Failed to fetch badges", error.message));
  }
};

const getAllFreelancers = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }

    const { page = 1, limit = 10, search, skills, location, experienceLevel } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause for filtering
    const where = {
      role: "FREELANCER",
      AND: [],
    };

    if (search) {
      where.AND.push({
        OR: [
          { firstname: { contains: search, mode: "insensitive" } },
          { lastname: { contains: search, mode: "insensitive" } },
          { bio: { contains: search, mode: "insensitive" } },
          { freelancerProfile: { jobTitle: { contains: search, mode: "insensitive" } } },
        ],
      });
    }

    if (skills) {
      const skillArray = skills.split(",").map((s) => s.trim());
      where.AND.push({
        freelancerProfile: { skills: { hasSome: skillArray } },
      });
    }

    if (location) {
      where.AND.push({
        OR: [
          { country: { contains: location, mode: "insensitive" } },
          { freelancerProfile: { city: { contains: location, mode: "insensitive" } } },
        ],
      });
    }

    if (experienceLevel) {
      where.AND.push({
        freelancerProfile: { experienceLevel: experienceLevel.toUpperCase() },
      });
    }

    // Fetch freelancers with related data
    const [freelancers, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          firstname: true,
          lastname: true,
          username: true,
          bio: true,
          country: true,
          profilePicture: true,
          createdAt: true,
          updatedAt: true,
          freelancerProfile: {
            select: {
              city: true,
              jobTitle: true,
              overview: true,
              skills: true,
              languages: true,
              tools: true,
              certifications: true,
              minimumRate: true,
              maximumRate: true,
              hourlyRate: true,
              weeklyHours: true,
              availabilityStatus: true,
              experienceLevel: true,
              socialLinks: true,
              equipmentCameras: true,
              equipmentLenses: true,
              equipmentLighting: true,
              equipmentOther: true,
              totalEarnings: true,
              rating: true,
              totalJobs: true,
              totalHours: true,
              successRate: true,
              software: {
                select: { id: true, name: true, icon: true, level: true },
              },
              portfolioVideos: {
                select: { 
                  id: true, 
                  title: true, 
                  videoUrl: true, 
                  description: true,
                  category: true,
                  uploadedAt: true
                },
              },
              gigs: {
                select: { 
                  id: true, 
                  title: true, 
                  description: true, 
                  pricing: true,
                  deliveryTime: true,
                  thumbnailUrl: true,
                  category: true,
                  status: true
                },
              },
            },
          },
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ]);

    // Format response, handle missing fields
    const formattedFreelancers = freelancers.map((freelancer) => ({
      id: freelancer.id,
      name: `${freelancer.firstname || ""} ${freelancer.lastname || ""}`.trim() || "Unnamed Freelancer",
      username: freelancer.username || null,
      bio: freelancer.bio || "",
      country: freelancer.country || "",
      city: freelancer.freelancerProfile?.city || "",
      profilePicture: freelancer.profilePicture || "",
      jobTitle: freelancer.freelancerProfile?.jobTitle || "",
      overview: freelancer.freelancerProfile?.overview || "",
      skills: freelancer.freelancerProfile?.skills || [],
      languages: freelancer.freelancerProfile?.languages || [],
      tools: freelancer.freelancerProfile?.tools || [],
      certifications: freelancer.freelancerProfile?.certifications || [],
      minimumRate: freelancer.freelancerProfile?.minimumRate || null,
      maximumRate: freelancer.freelancerProfile?.maximumRate || null,
      hourlyRate: freelancer.freelancerProfile?.hourlyRate || null,
      weeklyHours: freelancer.freelancerProfile?.weeklyHours || null,
      availabilityStatus: freelancer.freelancerProfile?.availabilityStatus || "UNAVAILABLE",
      experienceLevel: freelancer.freelancerProfile?.experienceLevel || "ENTRY",
      socialLinks: freelancer.freelancerProfile?.socialLinks || {},
      equipmentCameras: freelancer.freelancerProfile?.equipmentCameras || "",
      equipmentLenses: freelancer.freelancerProfile?.equipmentLenses || "",
      equipmentLighting: freelancer.freelancerProfile?.equipmentLighting || "",
      equipmentOther: freelancer.freelancerProfile?.equipmentOther || "",
      totalEarnings: freelancer.freelancerProfile?.totalEarnings || 0,
      rating: freelancer.freelancerProfile?.rating || 0,
      createdAt: freelancer.createdAt,
      updatedAt: freelancer.updatedAt,
      software: freelancer.freelancerProfile?.software || [],
      portfolio: freelancer.freelancerProfile?.portfolioVideos || [], // Renamed to match frontend
      gigs: freelancer.freelancerProfile?.gigs || [],
      badges: freelancer.freelancerProfile?.userBadges?.filter((badge) => badge.isVisible) || [],
    }));

    return res.status(200).json(
      new ApiResponse(200, {
        freelancers: formattedFreelancers,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      }, "Freelancers retrieved successfully")
    );
  } catch (error) {
    console.error("Error retrieving freelancers:", error);
    return next(new ApiError(500, "Failed to retrieve freelancers", error.message));
  }
};

// Updated: Get freelancer by ID
const getFreelancerById = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }

    const { freelancerId } = req.params;
    const userId = parseInt(freelancerId);

    const freelancer = await prisma.user.findUnique({
      where: { id: userId, role: "FREELANCER" },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        username: true,
        bio: true,
        country: true,
        profilePicture: true,
        createdAt: true,
        updatedAt: true,
        rating: true,
        freelancerProfile: {
          select: {
            city: true,
            jobTitle: true,
            overview: true,
            skills: true,
            languages: true,
            tools: true,
            certifications: true,
            minimumRate: true,
            maximumRate: true,
            hourlyRate: true,
            weeklyHours: true,
            availabilityStatus: true,
            experienceLevel: true,
            socialLinks: true,
            equipmentCameras: true,
            equipmentLenses: true,
            equipmentLighting: true,
            equipmentOther: true,
            totalEarnings: true,
            rating: true,
            software: {
              select: { id: true, name: true, icon: true, level: true },
            },
            portfolioVideos: {
              select: { 
                id: true, 
                title: true, 
                videoUrl: true, 
                description: true,
                category: true,
                uploadedAt: true
              },
            },
            gigs: {
              select: { 
                id: true, 
                title: true, 
                description: true, 
                pricing: true,
                deliveryTime: true,
                thumbnailUrl: true,
                category: true,
                status: true
              },
            },
            userBadges: {
              select: { id: true, badgeId: true, isVisible: true },
            },
          },
        },
      },
    });

    if (!freelancer) {
      return next(new ApiError(404, "Freelancer not found"));
    }

    // Format response
    const formattedFreelancer = {
      id: freelancer.id,
      name: `${freelancer.firstname || ""} ${freelancer.lastname || ""}`.trim() || "Unnamed Freelancer",
      username: freelancer.username || null,
      bio: freelancer.bio || "",
      country: freelancer.country || "",
      city: freelancer.freelancerProfile?.city || "",
      profilePicture: freelancer.profilePicture || "",
      jobTitle: freelancer.freelancerProfile?.jobTitle || "",
      overview: freelancer.freelancerProfile?.overview || "",
      skills: freelancer.freelancerProfile?.skills || [],
      languages: freelancer.freelancerProfile?.languages || [],
      tools: freelancer.freelancerProfile?.tools || [],
      certifications: freelancer.freelancerProfile?.certifications || [],
      minimumRate: freelancer.freelancerProfile?.minimumRate || null,
      maximumRate: freelancer.freelancerProfile?.maximumRate || null,
      hourlyRate: freelancer.freelancerProfile?.hourlyRate || null,
      weeklyHours: freelancer.freelancerProfile?.weeklyHours || null,
      availabilityStatus: freelancer.freelancerProfile?.availabilityStatus || "UNAVAILABLE",
      experienceLevel: freelancer.freelancerProfile?.experienceLevel || "ENTRY",
      socialLinks: freelancer.freelancerProfile?.socialLinks || {},
      equipmentCameras: freelancer.freelancerProfile?.equipmentCameras || "",
      equipmentLenses: freelancer.freelancerProfile?.equipmentLenses || "",
      equipmentOther: freelancer.freelancerProfile?.equipmentOther || "",
      totalEarnings: freelancer.freelancerProfile?.totalEarnings || 0,
      rating: freelancer.freelancerProfile?.rating || freelancer.rating || 0,
      createdAt: freelancer.createdAt,
      updatedAt: freelancer.updatedAt,
      software: freelancer.freelancerProfile?.software || [],
      portfolio: freelancer.freelancerProfile?.portfolioVideos || [], // Renamed to match frontend
      gigs: freelancer.freelancerProfile?.gigs || [],
      badges: freelancer.freelancerProfile?.userBadges?.filter((badge) => badge.isVisible) || [],
    };

    return res.status(200).json(
      new ApiResponse(200, formattedFreelancer, "Freelancer retrieved successfully")
    );
  } catch (error) {
    console.error("Error retrieving freelancer:", error);
    return next(new ApiError(500, "Failed to retrieve freelancer", error.message));
  }
};

export { registerUser, loginUser, getUserProfile, updateUser, deleteItem, deleteUser, getAllBadges, getAllFreelancers, getFreelancerById };