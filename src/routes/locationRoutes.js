import express from 'express';

import { updateDriverLocation, updateBookingLocation, updateDeliveryLocation } from '../controllers/locationController.js';
import { verifyUser } from '../middleware/index.js';

const router = express.Router();

router.use(verifyUser);

router.post('/update-driver-location', updateDriverLocation);
router.post('/update-booking-location', updateBookingLocation);
router.post('/update-delivery-location', updateDeliveryLocation);

export default router;