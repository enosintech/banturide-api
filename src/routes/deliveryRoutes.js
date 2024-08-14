import express from 'express';
import {
    requestDelivery,
    searchDriversForDelivery,
    assignDeliveryDriver,
    updateDeliveryStatus,
    cancelDelivery,
    deliveryArrived,
    completeDelivery
} from '../controllers/deliveryController.js';

const router = express.Router();

// Route to request a delivery
router.post('/request', requestDelivery);

// Route to search for available drivers for the delivery (real-time)
router.post('/searchDrivers', searchDriversForDelivery);

// Route to assign a driver to a delivery
router.post('/assignDriver', assignDeliveryDriver);

// Route to update the delivery status (e.g., ongoing, arrived, completed)
router.post('/updateStatus', updateDeliveryStatus);

// Route to cancel a delivery
router.post('/cancel', cancelDelivery);

// Route to mark the delivery as arrived
router.post('/arrived', deliveryArrived);

// Route to mark the delivery as completed
router.post('/complete', completeDelivery);

export default router;
