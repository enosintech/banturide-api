import express from 'express';

import { registerDriverController, registerPassengerController } from '../controllers/authController.js';
import { verifyUser } from "../middleware/index.js";

const router = express.Router();

router.use(verifyUser)

router.post("/passenger-signup", registerPassengerController);
router.post("/driver-signup", registerDriverController);

export default router;