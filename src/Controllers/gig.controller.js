import { ApiError } from "../Utils/ApiError.js";
import { ApiResponse } from "../Utils/ApiResponse.js";
import prisma from "../prismaClient.js";
import multer from "multer";
import path from "path";

// Multer configuration (unchanged)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|mp4/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new ApiError(400, "File must be JPEG, PNG, or MP4"));
  },
}).fields([
  { name: "thumbnail", maxCount: 1 },
  { name: "sampleMedia", maxCount: 3 },
]);

// Existing createGig, createGigDraft, updateGig, updateGigDraft, deleteGig, deleteGigDraft unchanged
const createGig = async (req, res, next) => {
  upload(req, res, async (err) => {
    if (err) {
      return next(new ApiError(400, err.message));
    }

    try {
      if (!req.user || !req.user.id) {
        return next(new ApiError(401, "Unauthorized: User not authenticated"));
      }
      const freelancerId = req.user.id;

      const {
        title, description, category, pricing, deliveryTime, revisionCount,
        tags, requirements, faqs, packageDetails,
      } = req.body;

      if (!title || !pricing || !deliveryTime) {
        return next(new ApiError(400, "Missing required fields: title, pricing, and deliveryTime are mandatory."));
      }

      const parsedPricing = JSON.parse(pricing);
      const parsedTags = tags ? JSON.parse(tags) : [];
      const parsedFaqs = faqs ? JSON.parse(faqs) : [];
      const parsedPackageDetails = packageDetails ? JSON.parse(packageDetails) : [];

      if (!Array.isArray(parsedPricing) || parsedPricing.length === 0) {
        return next(new ApiError(400, "Pricing must be a non-empty array of objects."));
      }

      const parsedDeliveryTime = parseInt(deliveryTime);
      if (isNaN(parsedDeliveryTime) || parsedDeliveryTime <= 0) {
        return next(new ApiError(400, "Delivery time must be a positive integer."));
      }

      const freelancerProfile = await prisma.freelancerProfile.findUnique({
        where: { userId: freelancerId },
      });
      if (!freelancerProfile) {
        return next(new ApiError(404, "Freelancer profile not found. Create a profile first."));
      }

      const sampleMediaData = [];
      if (req.files?.thumbnail?.[0]) {
        sampleMediaData.push({
          mediaUrl: `/uploads/${req.files.thumbnail[0].filename}`,
          mediaType: req.files.thumbnail[0].mimetype.split("/")[1] === "mp4" ? "video" : "thumbnail",
        });
      }
      if (req.files?.sampleMedia) {
        req.files.sampleMedia.forEach(file => {
          sampleMediaData.push({
            mediaUrl: `/uploads/${file.filename}`,
            mediaType: file.mimetype.split("/")[1] === "mp4" ? "video" : "image",
          });
        });
      }

      const gig = await prisma.gig.create({
        data: {
          freelancerId: freelancerProfile.id,
          title,
          description,
          category,
          pricing: parsedPricing,
          deliveryTime: parsedDeliveryTime,
          revisionCount: revisionCount ? parseInt(revisionCount) : null,
          tags: parsedTags,
          requirements,
          faqs: parsedFaqs,
          packageDetails: parsedPackageDetails,
          sampleMedia: { create: sampleMediaData },
        },
        include: { sampleMedia: true },
      });

      return res.status(201).json(
        new ApiResponse(201, gig, "Gig created successfully")
      );
    } catch (error) {
      console.error("Error creating gig:", error);
      return next(new ApiError(500, "Failed to create gig", error.message));
    }
  });
};

