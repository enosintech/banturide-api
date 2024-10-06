import express from "express";

import { approveDriverApplication, denyDriverApplication } from "../controllers/adminController.js";

const router = express.Router();

router.post("/approve-driver-application", approveDriverApplication);
router.post("/deny-driver-application", denyDriverApplication);

export default router;