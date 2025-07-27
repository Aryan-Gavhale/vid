import express from "express";
import prisma from "../prismaClient.js";

const router = express.Router();

// POST /api/v1/projects/:jobId/timeline
router.post("/projects/:jobId", async (req, res) => {
  const { jobId } = req.params;
  const { title, description, startDate, endDate } = req.body;
  
  const job = await prisma.job.findUnique({
    where: { id: parseInt(jobId) },
    include: { postedBy: true, freelancer: true }
  });

  if (!job) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const timelineItem = await prisma.timeline.create({
    data: {
      jobId: parseInt(jobId),
      title,
      description,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    }
  });

  res.status(201).json(timelineItem);
});

// GET /api/v1/projects/:jobId/timeline
router.get("/projects/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await prisma.job.findUnique({
      where: { id: parseInt(jobId) },
      include: { postedBy: true, freelancer: true }
    });

    if (!job) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const timelineItems = await prisma.timeline.findMany({
      where: { jobId: parseInt(jobId) },
      orderBy: { startDate: 'asc' }
    });

    res.json(timelineItems);
  } catch (error) {
    console.error('Error fetching timeline items:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/timeline/:id
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, startDate, endDate, isCompleted } = req.body;

    const timelineItem = await prisma.timeline.findUnique({
      where: { id: parseInt(id) },
      include: {
        job: {
          include: { postedBy: true, freelancer: true }
        }
      }
    });

    const updatedItem = await prisma.timeline.update({
      where: { id: parseInt(id) },
      data: {
        title,
        description,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        isCompleted,
        updatedAt: new Date()
      }
    });

    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating timeline item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/timeline/:id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // const userId = req.user.id; // Not used in original logic

    const timelineItem = await prisma.timeline.findUnique({
      where: { id: parseInt(id) },
      include: {
        job: {
          include: { postedBy: true, freelancer: true }
        }
      }
    });

    await prisma.timeline.delete({
      where: { id: parseInt(id) }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting timeline item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 