import express from 'express';

import { addReview, getDriverReviews, reportDriver } from '../controllers/reviewsController.js';
import { verifyUser } from '../middleware/index.js';

const router = express.Router();

router.use(verifyUser);

router.post('/add-review', addReview); // Add a new review
router.post('report-driver', reportDriver); // report a driver
router.get('/get-reviews', getDriverReviews); // Get reviews for a specific driver
export default router;