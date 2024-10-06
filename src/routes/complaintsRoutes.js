import express from "express";

import { fileComplaint } from "../controllers/complaintController.js";

import { verifyUser } from "../middleware/index.js";

const router = express.Router();

router.use(verifyUser);

router.post("/file-complaint", fileComplaint)

export default router;