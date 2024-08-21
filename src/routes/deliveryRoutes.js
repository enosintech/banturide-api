import express from 'express';
import { cancelDelivery, deliveryRequest, deliveryRiderAtDropOff, deliveryRiderAtPickUp, findNewDriverForDelivery, searchAndAssignDriverToDelivery, startDelivery } from '../controllers/deliveryController.js';

const router = express.Router();

router.post('/request', deliveryRequest);

router.post('/assignDriver', searchAndAssignDriverToDelivery);

router.post("/find-new-rider", findNewDriverForDelivery);

router.post("/cancel-delivery", cancelDelivery);

router.post("/rider-arrived", deliveryRiderAtPickUp);

router.post("/start-delivery", startDelivery);

router.post("/end-delivery", deliveryRiderAtDropOff);

export default router;
