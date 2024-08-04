import express from 'express';

import { addReview, getDriverReviews } from '../controllers/reviewsController.js';
import { verifyUser } from '../middleware/index.js';

const router = express.Router();

router.use(verifyUser);

router.post('/add-review', addReview); // Add a new review
router.get('/get-reviews', getDriverReviews); // Get reviews for a specific driver

export default router;