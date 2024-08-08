import { FieldValue } from "firebase-admin/firestore";

import { db } from "../config/firebase.js";

import { sendDataToClient, wss } from "../../server.js";

const calculateDistance = (driverLocation, dropoffLocation) => {
    const earthRadiusKm = 6371; // Radius of the Earth in kilometers
    const [lat1, lon1] = driverLocation;
    const { latitude: lat2, longitude: lon2 } = dropoffLocation;

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = earthRadiusKm * c;
    return distance;
};

const toRadians = (degrees) => {
    return degrees * (Math.PI / 180);
};
  
// Update driver location
export const updateDriverLocation = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    const { latitude, longitude } = req.body;

    try {
        const driverRef = db.collection('drivers').doc(user.uid);

        await driverRef.update({
            location: {
                type: "Point",
                coordinates: [latitude, longitude]
            },
            updatedAt: FieldValue.serverTimestamp()
        });

        return res.status(200).json({ message: "Location updated successfully" });

    } catch (error) {
        console.error("Error updating driver location:", error);
        return res.status(500).json({ error: error.message });
    }
};

export const updateBookingLocation = async (req, res) => {
    const user = req.user;

    if(!user){
        return res.status(403).json({ error: "Unauthorized"});
    }

    const { bookingId, driverId } = req.body;

    try {  
        const bookingRef = db.collection("bookings").doc(bookingId);
        const driverRef = db.collection("drivers").doc(driverId);

        const bookingDoc = await bookingRef.get();

        const booking = bookingDoc.data();
        const dropOffLocation = booking.dropOffLocation;

        let listener;

        const stopListening = () => {
            if (listener) {
                listener(); 
                console.log(`Listener stopped for booking ${bookingId}`);
            }
        };

        listener = driverRef.onSnapshot((snapshot) => {
            if (snapshot.exists) {
                const driverData = snapshot.data();
                const driverLocation = driverData.location.coordinates; 

                const distance = calculateDistance(driverLocation, dropOffLocation);

                if (distance < 1) {
                    stopListening(); 
                }

                bookingRef.update({
                    driverCurrentLocation: driverLocation,
                    updatedAt: FieldValue.serverTimestamp()
                });

                wss.clients.forEach((client) => {
                    if (client.userId === booking.userId) {
                        sendDataToClient(client, { type: 'locationUpdated', message: "Your current location has been updated", booking: JSON.stringify(booking) });
                    }
                });

            } else {
                console.error(`Driver document ${driverId} does not exist`);
                return res.status(404).json({ error: `Driver document ${driverId} does not exist` });
            }
        });

        const handleBookingCompletionOrCancellation = () => {
            if (booking.status === 'completed' || booking.status === 'arrived' || booking.status === 'cancelled') {
                stopListening(); 
            }
        };

        setInterval(handleBookingCompletionOrCancellation, 300000); 

    } catch (error) {
        console.log("Error getting trip location:", error);
        return res.status(500).json({ error: error.message });
    }
}
