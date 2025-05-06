import { Router } from 'express';
import * as internalController from '../controllers/internalController';
import { RequeueService } from '../services/requeueService';
// import { verifyInternalApiKey } from '../middleware/internalAuthMiddleware'; // TODO: Implement internal API key check

// Factory function to create the router, accepting service instance
export default (requeueService: RequeueService) => {
    const router = Router();

    // POST /api/v1/internal/trigger-requeue - Endpoint for CronJob to call
    // router.post('/trigger-requeue', verifyInternalApiKey, internalController.triggerRequeue(requeueService)); // Protect endpoint
    router.post('/trigger-requeue', internalController.triggerRequeue(requeueService)); // Placeholder without protection

    return router;
};