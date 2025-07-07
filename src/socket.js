import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { createLogger, format, transports } from 'winston';

const prisma = new PrismaClient();

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json(),
    format.metadata(),
  ),
  transports: [
    new transports.File({ filename: 'logs/socket.log' }),
    new transports.Console({ format: format.simple() }),
  ],
});

const initializeSocket = (server) => {
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        throw new Error('Authentication token missing');
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          firstname: true,
          lastname: true,
          email: true,
          role: true,
          profilePicture: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      socket.user = user;
      logger.info('User authenticated', { userId: user.id, socketId: socket.id });
      next();
    } catch (error) {
      logger.error('Authentication error', {
        error: error.message,
        socketId: socket.id,
      });
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    logger.info('User connected', {
      userId: socket.user.id,
      socketId: socket.id,
    });

    socket.on('joinJobRoom', async ({ jobId }) => {
      try {
        const job = await prisma.job.findUnique({
          where: { id: parseInt(jobId) },
          select: { postedById: true, freelancerId: true },
        });

        if (!job) {
          throw new Error('Job not found');
        }

        if (
          socket.user.id !== job.postedById &&
          socket.user.id !== job.freelancerId
        ) {
          throw new Error('Unauthorized access to job');
        }

        const room = `job:${jobId}`;
        socket.join(room);
        logger.info('User joined job room', {
          userId: socket.user.id,
          jobId,
          room,
        });

        socket.emit('joinedJobRoom', { jobId });
      } catch (error) {
        logger.error('Error joining job room', {
          userId: socket.user.id,
          jobId,
          error: error.message,
        });
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('sendMessage', async ({ jobId, content, attachments = [], replyToId }) => {
      try {
        const job = await prisma.job.findUnique({
          where: { id: parseInt(jobId) },
          select: { postedById: true, freelancerId: true },
        });

        if (!job) {
          throw new Error('Job not found');
        }

        if (
          socket.user.id !== job.postedById &&
          socket.user.id !== job.freelancerId
        ) {
          throw new Error('Unauthorized to send message');
        }

        // Validate replyToId
        let replyTo = null;
        if (replyToId) {
          const replyMessage = await prisma.message.findUnique({
            where: { id: replyToId },
            select: { id: true, jobId: true },
          });
          if (!replyMessage || replyMessage.jobId !== parseInt(jobId)) {
            throw new Error('Invalid reply message');
          }
          replyTo = replyToId;
        }

        const message = await prisma.message.create({
          data: {
            jobId: parseInt(jobId),
            senderId: socket.user.id,
            content: content || '',
            attachments,
            replyTo,
            timestamp: new Date(),
          },
          include: {
            sender: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
                profilePicture: true,
              },
            },
          },
        });

        const formattedMessage = {
          id: message.id,
          jobId: message.jobId,
          sender: {
            id: message.sender.id,
            name: `${message.sender.firstname} ${message.sender.lastname}`,
            avatar: message.sender.profilePicture || null,
          },
          content: message.content,
          attachments: message.attachments,
          replyTo: message.replyTo,
          reactions: message.reactions || [],
          timestamp: message.timestamp.toISOString(),
          isDeleted: message.isDeleted || false,
        };

        const room = `job:${jobId}`;
        io.to(room).emit('newMessage', formattedMessage);
        logger.info('Message sent', {
          userId: socket.user.id,
          jobId,
          messageId: message.id,
          replyToId,
        });
      } catch (error) {
        logger.error('Error sending message', {
          userId: socket.user.id,
          jobId,
          error: error.message,
        });
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('typing', ({ jobId, isTyping }) => {
      try {
        const room = `job:${jobId}`;
        socket.to(room).emit('userTyping', {
          userId: socket.user.id,
          name: `${socket.user.firstname} ${socket.user.lastname}`,
          isTyping,
        });
        logger.debug('Typing event', {
          userId: socket.user.id,
          jobId,
          isTyping,
        });
      } catch (error) {
        logger.error('Error handling typing event', {
          userId: socket.user.id,
          jobId,
          error: error.message,
        });
      }
    });

    socket.on('disconnect', () => {
      logger.info('User disconnected', {
        userId: socket.user.id,
        socketId: socket.id,
      });
    });

    socket.on('error', (error) => {
      logger.error('Socket error', {
        userId: socket.user.id,
        socketId: socket.id,
        error: error.message,
      });
    });
  });

  io.on('error', (error) => {
    logger.error('Socket.IO server error', { error: error.message });
  });

  return io;
};

export { initializeSocket };