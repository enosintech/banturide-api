import { FieldValue } from "firebase-admin/firestore";

import { db } from "../config/firebase.js";

import { sendDataToClient } from "../../server.js";
  
export const updateDriverLocation = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    const { latitude, longitude } = req.body;

    if (typeof latitude !== 'number' || typeof longitude !== 'number' || 
        isNaN(latitude) || isNaN(longitude) || 
        latitude < -90 || latitude > 90 || 
        longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: "Invalid latitude or longitude values", success: false });
    }

    try {
        const driverRef = db.collection('drivers').doc(user.uid);

        await driverRef.update({
            location: {
                type: "Point",
                coordinates: [latitude, longitude]
            },
            updatedAt: FieldValue.serverTimestamp()
        });

        return res.status(200).json({ message: "Driver Location updated successfully", success: true });

    } catch (error) {
        console.error("Error updating driver location:", error);
        return res.status(500).json({ error: "Error updating driver location", success: false });
    }
};

export const updateBookingLocation = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    const { bookingId, driverId } = req.body;

    if (!bookingId || !driverId) {
        return res.status(400).json({ error: "Booking ID and Driver ID are required" });
    }

    try {
        const bookingRef = db.collection("bookings").doc(bookingId);
        const driverRef = db.collection("drivers").doc(driverId);

        const bookingDoc = await bookingRef.get();

        if (!bookingDoc.exists) {
            return res.status(404).json({ error: "Booking not found" , success: false });
        }

        const booking = bookingDoc.data();

        let listener;
        let bookingListener;

        const stopListeners = () => {
            if (listener) {
                listener(); 
                console.log(`Driver location listener stopped for booking ${bookingId}`);
            }
            if (bookingListener) {
                bookingListener();
                console.log(`Booking status listener stopped for booking ${bookingId}`);
            }
        };

        listener = driverRef.onSnapshot(async (snapshot) => {
            if (!snapshot.exists) {
                console.error(`Driver document ${driverId} does not exist`);
                stopListeners();
                return res.status(404).json({ error: `Driver document ${driverId} does not exist` , success: false });
            }

            const driverData = snapshot.data();
            const driverLocation = driverData.location.coordinates;

            if(driverData.driverStatus === "available"){
                stopListeners();

                sendDataToClient(booking.userId, "notification", { type: "driverReleased", message: "Driver released and listening for location has stopped" })
            }

            await bookingRef.update({
                driverCurrentLocation: driverLocation,
                updatedAt: FieldValue.serverTimestamp()
            });

            const updatedBookingSnapshot = await bookingRef.get();
            const updatedBooking = updatedBookingSnapshot.data();

            if(driverData.driverStatus !== "available"){
                sendDataToClient(booking.userId, "notification", { type: "locationUpdated", message: "Your driver location has been updated", booking: JSON.stringify(updatedBooking)})
            }

        });

        bookingListener = bookingRef.onSnapshot( async (snapshot) => {
            if(!snapshot.exists) {
                console.error(`Booking document ${bookingId} does not exist`);
                stopListeners();
                return res.status(404).json({ error: `Booking document ${bookingId} does not exist` , success: false });
            }

            const bookingData = snapshot.data();

            if(["completed", "arrived", "cancelled"].includes(bookingData?.status)) {
                stopListeners();
                console.log(`Booking ${bookingId} has been ${bookingData?.status}. Stopping listeners.`);
            }
        })

        return res.status(200).json({ success: true, message: "Driver location update process started" });

    } catch (error) {
        console.error("Error getting trip location:", error);
        return res.status(500).json({ error: "Error getting trip location" , success: false });
    }
};

export const updateDeliveryLocation = async (req, res) => {

    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    const { deliveryId, driverId } = req.body;

    if (!deliveryId || !driverId) {
        return res.status(400).json({ error: "deliveryID and DriverID are required", success: false });
    }

    try {

        const deliveryRef = db.collection("deliveries").doc(deliveryId);
        const driverRef = db.collection("drivers").doc(driverId);

        const deliveryDoc = await deliveryRef.get();

        if (!deliveryDoc.exists) {
            return res.status(404).json({ error: "delivery not found" , success: false });
        }

        const delivery = deliveryDoc.data();

        let listener;
        let deliveryListener;

        const stopListeners = () => {
            if (listener) {
                listener(); 
                console.log(`Driver location listener stopped for delivery ${deliveryId}`);
            }
            if (deliveryListener) {
                deliveryListener();
                console.log(`Booking status listener stopped for delivery ${deliveryId}`);
            }
        };

        listener = driverRef.onSnapshot(async (snapshot) => {
            if (!snapshot.exists) {
                console.error(`Driver document ${driverId} does not exist`);
                stopListeners();
                return res.status(404).json({ error: `Driver document ${driverId} does not exist` , success: false });
            }

            const driverData = snapshot.data();
            const driverLocation = driverData.location.coordinates;

            if(driverData.driverStatus === "available"){
                stopListeners();

                sendDataToClient(delivery.userId, "notification", { type: "driverReleased", message: "Driver released and listening for location has stopped" })
            }

            await deliveryRef.update({
                driverCurrentLocation: driverLocation,
                updatedAt: FieldValue.serverTimestamp()
            });

            const updatedDeliverySnapshot = await deliveryRef.get();
            const updatedDelivery = updatedDeliverySnapshot.data();

            if(driverData.driverStatus !== "available"){
                sendDataToClient(delivery.userId, "notification", { type: "locationUpdated", message: "Your driver location has been updated", booking: JSON.stringify(updatedDelivery)})
            }

        });

        return res.status(200).json({ success: true, message: "Delivery location update process started" });

    } catch (error) {
        console.error("Error getting trip location:", error);
        return res.status(500).json({ error: "Error getting trip location" , success: false });
    }
}
