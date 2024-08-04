import express from 'express';

import { updateDriverLocation, updateBookingLocation } from '../controllers/locationController.js';
import { verifyUser } from '../middleware/index.js';

const router = express.Router();

router.use(verifyUser);

router.post('/update-driver-location', updateDriverLocation);
router.post('/update-booking-location', updateBookingLocation);

export default router;