import express from "express";

import { updatePaymentMethod, confirmPaymentAndMarkRideAsSuccessful } from "../controllers/paymentsController.js";
import { verifyUser } from "../middleware/index.js";

const router = express.Router();

router.use(verifyUser);

router.put("/update-payment", updatePaymentMethod);
router.post("/confirm-payment", confirmPaymentAndMarkRideAsSuccessful);

export default router;