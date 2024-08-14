import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";
import { sendDataToClient, wss } from "../../server.js";

// Helper Function to calculate distance
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km
    return distance;
}

// Helper Function to calculate fare
function calculateFare(vehicleType, distance, weight, dimensions, timeOfDay, stops = 0, tollCharges = 0) {
    const baseRates = {
        "motorcycle": 21.5, // ZMW
        "car": 34.4,
        "pickup": 43.0,
        "van7ft": 53.5,
        "van9ft": 64.5,
        "lorry10ft": 76.5,
        "lorry14ft": 93.5,
        "lorry17ft": 120.0,
        "lorry20ft": 150.0
    };
    let fare = baseRates[vehicleType] + (distance * 1.5); // Example distance multiplier

    // Additional surcharges
    if (21 <= timeOfDay || timeOfDay <= 6) fare *= 1.25; // Night time multiplier
    if (weight > 50) fare += (weight - 50) * 0.2; // Surcharge for weight
    fare += stops * 5; // Surcharge for additional stops
    fare += tollCharges;

    return fare;
}

// Endpoint: Request Delivery
export const requestDelivery = async (req, res) => {
    const { pickUpLatitude, pickUpLongitude, dropOffLatitude, dropOffLongitude, vehicleType, parcelDetails, timeOfDay, stops, tollCharges } = req.body;
    const user = req.user;

    if (!user) return res.status(400).json({ success: false, message: "Unauthorized" });
    if (!pickUpLatitude || !pickUpLongitude || !dropOffLatitude || !dropOffLongitude) {
        return res.status(400).json({ success: false, message: "Pick-up and drop-off locations are required." });
    }

    const distance = getDistanceFromLatLonInKm(pickUpLatitude, pickUpLongitude, dropOffLatitude, dropOffLongitude);
    const price = calculateFare(vehicleType, distance, parcelDetails.weight, parcelDetails.dimensions, timeOfDay, stops, tollCharges);

    const newDelivery = {
        userId: user.uid,
        pickUpLocation: { latitude: pickUpLatitude, longitude: pickUpLongitude },
        dropOffLocation: { latitude: dropOffLatitude, longitude: dropOffLongitude },
        vehicleType,
        parcelDetails,
        price,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp()
    };

    try {
        const deliveryRef = db.collection('delivery').doc();
        await deliveryRef.set(newDelivery);
        const deliverySnapshot = await deliveryRef.get();

        return res.status(200).json({
            success: true,
            message: "Delivery request received successfully!",
            delivery: { id: deliveryRef.id, ...deliverySnapshot.data() }
        });
    } catch (error) {
        console.log("Error in requesting delivery:", error);
        return res.status(500).json({ success: false, message: "Error in requesting delivery." });
    }
};

// Endpoint: Search Drivers for Delivery (Real-time)
export const searchDriversForDelivery = async (req, res) => {
    const { deliveryId } = req.body;
    const reservedDrivers = new Map();
    const notifiedDrivers = new Set();

    let searchTimeout;
    let deliveryStatusUnsubscribe;
    let driverStatusUnsubscribe;

    try {
        // Fetch delivery data
        const deliverySnapshot = await db.collection('delivery').doc(deliveryId).get();
        if (!deliverySnapshot.exists) {
            return res.status(404).json({ success: false, message: "Delivery request not found." });
        }
        const delivery = deliverySnapshot.data();

        // Notify client that search has started
        wss.clients.forEach((client) => {
            if (client.userId === delivery.userId) {
                sendDataToClient(client, { type: 'searchStarted', message: "Search for delivery drivers has commenced" });
            }
        });

        // Function to reserve a driver
        const reserveDriver = async (driverId, clientId) => {
            try {
                await db.runTransaction(async (transaction) => {
                    const driverRef = db.collection('drivers').doc(driverId);
                    const driverDoc = await transaction.get(driverRef);

                    if (!driverDoc.exists) {
                        console.log('Driver does not exist');
                        return;
                    }

                    // Reserve the driver for the client
                    transaction.update(driverRef, {
                        driverStatus: 'reserved',
                        reservedBy: clientId,
                        reservedUntil: Date.now() + 30000,
                        driverDelivery: false // Mark driver as not available for other deliveries
                    });

                    reservedDrivers.set(driverId, { reservedBy: clientId, reservedUntil: Date.now() + 30000 });
                });

                // Notify client about the reserved driver
                const reservedDriverData = await db.collection('drivers').doc(driverId).get();
                const driverData = reservedDriverData.data();

                wss.clients.forEach((client) => {
                    if (client.userId === clientId) {
                        sendDataToClient(client, {
                            type: 'driverFound',
                            notificationId: driverId,
                            message: "A driver has been found and is reserved for 30 seconds",
                            driver: JSON.stringify(driverData),
                        });
                    }
                });

                // Set a timeout to revert the driver’s status if not picked
                setTimeout(async () => {
                    const currentDriverDoc = await db.collection('drivers').doc(driverId).get();
                    if (currentDriverDoc.exists && currentDriverDoc.data().driverStatus === 'reserved' && reservedDrivers.get(driverId)?.reservedBy === clientId) {
                        await db.collection('drivers').doc(driverId).update({
                            driverStatus: 'available',
                            reservedBy: null,
                            reservedUntil: null,
                            driverDelivery: true // Mark driver as available again
                        });

                        reservedDrivers.delete(driverId);
                        notifiedDrivers.delete(driverId);
                    }
                }, 30000);

            } catch (error) {
                console.error("Error during driver reservation:", error);
            }
        };

        // Initial search for available drivers
        const searchDrivers = async () => {
            const availableDriversSnapshot = await db.collection('drivers')
                .where('driverStatus', '==', 'available')
                .where('driverDelivery', '==', true)
                .where('vehicleType', '==', delivery.vehicleType)
                .get();

            availableDriversSnapshot.forEach(async doc => {
                const driverData = doc.data();
                const distance = getDistanceFromLatLonInKm(
                    delivery.pickUpLocation.latitude,
                    delivery.pickUpLocation.longitude,
                    driverData.location.coordinates[0],
                    driverData.location.coordinates[1]
                );

                if (distance <= 10) { // Within 10 miles
                    const driverId = doc.id;

                    // Check if the driver is already reserved
                    if (reservedDrivers.has(driverId)) return;

                    // Reserve the driver for the client
                    await reserveDriver(driverId, delivery.userId);
                }
            });
        };

        // Start the initial search
        await searchDrivers();

        // Set up real-time listener for changes in driver status
        driverStatusUnsubscribe = db.collection('drivers')
            .where('driverStatus', '==', 'available')
            .where('driverDelivery', '==', true)
            .where('vehicleType', '==', delivery.vehicleType)
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === "added" || change.type === "modified") {
                        const driverData = change.doc.data();
                        const distance = getDistanceFromLatLonInKm(
                            delivery.pickUpLocation.latitude,
                            delivery.pickUpLocation.longitude,
                            driverData.location.coordinates[0],
                            driverData.location.coordinates[1]
                        );

                        if (distance <= 10) { // Within 10 miles
                            const driverId = change.doc.id;

                            // Check if the driver is already reserved
                            if (reservedDrivers.has(driverId)) return;

                            // Reserve the driver for the client
                            await reserveDriver(driverId, delivery.userId);
                        }
                    }
                });
            });

        // Handle timeout after 2 minutes
        searchTimeout = setTimeout(async () => {
            if (driverStatusUnsubscribe) driverStatusUnsubscribe();
            if (searchTimeout) clearTimeout(searchTimeout);

            if (reservedDrivers.size === 0) {
                wss.clients.forEach((client) => {
                    if (client.userId === delivery.userId) {
                        sendDataToClient(client, { type: 'driversNotFoundOnTime', message: "No drivers found within the specified time" });
                    }
                });
                res.status(404).json({ success: false, message: "No drivers found within the time limit." });
            } else {
                wss.clients.forEach((client) => {
                    if (client.userId === delivery.userId) {
                        sendDataToClient(client, { type: 'searchComplete', message: "Drivers were found and the search is complete" });
                    }
                });
                res.status(200).json({
                    success: true,
                    message: "Drivers were found and the search is complete.",
                });
            }
        }, 120000);

    } catch (error) {
        console.error("Error in searching drivers for delivery:", error);
        if (searchTimeout) clearTimeout(searchTimeout); // Clear timeout in case of error
        if (driverStatusUnsubscribe) driverStatusUnsubscribe(); // Clear Firestore listener
        return res.status(500).json({
            success: false,
            message: "Error in processing your request.",
        });
    }
};

