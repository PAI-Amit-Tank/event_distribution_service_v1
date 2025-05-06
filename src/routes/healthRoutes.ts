import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  // Basic health check
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});

export default router;