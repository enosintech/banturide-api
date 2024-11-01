import express from "express";
import { 
    approveDriverApplication, 
    denyDriverApplication, 
    getAllComplaints, 
    getAllDriverApplications,
    createAdmin,
    loginAdmin,
    getDriver // Import the new function
} from "../controllers/adminController.js";

const router = express.Router();

// Admin creation and login routes
router.post("/create-admin", createAdmin);
router.post("/login-admin", loginAdmin);

// Driver applications and complaints routes
router.get("/get-driver-applications", getAllDriverApplications);
router.get("/get-complaints", getAllComplaints);
router.get("/get-driver/:driverId", getDriver); // Add the get-driver route
router.post("/approve-driver-application", approveDriverApplication);
router.post("/deny-driver-application", denyDriverApplication);

export default router;
