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
    getDriverStatistics,
    updateDriverInfo,
    uploadDriverProfilePicture,
    removeDriverProfilePicture
} from '../controllers/profileController.js';
import { verifyUser } from '../middleware/index.js';

const router = express.Router();

router.use(verifyUser);

// Define routes USERS
router.get('/get-user-profile', getUserProfile); // Changed to use the current user
router.post('/edit-username', editUserName);
router.post('/uploadUserProfilePicture', uploadProfilePicture);
router.delete('/removeUserProfilePicture', removeProfilePicture);
router.post('/toggle-notifications', toggleNotifications);
router.post('/toggle-driver-should-call', toggleDriverShouldCall);

// Define routes DRIVERS
router.put('/edit-driver', editDriverProfile); // Changed to use the current user
router.post('/uploadDriverProfilePicture', uploadDriverProfilePicture);
router.delete('/removeDriverProfilePicture', removeDriverProfilePicture);
router.post('/upload-driver-info', updateDriverInfo);
router.post('/toggle-driver-availability', toggleDriverAvailability); // Changed to use the current user
router.get('/get-driver-info', getDriverInfo); // Changed to use the current user
router.get('/get-driver-total-earnings', getTotalEarnings); // Get the total earnings of the driver
router.post('/update-driver-status', updateDriverStatus); // Update the driver's status
router.get('/get-driver-statistics', getDriverStatistics); // Get driver statistics

export default router;
