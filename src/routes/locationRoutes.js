import express from 'express';

import { updateDriverLocation, updateDeliveryLocation } from '../controllers/locationController.js';
import { verifyUser } from '../middleware/index.js';

const router = express.Router();

router.use(verifyUser);

router.post('/update-driver-location', updateDriverLocation);
router.post('/update-delivery-location', updateDeliveryLocation);

export default router;