const createGigDraft = async (req, res, next) => {
  upload(req, res, async (err) => {
    if (err) {
      return next(new ApiError(400, err.message));
    }

    try {
      if (!req.user || !req.user.id) {
        return next(new ApiError(401, "Unauthorized: User not authenticated"));
      }
      const freelancerId = req.user.id;

      const {
        title, description, category, pricing, deliveryTime, revisionCount,
        tags, requirements, faqs, packageDetails,
      } = req.body;

      if (!title) {
        return next(new ApiError(400, "Title is required for drafts."));
      }

      const freelancerProfile = await prisma.freelancerProfile.findUnique({
        where: { userId: freelancerId },
      });
      if (!freelancerProfile) {
        return next(new ApiError(404, "Freelancer profile not found. Create a profile first."));
      }

      const parsedPricing = pricing ? JSON.parse(pricing) : [];
      const parsedTags = tags ? JSON.parse(tags) : [];
      const parsedFaqs = faqs ? JSON.parse(faqs) : [];
      const parsedPackageDetails = packageDetails ? JSON.parse(packageDetails) : [];
      const parsedDeliveryTime = deliveryTime ? parseInt(deliveryTime) : null;

      const sampleMediaData = [];
      if (req.files?.thumbnail?.[0]) {
        sampleMediaData.push({
          mediaUrl: `/uploads/${req.files.thumbnail[0].filename}`,
          mediaType: req.files.thumbnail[0].mimetype.split("/")[1] === "mp4" ? "video" : "thumbnail",
        });
      }
      if (req.files?.sampleMedia) {
        req.files.sampleMedia.forEach(file => {
          sampleMediaData.push({
            mediaUrl: `/uploads/${file.filename}`,
            mediaType: file.mimetype.split("/")[1] === "mp4" ? "video" : "image",
          });
        });
      }

      const gig = await prisma.gig.create({
        data: {
          freelancerId: freelancerProfile.id,
          title,
          description: description || null,
          category: category || null,
          pricing: parsedPricing.length > 0 ? parsedPricing : [],
          deliveryTime: parsedDeliveryTime,
          revisionCount: revisionCount ? parseInt(revisionCount) : null,
          status: "DRAFT",
          tags: parsedTags,
          requirements: requirements || null,
          faqs: parsedFaqs.length > 0 ? parsedFaqs : [],
          packageDetails: parsedPackageDetails.length > 0 ? parsedPackageDetails : [],
          sampleMedia: { create: sampleMediaData },
        },
        include: { sampleMedia: true },
      });

      return res.status(201).json(
        new ApiResponse(201, gig, "Gig draft saved successfully")
      );
    } catch (error) {
      console.error("Error saving gig draft:", error);
      return next(new ApiError(500, "Failed to save gig draft", error.message));
    }
  });
};

const updateGigDraft = async (req, res, next) => {
  upload(req, res, async (err) => {
    if (err) {
      return next(new ApiError(400, err.message));
    }

    try {
      if (!req.user || !req.user.id) {
        return next(new ApiError(401, "Unauthorized: User not authenticated"));
      }
      const freelancerId = req.user.id;
      const { gigId } = req.params;

      const {
        title, description, category, pricing, deliveryTime, revisionCount,
        tags, requirements, faqs, packageDetails,
      } = req.body;

      const gig = await prisma.gig.findUnique({
        where: { id: parseInt(gigId) },
        include: { freelancer: true },
      });
      if (!gig) {
        return next(new ApiError(404, "Gig draft not found."));
      }
      if (gig.freelancer.userId !== freelancerId) {
        return next(new ApiError(403, "Forbidden: You can only update your own gig drafts."));
      }
      if (gig.status !== "DRAFT") {
        return next(new ApiError(400, "This gig is not a draft and cannot be updated as one."));
      }

      if (!title) {
        return next(new ApiError(400, "Title is required for drafts."));
      }

      const parsedPricing = pricing ? JSON.parse(pricing) : gig.pricing;
      const parsedTags = tags ? JSON.parse(tags) : gig.tags;
      const parsedFaqs = faqs ? JSON.parse(faqs) : gig.faqs;
      const parsedPackageDetails = packageDetails ? JSON.parse(packageDetails) : gig.packageDetails;
      const parsedDeliveryTime = deliveryTime ? parseInt(deliveryTime) : gig.deliveryTime;

      const sampleMediaData = [];
      if (req.files?.thumbnail?.[0]) {
        sampleMediaData.push({
          mediaUrl: `/uploads/${req.files.thumbnail[0].filename}`,
          mediaType: req.files.thumbnail[0].mimetype.split("/")[1] === "mp4" ? "video" : "thumbnail",
        });
      }
      if (req.files?.sampleMedia) {
        req.files.sampleMedia.forEach(file => {
          sampleMediaData.push({
            mediaUrl: `/uploads/${file.filename}`,
            mediaType: file.mimetype.split("/")[1] === "mp4" ? "video" : "image",
          });
        });
      }

      const updatedGig = await prisma.gig.update({
        where: { id: parseInt(gigId) },
        data: {
          title,
          description: description !== undefined ? description : gig.description,
          category: category !== undefined ? category : gig.category,
          pricing: parsedPricing,
          deliveryTime: parsedDeliveryTime,
          revisionCount: revisionCount ? parseInt(revisionCount) : gig.revisionCount,
          tags: parsedTags,
          requirements: requirements !== undefined ? requirements : gig.requirements,
          faqs: parsedFaqs,
          packageDetails: parsedPackageDetails,
          sampleMedia: sampleMediaData.length > 0 ? {
            deleteMany: {},
            create: sampleMediaData,
          } : undefined,
        },
        include: { sampleMedia: true },
      });

      return res.status(200).json(
        new ApiResponse(200, updatedGig, "Gig draft updated successfully")
      );
    } catch (error) {
      console.error("Error updating gig draft:", error);
      return next(new ApiError(500, "Failed to update gig draft", error.message));
    }
  });
};