// Endpoint: Assign Delivery Driver
export const assignDeliveryDriver = async (req, res) => {
    const { deliveryId, driverId } = req.body;

    try {
        const deliveryRef = db.collection('delivery').doc(deliveryId);
        const deliverySnapshot = await deliveryRef.get();

        if (!deliverySnapshot.exists) return res.status(404).json({ success: false, message: "Delivery not found." });

        await deliveryRef.update({ driverId, status: 'ongoing' });
        const updatedDeliverySnapshot = await deliveryRef.get();

        return res.status(200).json({ success: true, message: "Driver assigned successfully!", delivery: updatedDeliverySnapshot.data() });
    } catch (error) {
        console.error("Error in assigning delivery driver:", error);
        return res.status(500).json({ success: false, message: "Error in assigning delivery driver." });
    }
};

// Endpoint: Update Delivery Status
export const updateDeliveryStatus = async (req, res) => {
    const { deliveryId, status } = req.body;

    try {
        const deliveryRef = db.collection('delivery').doc(deliveryId);
        await deliveryRef.update({ status });

        return res.status(200).json({ success: true, message: "Delivery status updated successfully!" });
    } catch (error) {
        console.error("Error in updating delivery status:", error);
        return res.status(500).json({ success: false, message: "Error in updating delivery status." });
    }
};

// Endpoint: Cancel Delivery
export const cancelDelivery = async (req, res) => {
    const { deliveryId, reason } = req.body;

    try {
        const deliveryRef = db.collection('delivery').doc(deliveryId);
        await deliveryRef.update({ status: 'cancelled', cancellationReason: reason });

        return res.status(200).json({ success: true, message: "Delivery cancelled successfully." });
    } catch (error) {
        console.error("Error in cancelling delivery:", error);
        return res.status(500).json({ success: false, message: "Error in cancelling delivery." });
    }
};

// Endpoint: Driver Arrived
export const deliveryArrived = async (req, res) => {
    const { deliveryId } = req.body;

    try {
        const deliveryRef = db.collection('delivery').doc(deliveryId);
        await deliveryRef.update({ status: 'arrived' });

        return res.status(200).json({ success: true, message: "Driver arrived at the destination." });
    } catch (error) {
        console.error("Error in marking delivery as arrived:", error);
        return res.status(500).json({ success: false, message: "Error in marking delivery as arrived." });
    }
};

// Endpoint: Complete Delivery
export const completeDelivery = async (req, res) => {
    const { deliveryId } = req.body;

    try {
        const deliveryRef = db.collection('delivery').doc(deliveryId);
        await deliveryRef.update({ status: 'completed' });

        return res.status(200).json({ success: true, message: "Delivery completed successfully!" });
    } catch (error) {
        console.error("Error in completing delivery:", error);
        return res.status(500).json({ success: false, message: "Error in completing delivery." });
    }
};
