import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import userRouter from "./Routes/user.routes.js"; // Import user routes
import jobRouter from "./Routes/job.routes.js"; // Import user routes
import profileRouter from "./Routes/profile.routes.js"; // Import user routes
import gigRouter from "./Routes/gig.routes.js"; // Import user routes
import orderRouter from "./Routes/order.routes.js"; // Import user routes
import transactionRouter from "./Routes/transaction.routes.js"; // Import user routes
import reviewRouter from "./Routes/review.routes.js"; // Import user routes
import messageRouter from "./Routes/message.routes.js"; // Import user routes
import notificationRouter from "./Routes/notification.routes.js"; // Import user routes
import disputeRouter from "./Routes/dispute.routes.js"; // Import user routes
import searchRouter from "./Routes/search.routes.js"; // Import user routes
import adminRouter from "./Routes/admin.routes.js"; // Import user routes
import analyticsRouter from "./Routes/analytics.routes.js"; // Import user routes
import referralRouter from "./Routes/referral.routes.js"; // Import user routes
import promotionRouter from "./Routes/promotion.routes.js"; // Import user routes
import { rateLimiter } from "./Middlewares/ratelimit.middleware.js";
import { errorHandler } from "./Middlewares/error.middleware.js";
import freelancerRoutes from "./Routes/freelancer.routes.js";
import portfolioRoutes from "./Routes/portfolio.routes.js";
import contactRoutes from "./Routes/contact.routes.js"
import { authenticateToken } from "./Middlewares/protect.middleware.js";
import prisma from "./prismaClient.js";

const app = express();

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN , 
    credentials: true,
}));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: "16kb" }));
app.use(rateLimiter())
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// Routes declaration
app.use("/api/v1/users", userRouter);
app.use("/api/v1/jobs", jobRouter);
app.use("/api/v1/profile", profileRouter);
app.use("/api/v1/gig", gigRouter);
app.use("/api/v1/orders", orderRouter);
app.use("/api/v1/transactions", transactionRouter);
app.use("/api/v1/reviews", reviewRouter);
app.use("/api/v1/messages", messageRouter);
app.use("/api/v1/notifications", notificationRouter);
app.use("/api/v1/disputes", disputeRouter);
app.use("/api/v1/search", searchRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/analytics", analyticsRouter);
app.use("/api/v1/referrals", referralRouter);
app.use("/api/v1/promotions", promotionRouter);
app.use("/api/v1/freelancer", freelancerRoutes);
app.use("/api/v1/portfolio", portfolioRoutes);
app.use("/api/v1/contact", contactRoutes);


app.get("/api/v1/client/jobs", authenticateToken, async(req, res) => {
  const clientId = req.user.id
  const jobs = await prisma.job.findMany({
    where : {
      postedById : clientId
    }
  })

  return res.json(jobs)
})


app.get('/api/v1/jobs/applications/:jobId', async (req, res) => {
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


app.use  (errorHandler)


export { app };