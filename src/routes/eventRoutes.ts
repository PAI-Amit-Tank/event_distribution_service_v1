import { Router } from 'express';
import * as eventController from '../controllers/eventController';
import { AssignmentService } from '../services/assignmentService';
import { ReviewService } from '../services/reviewService';

export default (assignmentService: AssignmentService, reviewService: ReviewService) => {
    const router = Router();

    // POST /api/v1/events/batch - Request a new batch of events
    // Pass services to controller function (or instantiate controller with services)
    router.post('/batch', eventController.requestBatch(assignmentService));

    // POST /api/v1/events/:eventId/review - Submit a review for an event
    router.post('/:eventId/review', eventController.submitReview(reviewService));

    return router;
};