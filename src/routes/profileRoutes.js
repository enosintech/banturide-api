import express from 'express';

import {
    getUserProfile,
    editUserName,
    uploadProfilePicture,
    removeProfilePicture,
    toggleNotifications,
    toggleDriverShouldCall,
    editDriverProfile,
    toggleDriverAvailability,
    getDriverInfo,
    getTotalEarnings,
    updateDriverStatus,
    getDriverStatistics
} from '../controllers/profileController.js';
import { verifyUser } from '../middleware/index.js';

const router = express.Router();

router.use(verifyUser);

// Define routes USERS
router.get('/profile', getUserProfile); // Changed to use the current user
router.post('/profile/name', editUserName);
router.post('/profile/upload', uploadProfilePicture);
router.delete('/profile/remove', removeProfilePicture);
router.post('/toggle-notifications', toggleNotifications);
router.post('/toggle-driver-should-call', toggleDriverShouldCall);

// Define routes DRIVERS
router.put('/edit', editDriverProfile); // Changed to use the current user
router.post('/toggle-availability', toggleDriverAvailability); // Changed to use the current user
router.get('/info', getDriverInfo); // Changed to use the current user
router.get('/total-earnings', getTotalEarnings); // Get the total earnings of the driver
router.post('/update-status', updateDriverStatus); // Update the driver's status
router.get('/statistics', getDriverStatistics); // Get driver statistics

export default router;
