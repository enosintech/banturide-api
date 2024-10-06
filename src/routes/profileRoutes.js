import express from 'express';

import {
    getUserProfile,
    editUserName,
    toggleNotifications,
    toggleDriverShouldCall,
    toggleDriverAvailability,
    getDriverInfo,
    getTotalEarnings,
    updateDriverStatus,
    getDriverStatistics,
    verifyDriverProfile,
    checkDriverApplication,
} from '../controllers/profileController.js';

import { verifyUser } from '../middleware/index.js';

const router = express.Router();

router.use(verifyUser);

// Define routes USERS
router.get('/get-user-profile', getUserProfile); // Changed to use the current user
router.post('/edit-username', editUserName);
router.post('/toggle-notifications', toggleNotifications);
router.post('/toggle-driver-should-call', toggleDriverShouldCall);

// Define routes DRIVERS
router.get('/get-driver-info', getDriverInfo); // Changed to use the current user
router.post('/verify-driver-profile', verifyDriverProfile);
router.get("/check-application-status", checkDriverApplication);
router.post('/toggle-driver-availability', toggleDriverAvailability); // Changed to use the current user
router.get('/get-driver-total-earnings', getTotalEarnings); // Get the total earnings of the driver
router.post('/update-driver-status', updateDriverStatus); // Update the driver's status
router.get('/get-driver-statistics', getDriverStatistics); // Get driver statistics

export default router;
