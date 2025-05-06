import axios from 'axios';
import { Pool } from 'pg';

interface RegionalApiResponse {
    success: boolean;
    message?: string;
}

class ReviewError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number = 500) {
        super(message);
        this.statusCode = statusCode;
    }
}

export class ReviewService {
    private dbPool: Pool;

    constructor(dbPool: Pool) {
        this.dbPool = dbPool;
        console.log('[service]: ReviewService instantiated.');
    }

    private getRegionalApiEndpoint(regionCode: string, externalEventId: string): string {
        const baseUrl = process.env[`REGION_${regionCode}_API_URL`];
        if (!baseUrl) {
            console.warn(`[service]: Regional API URL for region ${regionCode} not configured.`);
            return `http://mock-regional-api.invalid/events/${externalEventId}/review`;
        }
        return `${baseUrl}/events/${encodeURIComponent(externalEventId)}/review`;
    }

    async processReview(userId: string, eventId: string, decision: 'Approved' | 'Rejected', rating?: number, comment?: string): Promise<void> {
        console.log(`[service]: Processing review for event ${eventId} by user ${userId}. Decision: ${decision}`);

        const client = await this.dbPool.connect();
        console.log('[service]: Database client acquired for review.');

        try {
            // 1. Fetch event details & Validate state in DB within a transaction
            await client.query('BEGIN');
            console.log('[service]: Review transaction started.');

            const query = `
                SELECT region_code, external_event_id
                FROM events
                WHERE event_id = $1 AND assigned_user_id = $2 AND status = $3
                FOR UPDATE -- Lock the row to prevent concurrent updates/re-queuing
            `;
            const result = await client.query(query, [eventId, userId, 'Assigned']);

            if (result.rows.length === 0) {
                 await client.query('ROLLBACK');
                 throw new ReviewError(`Event ${eventId} not found, not assigned to user ${userId}, or not in 'Assigned' state.`, 404);
            }
            const eventDetails = result.rows[0];
            console.log(`[service]: Found event details for ${eventId}:`, eventDetails);

            if (!eventDetails.external_event_id) {
                await client.query('ROLLBACK');
                throw new ReviewError(`Cannot process review for event ${eventId}: Missing external_event_id needed for regional API call.`, 400);
            }

            const { region_code, external_event_id } = eventDetails;
            const regionalApiUrl = this.getRegionalApiEndpoint(region_code, external_event_id);

            // 3. Construct payload for the Regional Update API
            const reviewPayload = {
                reviewedBy: userId,
                decision: decision,
                rating: rating,
                comment: comment,
                timestamp: new Date().toISOString()
            };

            // 4. Make HTTP POST/PUT request to the Regional Update API
            console.log(`[service]: Calling regional API: ${regionalApiUrl}`);
            let regionalApiSuccess = false;
            try {
                const response = await axios.post<RegionalApiResponse>(regionalApiUrl, reviewPayload, {
                    timeout: 10000
                });

                // 5. Handle response from Regional API
                if (response.status >= 200 && response.status < 300) {
                     console.log(`[service]: Regional API call successful for event ${eventId}.`);
                     regionalApiSuccess = true;
                } else {
                     console.error(`[service]: Regional API for ${eventId} returned unexpected status: ${response.status}`);
                }
            } catch (error: any) {
                console.error(`[service]: Regional API call failed for event ${eventId} (${regionalApiUrl}):`, error.message);
                if (axios.isAxiosError(error) && error.response) {
                    console.error('[service]: Regional API Response Status:', error.response.status);
                    console.error('[service]: Regional API Response Data:', error.response.data);
                }
            }


            // 6. If Regional API call successful: Update event status to 'Completed' in Central DB
            if (regionalApiSuccess) {
                 const updateQuery = `
                    UPDATE events
                    SET status = $1, completed_at = NOW(), assigned_user_id = NULL, assigned_at = NULL,
                        review_user_id = $2, reviewed_at = NOW(), review_decision = $3, review_comment = $4 -- Store review details centrally too
                    WHERE event_id = $5 -- No need for status='Assigned' check due to FOR UPDATE lock
                 `;
                 await client.query(updateQuery, ['Completed', userId, decision, comment, eventId]);
                 console.log(`[service]: Central status updated to 'Completed' for event ${eventId}.`);
                 await client.query('COMMIT');
                 console.log('[service]: Review transaction committed.');
            } else {
                 // 7. If Regional API call fails: Rollback central transaction, throw error
                 console.error(`[service]: Rolling back central transaction for event ${eventId} due to regional API failure.`);
                 await client.query('ROLLBACK');
                 throw new ReviewError(`Failed to submit review to regional system for event ${eventId}. Central changes rolled back.`, 502); // 502 Bad Gateway suggests upstream failure
            }

        } catch (error: any) {
             if (client) {
                try {
                    await client.query('ROLLBACK');
                    console.log('[service]: Review transaction rolled back due to error.');
                } catch (rollbackError) {
                    console.error('[service]: Error during rollback:', rollbackError);
                }
            }
            console.error(`[service]: Review processing failed for event ${eventId}:`, error);
            if (error instanceof ReviewError) {
                throw error;
            } else {
                throw new ReviewError(`Failed to process review for event ${eventId}.`, 500);
            }
        } finally {
            if (client) {
                client.release();
                console.log('[service]: Database client released.');
            }
        }
    }
}