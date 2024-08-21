import express from 'express';

import { addDeliveryReview, addRideReview, getDriverReviews, reportDriver } from '../controllers/reviewsController.js';
import { verifyUser } from '../middleware/index.js';

const router = express.Router();

router.use(verifyUser);

router.post('/add-ride-review', addRideReview); // Add a new review
router.post('/add-delivery-review', addDeliveryReview); // Add a new review
router.post('/report-driver', reportDriver); // report a driver
router.get('/get-reviews', getDriverReviews); // Get reviews for a specific driver
export default router;