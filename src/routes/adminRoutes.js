import express from "express";

import { approveDriverApplication, denyDriverApplication, getAllComplaints, getAllDriverApplications } from "../controllers/adminController.js";

const router = express.Router();

router.get("/get-driver-applications", getAllDriverApplications);
router.get("/get-complaints", getAllComplaints)
router.post("/approve-driver-application", approveDriverApplication);
router.post("/deny-driver-application", denyDriverApplication);

export default router;