const deleteGigDraft = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const freelancerId = req.user.id;
    const { gigId } = req.params;

    const gig = await prisma.gig.findUnique({
      where: { id: parseInt(gigId) },
      include: { freelancer: true },
    });
    if (!gig) {
      return next(new ApiError(404, "Gig draft not found."));
    }
    if (gig.freelancer.userId !== freelancerId) {
      return next(new ApiError(403, "Forbidden: You can only delete your own gig drafts."));
    }
    if (gig.status !== "DRAFT") {
      return next(new ApiError(400, "This gig is not a draft and cannot be deleted as one."));
    }

    await prisma.gig.delete({
      where: { id: parseInt(gigId) },
    });

    return res.status(200).json(
      new ApiResponse(200, null, "Gig draft deleted successfully")
    );
  } catch (error) {
    console.error("Error deleting gig draft:", error);
    return next(new ApiError(500, "Failed to delete gig draft", error.message));
  }
};

const updateGig = async (req, res, next) => {
  upload(req, res, async (err) => {
    if (err) {
      return next(new ApiError(400, err.message));
    }

    try {
      if (!req.user || !req.user.id) {
        return next(new ApiError(401, "Unauthorized: User not authenticated"));
      }
      const freelancerId = req.user.id;
      const { gigId } = req.params;

      const {
        title, description, category, pricing, deliveryTime, revisionCount,
        tags, requirements, faqs, packageDetails,
      } = req.body;

      const gig = await prisma.gig.findUnique({
        where: { id: parseInt(gigId) },
        include: { freelancer: true },
      });
      if (!gig) {
        return next(new ApiError(404, "Gig not found."));
      }
      if (gig.freelancer.userId !== freelancerId) {
        return next(new ApiError(403, "Forbidden: You can only update your own gigs."));
      }

      const parsedPricing = pricing ? JSON.parse(pricing) : gig.pricing;
      const parsedTags = tags ? JSON.parse(tags) : gig.tags;
      const parsedFaqs = faqs ? JSON.parse(faqs) : gig.faqs;
      const parsedPackageDetails = packageDetails ? JSON.parse(packageDetails) : gig.packageDetails;
      const parsedDeliveryTime = deliveryTime ? parseInt(deliveryTime) : gig.deliveryTime;

      if (parsedPricing && (!Array.isArray(parsedPricing) || parsedPricing.length === 0)) {
        return next(new ApiError(400, "Pricing must be a non-empty array of objects."));
      }
      if (parsedDeliveryTime && (isNaN(parsedDeliveryTime) || parsedDeliveryTime <= 0)) {
        return next(new ApiError(400, "Delivery time must be a positive integer."));
      }

      const sampleMediaData = [];
      if (req.files?.thumbnail?.[0]) {
        sampleMediaData.push({
          mediaUrl: `/uploads/${req.files.thumbnail[0].filename}`,
          mediaType: req.files.thumbnail[0].mimetype.split("/")[1] === "mp4" ? "video" : "thumbnail",
        });
      }
      if (req.files?.sampleMedia) {
        req.files.sampleMedia.forEach(file => {
          sampleMediaData.push({
            mediaUrl: `/uploads/${file.filename}`,
            mediaType: file.mimetype.split("/")[1] === "mp4" ? "video" : "image",
          });
        });
      }

      const updatedGig = await prisma.gig.update({
        where: { id: parseInt(gigId) },
        data: {
          title: title !== undefined ? title : gig.title,
          description: description !== undefined ? description : gig.description,
          category: category !== undefined ? category : gig.category,
          pricing: parsedPricing,
          deliveryTime: parsedDeliveryTime,
          revisionCount: revisionCount ? parseInt(revisionCount) : gig.revisionCount,
          tags: parsedTags,
          requirements: requirements !== undefined ? requirements : gig.requirements,
          faqs: parsedFaqs,
          packageDetails: parsedPackageDetails,
          sampleMedia: sampleMediaData.length > 0 ? {
            deleteMany: {},
            create: sampleMediaData,
          } : undefined,
        },
        include: { sampleMedia: true },
      });

      return res.status(200).json(
        new ApiResponse(200, updatedGig, "Gig updated successfully")
      );
    } catch (error) {
      console.error("Error updating gig:", error);
      return next(new ApiError(500, "Failed to update gig", error.message));
    }
  });
};

