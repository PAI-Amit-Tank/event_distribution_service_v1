import express, { Express, Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import eventRoutes from './routes/eventRoutes';
import healthRoutes from './routes/healthRoutes';
import internalRoutes from './routes/internalRoutes';
import { Pool } from 'pg';
import { AssignmentService } from './services/assignmentService';
import { ReviewService } from './services/reviewService';
import { RequeueService } from './services/requeueService';

// Load environment variables from .env file
dotenv.config();

const dbPool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionTimeoutMillis: 2000
});

const assignmentService = new AssignmentService(dbPool);
const reviewService = new ReviewService(dbPool);
const requeueService = new RequeueService(dbPool);

const app: Express = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.use('/health', healthRoutes);
app.use('/api/v1/events', eventRoutes(assignmentService, reviewService));
app.use('/api/v1/internal', internalRoutes(requeueService));

app.get('/', (req: Request, res: Response) => {
  res.send('Event Distribution & Review Service is running!');
});

// --- Error Handling Middleware ---
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Global Error Handler:', err);
  res.status(500).json({ message: err.message });
});

const server = app.listen(port, () => { 
  console.log(`[server]: Server is running at http://localhost:${port}`);
});

const gracefulShutdown = (signal: string) => {
  console.log(`${signal} signal received: closing HTTP server`);
  server.close(() => {
    console.log('HTTP server closed');
    
    console.log('[database]: Closing database pool...');
    dbPool.end()
      .then(() => console.log('[database]: Database pool closed'))
      .catch((err) => console.error('[database]: Error closing database pool', err.stack))
      .finally(() => {
          console.log('[server]: Shutting down application.');
          process.exit(0);
      });
  });

  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));