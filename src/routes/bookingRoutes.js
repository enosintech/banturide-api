import express from "express";

import { 
    passengerBookingRequest,
    searchDriversForBooking,
    cancelBooking,
    assignDriverToBooking,
    driverAtPickupLocation,
    startRide,
    endRide,
} from "../controllers/bookingController.js";
import { verifyUser } from "../middleware/index.js";

const router = express.Router();

router.use(verifyUser);

// User post routes
router.post("/make-book-request", passengerBookingRequest);
router.post("/cancel-booking-request", cancelBooking);
router.post("/search-driver", searchDriversForBooking);
router.post("/select-driver", assignDriverToBooking);

// Driver post routes
router.post("/driver-at-pickup-location", driverAtPickupLocation);
router.post("/start-ride", startRide);
router.post("/end-ride", endRide);

export default router;

