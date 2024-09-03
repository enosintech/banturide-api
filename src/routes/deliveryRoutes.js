import express from 'express';

import { arrivedFirstStopDelivery, cancelDelivery, deliveryRequest, deliveryRiderAtDropOff, deliveryRiderAtPickUp, findNewDriverForDelivery, searchAndAssignDriverToDelivery, startDelivery } from '../controllers/deliveryController.js';
import { verifyUser } from '../middleware/index.js';

const router = express.Router();

router.use(verifyUser);

router.post('/make-delivery-request', deliveryRequest);

router.post('/findDriver', searchAndAssignDriverToDelivery);

router.post("/find-new-rider", findNewDriverForDelivery);

router.post("/cancel-delivery", cancelDelivery);

router.post("/rider-arrived", deliveryRiderAtPickUp);

router.post("/start-delivery", startDelivery);

router.post("/arrived-first-stop-delivery", arrivedFirstStopDelivery);

router.post("/end-delivery", deliveryRiderAtDropOff);

export default router;
