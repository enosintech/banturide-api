import express from "express";

import { approveDriverApplication, denyDriverApplication } from "../controllers/adminController";
import { verifyUser } from "../middleware";

const router = express.Router();

router.use(verifyUser);

router.post("/approve-driver-application", approveDriverApplication);
router.post("/deny-driver-application", denyDriverApplication);

export default router;