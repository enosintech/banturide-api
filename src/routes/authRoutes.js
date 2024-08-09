import express from 'express';

import { registerDriverController, registerPassengerController, signinController, signoutController } from '../controllers/authController.js';
import { verifyUser } from "../middleware/index.js";

const router = express.Router();

router.post("/passenger-signup", registerPassengerController);

router.post("/driver-signup", registerDriverController);

router.post("/signin", signinController);

router.post("/signout", verifyUser, signoutController);

export default router;