import express from 'express';

import { registerDriverController, registerPassengerController } from '../controllers/authController.js';

const router = express.Router();

router.post("/passenger-signup", registerPassengerController);
router.post("/driver-signup", registerDriverController);

export default router;