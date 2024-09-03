import { FieldValue } from "firebase-admin/firestore";

import { db } from "../config/firebase.js";

import { sendDataToClient } from "../../server.js";

export const addRideReview = async (req, res) => {

    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    const { bookingId, driverId, rating, comments = [] } = req.body;

    if (!bookingId || !driverId || !rating) {
        return res.status(400).json({ error: "Booking ID, Driver ID, and Rating are required", success: false });
    }

    if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5", success: false });
    }

    try {

        const review = {
            userId: user.uid,
            bookingId,
            bookingType: "ride",
            driverId,
            rating,
            comments : Array.isArray(comments) ? comments : [],
            createdAt: FieldValue.serverTimestamp()
        };

        const reviewRef = db.collection('reviews').doc();
        await reviewRef.set(review);

        const driverRef = db.collection('drivers').doc(driverId);
        const driverDoc = await driverRef.get();

        const bookingRef = db.collection("bookings").doc(bookingId);
        const bookingDoc = await bookingRef.get();

        if (!driverDoc.exists || !bookingDoc.exists) {
            return res.status(404).json({ error: "Driver or Booking not found", success: false });
        }

        const driverData = driverDoc.data();
        const booking = bookingDoc.data();

        const driverRating = ( driverData.ratingsSum + review.rating ) / (driverData.numberOfRatings + 1)
       
        const knownForArray = driverData.knownFor;
        
        let indexToRemove = knownForArray.indexOf("New Driver");
        if (indexToRemove !== -1) {
            knownForArray.splice(indexToRemove, 1);
        }

        comments.forEach((comment, idx) => {
            if (!knownForArray.includes(comment)) {
                knownForArray.push(comment);
            }
        })

        await driverRef.update({
            ratingsSum: FieldValue.increment(review.rating),
            numberOfRatings: FieldValue.increment(1),
            driverRating,
            knownFor: knownForArray
        });

        await bookingRef.update({
            rated: true
        })

        const updatedBookingDoc = await bookingRef.get();

        const updatedBooking = updatedBookingDoc.data();

        sendDataToClient(booking.driverId, "notification", { type: 'ratingReceived', notificationId:`${booking?.driverId}-${Date.now()}`, message: `You have received a rating of ${rating}.` })

        res.status(201).json({ message: "Review added successfully", success: true, booking: updatedBooking});
    } catch (error) {
        console.error("Error adding review:", error);
        res.status(500).json({ message: "Error adding review", success: false });
    }
};

export const addDeliveryReview = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    const { deliveryId, driverId, rating, comments = [] } = req.body;

    if (!deliveryId || !driverId || !rating) {
        return res.status(400).json({ error: "Booking ID, Driver ID, and Rating are required", success: false });
    }

    if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5", success: false });
    }

    try {
        const review = {
            userId: user.uid,
            bookingId: deliveryId,
            bookingType: "delivery",
            driverId,
            rating,
            comments : Array.isArray(comments) ? comments : [],
            createdAt: FieldValue.serverTimestamp()
        };

        const reviewRef = db.collection('reviews').doc();
        await reviewRef.set(review);

        const driverRef = db.collection('drivers').doc(driverId);
        const driverDoc = await driverRef.get();

        const deliveryRef = db.collection("deliveries").doc(deliveryId);
        const deliveryDoc = await deliveryRef.get();

        if (!driverDoc.exists ) {
            return res.status(404).json({ error: "Driver not found", success: false });
        }

        if (!deliveryDoc.exists) {
            return res.status(404).json({ error: "delivery not found", success: false });
        }

        const driverData = driverDoc.data();
        const delivery = deliveryDoc.data();

        const driverRating = ( driverData.ratingsSum + review.rating ) / (driverData.numberOfRatings + 1)
       
        const knownForArray = driverData.knownFor;
        
        let indexToRemove = knownForArray.indexOf("New Driver");
        if (indexToRemove !== -1) {
            knownForArray.splice(indexToRemove, 1);
        }

        comments.forEach((comment, idx) => {
            if (!knownForArray.includes(comment)) {
                knownForArray.push(comment);
            }
        })

        await driverRef.update({
            ratingsSum: FieldValue.increment(review.rating),
            numberOfRatings: FieldValue.increment(1),
            driverRating,
            knownFor: knownForArray
        });

        await deliveryRef.update({
            rated: true
        })

        const updatedDeliveryDoc = await deliveryRef.get();

        const updatedDelivery = updatedDeliveryDoc.data();

        sendDataToClient(delivery.driverId, "notification", { type: 'ratingReceived', notificationId:`${delivery?.driverId}-${Date.now()}`, message: `You have received a rating of ${rating}.` })

        return res.status(201).json({ message: "Review added successfully", success: true, booking: updatedDelivery});

    } catch (error) {
        console.error("Error adding review:", error);
        res.status(500).json({ message: "Error adding review", success: false });
    }
}

export const reportDriver = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    const { bookingId, driverId, reason, comment } = req.body;

    if(!bookingId || !driverId || !reason ) {
        return res.status(400).json({ success: false, message: "Booking ID, Driver Id, and reason for reporting are required"});
    }

    try {

        const report = {
            userID: user.uid,
            bookingId,
            driverId,
            reason,
            comment,
            createdAt: FieldValue.serverTimestamp()
        }

        const reportRef = db.collection("reports").doc();
        
        await reportRef.set(report);

        return res.status(201).json({ success: false, message: "Driver Reported Successfully"})

    } catch (error) {
        console.error("Error Reporting Driver", error);
        return res.status(400).json({ success: false, message: "Error Reporting Driver"})
    }
};

// Get Reviews for a Driver
export const getDriverReviews = async (req, res) => {

    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized" , success: false});
    }

    try {
        const reviewsSnapshot = await db.collection('reviews').where('driverId', '==', user.uid).get();
        const reviews = [];

        if (reviewsSnapshot.empty) {
            return res.status(200).json({ reviews: [], success: true, message: "No reviews found" });
        }

        reviewsSnapshot.forEach(doc => {
            reviews.push(doc.data());
        });

        res.status(200).json({ reviews, success: true });
        
    } catch (error) {
        console.error("Error getting driver reviews:", error);
        res.status(500).json({ error: "Error getting driver reviews", success: false  });
    }

};
