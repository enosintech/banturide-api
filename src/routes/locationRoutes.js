import express from 'express';

import { updateDriverLocation } from '../controllers/locationController.js';
import { verifyUser } from '../middleware/index.js';

const router = express.Router();

router.use(verifyUser);

router.post('/update-driver-location', updateDriverLocation);

export default router;