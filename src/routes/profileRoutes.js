import express from 'express';

import {
    getUserProfile,
    editUserName,
    toggleNotifications,
    toggleDriverShouldCall,
    getDriverInfo,
    updateDriverStatus,
    getDriverStatistics,
    verifyDriverProfile,
    checkDriverApplication,
    getTotalTrips,
} from '../controllers/profileController.js';

import { verifyUser } from '../middleware/index.js';

const router = express.Router();

router.use(verifyUser);

router.get('/get-user-profile', getUserProfile);
router.post('/edit-username', editUserName);
router.post('/toggle-notifications', toggleNotifications);
router.post('/toggle-driver-should-call', toggleDriverShouldCall);

router.get('/get-driver-info', getDriverInfo); 
router.post('/verify-driver-profile', verifyDriverProfile);
router.get("/check-application-status", checkDriverApplication);
router.post("/update-driver-status", updateDriverStatus);
router.get("/get-total-trips", getTotalTrips);
router.get('/get-driver-statistics', getDriverStatistics);

export default router;
