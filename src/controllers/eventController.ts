import { Request, Response, NextFunction } from 'express';
import { AssignmentService } from '../services/assignmentService';
import { ReviewService } from '../services/reviewService';


/**
 * Handles request for a new batch of events.
 */
export const requestBatch = (assignmentService: AssignmentService) =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.headers['x-user-id'] as string || 'mock-user-id';
        const teamId = req.headers['x-team-id'] as string || 'mock-team-id';

        console.log(`[controller]: User ${userId} requesting event batch.`);

        const batch = await assignmentService.assignBatch(userId, teamId);

        if (!batch || batch.length === 0) {
            res.status(200).json({ message: 'No events currently available for assignment.' });
            return;
        }

        res.status(200).json(batch);
    } catch (error) {
        console.error('[controller]: Error requesting batch:', error);
        next(error);
    }
};

/**
 * Handles submission of an event review.
 */
export const submitReview = (reviewService: ReviewService) =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { eventId } = req.params;
        const decision = req.body.decision as 'Approved' | 'Rejected';
        const { rating, comment } = req.body;
        const userId = req.headers['x-user-id'] as string || 'mock-user-id';

        console.log(`[controller]: User ${userId} submitting review for event ${eventId}. Decision: ${decision}`);

        // Basic validation
        if (!eventId) {
             res.status(400).json({ message: 'Missing eventId in URL path.' });
             return;
        }
        if (!decision) {
            res.status(400).json({ message: 'Missing required field: decision (e.g., "Approved", "Rejected").' });
            return;
        }
        if (decision !== 'Approved' && decision !== 'Rejected') {
            throw new Error('Invalid value for decision. Must be "Approved" or "Rejected".');
        }
        if (typeof decision !== 'string' || !['Approved', 'Rejected'].includes(decision)) {
            res.status(400).json({ message: 'Invalid value for decision. Must be "Approved" or "Rejected".' });
            return;
        }

        await reviewService.processReview(userId as string, eventId, decision, rating, comment);

        res.status(200).json({ message: `Review submitted successfully for event ${eventId}` });
    } catch (error) {
        console.error('[controller]: Error submitting review:', error);
        next(error);
    }
};