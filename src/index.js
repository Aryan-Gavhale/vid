import dotenv from "dotenv";
import { app } from './app.js';
import { PrismaClient } from '@prisma/client';
import http from 'http';
import { initializeSocket } from './socket.js';

dotenv.config({
  path: './.env',
});

const prisma = new PrismaClient();

// Start the server and ensure Prisma is connected
const startServer = async () => {
  try {
    // Ensure Prisma connects to PostgreSQL
    await prisma.$connect();
    console.log("🌟 Connected to PostgreSQL via Prisma!");

    // Start the Express server
    const PORT = process.env.PORT || 3000;
    const server = http.createServer(app);
    const io = initializeSocket(server);

    server.listen(PORT, () => {
      console.log(`⚙️ Server is running at port: ${PORT}`);
      console.log('Socket.IO server running');
    });
  } catch (error) {
    console.error("Error connecting to PostgreSQL:", error);
    process.exit(1); // Exit on failure to connect to the database
  }
};

startServer();