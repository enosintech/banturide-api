import { FieldValue } from "firebase-admin/firestore";

import { db } from "../config/firebase.js";

import { sendDataToClient, wss } from "../../server.js";

// Add a Review
export const addReview = async (req, res) => {

    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    const { bookingId, driverId, rating, comments } = req.body;

    if (!bookingId || !driverId || !rating) {
        return res.status(400).json({ error: "Booking ID, Driver ID, and Rating are required" });
    }

    try {

        const review = {
            userId: user.uid,
            bookingId,
            driverId,
            rating,
            comments : [...comments],
            createdAt: FieldValue.serverTimestamp()
        };

        const reviewRef = db.collection('reviews').doc();
        await reviewRef.set(review);

        // Update driver's rating
        const driverRef = db.collection('drivers').doc(driverId);
        const driverDoc = await driverRef.get();

        const bookingRef = db.collection("bookings").doc(bookingId);
        const bookingDoc = await bookingRef.get();

        if (!driverDoc.exists || !bookingDoc.exists) {
            return res.status(404).json({ error: "Driver or Booking not found" });
        }

        const driverData = driverDoc.data();
        const booking = bookingDoc.data();

        const knownForArray = driverData.knownFor;

        const driverRating = driverData.rated === true  ? (driverData.ratingsSum + review.rating) / (driverData.numberOfRatings + 1) : review.rating

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
            rated: true,
            ratingsSum: FieldValue.increment(review.rating),
            numberOfRatings: FieldValue.increment(1),
            driverRating: driverRating,
            knownFor: knownForArray
        });

        wss.clients.forEach((client) => {
            if(client.userId === booking.driverId){
                sendDataToClient(client, { type: 'ratingReceived', message: "You have received a rating" });
            }
        })

        res.status(201).json({ message: "Review added successfully" });
    } catch (error) {
        console.error("Error adding review:", error);
        res.status(500).json({ error: error.message });
    }
};

// Get Reviews for a Driver
export const getDriverReviews = async (req, res) => {

    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    try {
        const reviewsSnapshot = await db.collection('reviews').where('driverId', '==', user.uid).get();
        const reviews = [];

        reviewsSnapshot.forEach(doc => {
            reviews.push(doc.data());
        });

        res.status(200).json({ reviews });
        
    } catch (error) {
        console.error("Error getting driver reviews:", error);
        res.status(500).json({ error: error.message });
    }

};
