import express from 'express';

import { registerDriverController, registerPassengerController, signinController, signoutController } from '../controllers/authController.js';
import { verifyUser } from "../middleware/index.js";

const router = express.Router();

router.post("/create-passenger", registerPassengerController);

router.post("/create-driver", registerDriverController);

router.post("/signin", signinController);

router.post("/signout", verifyUser, signoutController);

export default router;