const deleteGig = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const freelancerId = req.user.id;
    const { gigId } = req.params;

    const gig = await prisma.gig.findUnique({
      where: { id: parseInt(gigId) },
      include: { freelancer: true },
    });
    if (!gig) {
      return next(new ApiError(404, "Gig not found."));
    }
    if (gig.freelancer.userId !== freelancerId) {
      return next(new ApiError(403, "Forbidden: You can only delete your own gigs."));
    }

    await prisma.gig.update({
      where: { id: parseInt(gigId) },
      data: { status: "DELETED" }, // Soft delete
    });

    return res.status(200).json(
      new ApiResponse(200, null, "Gig deleted successfully")
    );
  } catch (error) {
    console.error("Error deleting gig:", error);
    return next(new ApiError(500, "Failed to delete gig", error.message));
  }
};

const getGig = async (req, res, next) => {
  try {
    const { gigId } = req.params;

    if (!gigId || isNaN(parseInt(gigId))) {
      return next(new ApiError(400, "Valid gigId is required"));
    }

    const gig = await prisma.gig.findUnique({
      where: { id: parseInt(gigId) },
      include: {
        sampleMedia: true,
        freelancer: {
          include: {
            user: { select: { firstname: true, lastname: true, email: true } },
          },
        },
        orders: {
          where: { status: { not: "CANCELLED" } },
          select: {
            id: true,
            client: { select: { firstname: true, lastname: true } },
            createdAt: true,
            totalPrice: true,
            status: true,
          },
          take: 5, // Limit to recent 5 orders
          orderBy: { createdAt: "desc" },
        },
        reviews: {
          select: {
            rating: true,
            comment: true,
            createdAt: true,
            client: { select: { firstname: true, lastname: true } },
          },
          take: 5, // Limit to recent 5 reviews
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!gig) {
      return next(new ApiError(404, "Gig not found."));
    }

    await prisma.gig.update({
      where: { id: parseInt(gigId) },
      data: { views: gig.views + 1 },
    });

    // Calculate average rating
    const averageRating = gig.reviews.length > 0
      ? gig.reviews.reduce((sum, review) => sum + review.rating, 0) / gig.reviews.length
      : 0;

    return res.status(200).json(
      new ApiResponse(200, { ...gig, averageRating }, "Gig retrieved successfully")
    );
  } catch (error) {
    console.error("Error retrieving gig:", error);
    return next(new ApiError(500, "Failed to retrieve gig", error.message));
  }
};

const getGigAnalytics = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const freelancerId = req.user.id;
    const { gigId } = req.params;

    const gig = await prisma.gig.findUnique({
      where: { id: parseInt(gigId) },
      include: {
        freelancer: true,
        orders: {
          where: { status: { not: "CANCELLED" } },
          select: { id: true, createdAt: true, totalPrice: true },
        },
        reviews: { select: { rating: true } },
      },
    });
    if (!gig) {
      return next(new ApiError(404, "Gig not found."));
    }
    if (gig.freelancer.userId !== freelancerId) {
      return next(new ApiError(403, "Forbidden: You can only view analytics for your own gigs."));
    }

    const totalViews = gig.views;
    const totalInquiries = 0; // TODO: Implement inquiry count based on gigId
    const totalPurchases = gig.orders.length;
    const averageRating = gig.reviews.length > 0
      ? gig.reviews.reduce((sum, review) => sum + review.rating, 0) / gig.reviews.length
      : 0;
    const repeatClients = await prisma.order.groupBy({
      by: ["clientId"],
      where: { gigId: parseInt(gigId), status: { not: "CANCELLED" } },
      _count: { clientId: true },
    }).then(groups => groups.filter(g => g._count.clientId > 1).length);
    const conversionRate = totalViews > 0 ? (totalPurchases / totalViews) * 100 : 0;

    return res.status(200).json(
      new ApiResponse(200, {
        totalViews,
        totalInquiries,
        totalPurchases,
        averageRating,
        repeatClients,
        conversionRate: parseFloat(conversionRate.toFixed(1)),
        revenue: gig.revenue,
        responseTime: gig.responseTime,
        completionRate: gig.completionRate,
      }, "Gig analytics retrieved successfully")
    );
  } catch (error) {
    console.error("Error retrieving gig analytics:", error);
    return next(new ApiError(500, "Failed to retrieve gig analytics", error.message));
  }
};

const getFreelancerGigs = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ApiError(401, "Unauthorized: User not authenticated"));
    }
    const userId = req.user.id;

    const freelancerProfile = await prisma.freelancerProfile.findUnique({
      where: { userId },
    });
    if (!freelancerProfile) {
      return next(new ApiError(404, "Freelancer profile not found"));
    }

    const gigs = await prisma.gig.findMany({
      where: { freelancerId: freelancerProfile.id },
      include: { sampleMedia: true },
    });

    return res.status(200).json(
      new ApiResponse(200, gigs, "Freelancer gigs retrieved successfully")
    );
  } catch (error) {
    console.error("Error fetching freelancer gigs:", error);
    return next(new ApiError(500, "Failed to fetch freelancer gigs", error.message));
  }
};

