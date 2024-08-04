import express from "express";

import { confirmPaymentAndMarkRideAsSuccessful } from "../controllers/paymentsController.js";
import { verifyUser } from "../middleware/index.js";

const router = express.Router();

router.use(verifyUser);

router.post("/confirm-payment", confirmPaymentAndMarkRideAsSuccessful);

export default router;