import express from "express";

import { updatePaymentMethod, confirmPaymentAndMarkRideAsSuccessful, confirmPaymentAndMarkDeliveryAsSuccessful } from "../controllers/paymentsController.js";
import { verifyUser } from "../middleware/index.js";

const router = express.Router();

router.use(verifyUser);

router.put("/update-payment", updatePaymentMethod);
router.post("/confirm-ride-payment", confirmPaymentAndMarkRideAsSuccessful);
router.post("/confirm-delivery-payment", confirmPaymentAndMarkDeliveryAsSuccessful);

export default router;