const getAllGigs = async (req, res, next) => {
  try {
    const { category, search, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      status: "ACTIVE",
    };
    if (category) {
      where.category = category;
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { tags: { has: search } },
      ];
    }

    const [gigs, total] = await Promise.all([
      prisma.gig.findMany({
        where,
        include: { 
          sampleMedia: true, 
          freelancer: { 
            select: { 
              user: { 
                select: { 
                  firstname: true,
                  lastname: true,
                } 
              } 
            } 
          } 
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
      }),
      prisma.gig.count({ where }),
    ]);

    return res.status(200).json(
      new ApiResponse(200, {
        gigs,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      }, "All gigs retrieved successfully")
    );
  } catch (error) {
    console.error("Error retrieving all gigs:", error);
    return next(new ApiError(500, "Failed to retrieve all gigs", error.message));
  }
};

const pauseGig = async (req, res, next) => {
  try {
    const { gigId } = req.params;
    const gig = await prisma.gig.findUnique({ 
      where: { id: parseInt(gigId) },
      include: { freelancer: true }
    });
    
    if (!gig) return next(new ApiError(404, "Gig not found"));
    
    const freelancerProfile = await prisma.freelancerProfile.findUnique({
      where: { userId: req.user.id },
    });
    
    if (!freelancerProfile || gig.freelancerId !== freelancerProfile.id) {
      return next(new ApiError(403, "Forbidden: You can only update your own gigs"));
    }
    
    const newStatus = gig.status === "PAUSED" ? "ACTIVE" : "PAUSED";
    const updated = await prisma.gig.update({
      where: { id: parseInt(gigId) },
      data: { status: newStatus },
    });
    
    return res.status(200).json(new ApiResponse(200, updated, `Gig ${newStatus === "PAUSED" ? "paused" : "activated"} successfully`));
  } catch (err) {
    return next(new ApiError(500, "Failed to update gig status", err.message));
  }
};

export {
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
  pauseGig
};