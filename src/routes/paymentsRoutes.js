import express from "express";

import { confirmPaymentAndMarkRideAsSuccessful } from "../controllers/paymentsController";
import { verifyUser } from "../middleware";

const router = express.Router();

router.use(verifyUser);

router.post("/confirm-payment", confirmPaymentAndMarkRideAsSuccessful);

export default router;