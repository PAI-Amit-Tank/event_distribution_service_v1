import { Request, Response, NextFunction } from 'express';
import { RequeueService } from '../services/requeueService';

/**
 * Factory function to create the triggerRequeue handler.
 * @param requeueService Instance of RequeueService.
 * @returns Express request handler.
 */
export const triggerRequeue = (requeueService: RequeueService) =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    console.log('[controller]: Received request to trigger event re-queue.');
    try {
        const result = await requeueService.requeueTimedOutEvents();

        res.status(200).json({
            message: 'Re-queue process triggered successfully.',
            details: result
        });
    } catch (error) {
        console.error('[controller]: Error triggering re-queue:', error);
        next(error);
    }
};