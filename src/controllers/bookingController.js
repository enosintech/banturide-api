import { FieldValue } from "firebase-admin/firestore";

import { db, getAuth } from "../config/firebase.js";

import { sendDataToClient, wss } from "../../server.js";

// Helper function to get distance between two points
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km
    return distance;
}

// Passenger Booking Request
export const passengerBookingRequest = async (req, res) => {
    const { pickUpLatitude, pickUpLongitude, dropOffLatitude, dropOffLongitude, price, hasThirdStop, thirdStopLatitude, thirdStopLongitude } = req.body;
    const user = getAuth().currentUser;

    if (!user || !pickUpLatitude || !pickUpLongitude || !dropOffLatitude || !dropOffLongitude) {
        return res.status(400).json({
            success: false,
            message: "User, pick-up, and drop-off locations are required.",
        });
    }

    const newBooking = {
        userId: user.uid,
        pickUpLocation: { latitude: pickUpLatitude, longitude: pickUpLongitude },
        dropOffLocation: { latitude: dropOffLatitude, longitude: dropOffLongitude },
        price,
        status: 'pending',
        paymentReceived: false,
        createdAt: FieldValue.serverTimestamp()
    };

    if (hasThirdStop && thirdStopLatitude && thirdStopLongitude) {
        newBooking.thirdStop = { latitude: thirdStopLatitude, longitude: thirdStopLongitude };
    }

    try {
        const bookingRef = db.collection('bookings').doc();
        
        // Save the new booking to Firestore
        await bookingRef.set(newBooking);

        // Retrieve the saved booking data
        const bookingSnapshot = await bookingRef.get();
        const bookingData = bookingSnapshot.data();
        const bookingId = bookingRef.id; // Get the document ID

        // Notify the WebSocket clients
        wss.clients.forEach((client) => {
            if (client.userId === user.uid) {
                sendDataToClient(client, { type: 'requestReceived', message: "Booking Request Received. Searching" });
            }
        });

        // Respond with the booking data and booking ID
        return res.status(200).json({
            success: true,
            message: "Booking Request Received Successfully!",
            booking: {
                bookingId,
                ...bookingData
            }
        });

    } catch (error) {
        console.error("Error in booking a ride:", error);
        return res.status(500).json({
            success: false,
            message: "Error in booking a ride.",
            error: error.message || error,
        });
    }
};

export const searchDriversForBooking = async (req, res) => {
    
    const { bookingId } = req.body;
    const reservedDrivers = new Map();
    const clientReservations = new Map(); 
    const notifiedDrivers = new Set(); 

    let searchTimeout;
    let bookingStatusUnsubscribe; 
    let driverStatusUnsubscribe; 

    try {
        // Fetch booking data
        const bookingSnapshot = await db.collection('bookings').doc(bookingId).get();
        if (!bookingSnapshot.exists) {
            return res.status(404).json({ success: false, message: "Booking not found." });
        }
        const booking = bookingSnapshot.data();

        // Notify client that search has started
        wss.clients.forEach((client) => {
            if (client.userId === booking.userId) {
                sendDataToClient(client, { type: 'searchStarted', message: "Search for drivers has commenced" });
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
                    }

                    // Reserve the driver for the client
                    transaction.update(driverRef, {
                        driverStatus: 'reserved',
                        reservedBy: clientId,
                        reservedUntil: Date.now() + 30000
                    });

                    reservedDrivers.set(driverId, { reservedBy: clientId, reservedUntil: Date.now() + 30000 });
                    clientReservations.set(driverId, clientId);
                
                });

            } catch (error) {
                console.error("Error during transaction:", error);
            }

            // Set a timeout to revert the driver’s status if not picked
            setTimeout(async () => {
                const currentDriverDoc = await db.collection('drivers').doc(driverId).get();
                if (currentDriverDoc.exists && currentDriverDoc.data().driverStatus === 'reserved' && clientReservations.get(driverId) === clientId) {
                    await db.collection('drivers').doc(driverId).update({
                        driverStatus: 'available',
                        reservedBy: null,
                        reservedUntil: null
                    });

                    reservedDrivers.delete(driverId);
                    clientReservations.delete(driverId);
                    notifiedDrivers.delete(driverId); 
                }
            }, 30000);
        };

        // Initial search for available drivers
        const searchDrivers = async () => {
            const availableDriversSnapshot = await db.collection('drivers')
                .where('driverStatus', '==', 'available')
                .get();   

            availableDriversSnapshot.forEach(async doc => {
                const driverData = doc.data();
                const distance = getDistanceFromLatLonInKm(
                    booking.pickUpLocation.latitude,
                    booking.pickUpLocation.longitude,
                    driverData.location.coordinates[0],
                    driverData.location.coordinates[1]
                );

                if (distance <= 5) {
                    const driverId = doc.id;

                    // Check if the driver is already reserved
                    if (reservedDrivers.has(driverId)) return;

                    const driverRef = db.collection('drivers').doc(driverId); 

                    // Reserve the driver for the client
                    reserveDriver(driverId, booking.userId).then(async () => {
                        const updatedDriverDoc = await driverRef.get(); // Get the updated driver document
                        const updatedDriverData = updatedDriverDoc.data();
                        const driverData = {
                            driverId: driverId,
                            ...updatedDriverData
                        }

                        if (!notifiedDrivers.has(driverId)) {
                            wss.clients.forEach((client) => {
                                if (client.userId === booking.userId) {
                                    sendDataToClient(client, {
                                        type: 'driverFound',
                                        message: "A driver has been found initially and is reserved for 30 seconds to be picked",
                                        driver: JSON.stringify(driverData)
                                    });
                                }
                            });
                            notifiedDrivers.add(driverId);
                        }
                    })
                    .catch((error) => {
                        console.log("this", error)
                    })
                }
            });
        };

        // Start the initial search
        await searchDrivers();

        // Set up real-time listener for changes in driver status
        driverStatusUnsubscribe = db.collection('drivers')
            .where('driverStatus', '==', 'available')
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === "added" || change.type === "modified") {
                        const driverData = change.doc.data();
                        const distance = getDistanceFromLatLonInKm(
                            booking.pickUpLocation.latitude,
                            booking.pickUpLocation.longitude,
                            driverData.location.coordinates[0],
                            driverData.location.coordinates[1]
                        );

                        if (distance <= 5) {
                            const driverId = change.doc.id;

                            // Check if the driver is already reserved
                            if (reservedDrivers.has(driverId)) return;

                            const driverRef = db.collection('drivers').doc(driverId); 

                            // Reserve the driver for the client
                            reserveDriver(driverId, booking.userId).then(async () => {
                                const updatedDriverDoc = await driverRef.get(); // Get the updated driver document
                                const updatedDriverData = updatedDriverDoc.data();

                                const driverData = {
                                    driverId: driverId,
                                    ...updatedDriverData
                                }

                                if (!notifiedDrivers.has(driverId)) {
                                    wss.clients.forEach((client) => {
                                        if (client.userId === booking.userId) {
                                            sendDataToClient(client, {
                                                type: 'driverFound',
                                                message: "A driver has been found in real time and is reserved for 30 seconds to be picked",
                                                driver: JSON.stringify(driverData)
                                            });
                                        }
                                    });
                                    notifiedDrivers.add(driverId);
                                }
                            })
                            .catch((error) => {
                                console.log("this", error)
                            })
                        }
                    }
                });
            });

        // Set up real-time listener for booking status changes
        bookingStatusUnsubscribe = db.collection('bookings').doc(bookingId)
            .onSnapshot(async (doc) => {
                const bookingData = doc.data();
                if (bookingData.status === 'confirmed') {
                    // Stop searching
                    if (searchTimeout) clearTimeout(searchTimeout);
                    if (driverStatusUnsubscribe) driverStatusUnsubscribe();
                    if (bookingStatusUnsubscribe) bookingStatusUnsubscribe();

                    wss.clients.forEach((client) => {
                        if (client.userId === booking.userId) {
                            sendDataToClient(client, { type: 'searchComplete', message: "The booking has been confirmed. Search stopped." });
                        }
                    });

                    res.status(200).json({
                        success: true,
                        message: "Booking confirmed. Search has been stopped.",
                    });

                    return;
                }
            });

        // Handle timeout after 60 seconds
        searchTimeout = setTimeout(async () => {
            if (driverStatusUnsubscribe) driverStatusUnsubscribe();
            if (searchTimeout) clearTimeout(searchTimeout); // Stop checking booking status

            if (reservedDrivers.size === 0) {
                wss.clients.forEach((client) => {
                    if (client.userId === booking.userId) {
                        sendDataToClient(client, { type: 'driversNotFoundOnTime', message: "No drivers found within the specified time" });
                    }
                });
                res.status(404).json({ success: false, message: "No drivers found within the time limit." });
            } else {
                wss.clients.forEach((client) => {
                    if (client.userId === booking.userId) {
                        sendDataToClient(client, { type: 'searchComplete', message: "Drivers were found and the search is complete" });
                    }
                });
                res.status(200).json({
                    success: true,
                    message: "Drivers were found and the search is complete.",
                });
            }
        }, 60000);

    } catch (error) {
        console.error("Error in searching drivers for booking:", error);
        if (searchTimeout) clearTimeout(searchTimeout); // Clear timeout in case of error
        if (driverStatusUnsubscribe) driverStatusUnsubscribe(); // Clear Firestore listener
        if (bookingStatusUnsubscribe) bookingStatusUnsubscribe(); // Clear booking status listener
        return res.status(500).json({
            success: false,
            message: "Error in processing your request.",
            error: error.message || error,
        });
    }
};

// Assign Driver to Booking
export const assignDriverToBooking = async (req, res) => {
    const { bookingId, driverId } = req.body;

    try {
        const bookingRef = db.collection('bookings').doc(bookingId);
        const driverRef = db.collection('drivers').doc(driverId);

        const bookingSnapshot = await bookingRef.get();
        const driverSnapshot = await driverRef.get();

        if (!bookingSnapshot.exists || !driverSnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "Booking or driver not found.",
            });
        }

        const driver = driverSnapshot.data();

        await bookingRef.update({
            driverId: driverId,
            status: 'confirmed',
            driverCurrentLocation: driver.location.coordinates
        });

        await driverRef.update({
            driverStatus: 'unavailable',
            reservedUntil: null
        });

        const booking = bookingSnapshot.data();

        const userRef = db.collection('users').doc(booking.userId);

        const userSnapshot = await userRef.get();
        const user = userSnapshot.data();

        // Notify user and driver about driver assignment
        wss.clients.forEach((client) => {
            if(client.userId === booking.userId){
                sendDataToClient(client, { type: 'driverAssigned', message: "You have a new driver", booking: JSON.stringify(booking), driver: JSON.stringify(driver) });
            }
        });
        
        wss.clients.forEach((client) => {
            if(client.userId === driverId){
                sendDataToClient(client, { type: 'driverAssigned', message: "You have a new customer", booking: JSON.stringify(booking), user: JSON.stringify(user)});
            }
        });

        return res.status(200).json({
            success: true,
            message: "Driver selected and booking confirmed successfully!",
        });
    } catch (error) {
        console.error("Error in assigning driver to booking:", error);
        return res.status(500).json({
            success: false,
            message: "Error in assigning driver to booking.",
            error: error.message || error,
        });
    }
};

export const unreserveDriverFromBooking = async (req, res) => {
    const { driverId } = req.body;

    try {
        const driverRef = db.collection('drivers').doc(driverId);
        const driverSnapshot = await driverRef.get();

        if (!bookingSnapshot.exists || !driverSnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "Booking or driver not found.",
            });
        }

        await driverRef.update({
            driverStatus: 'available',
            reservedBy: null,
            reservedUntil: null
        });

        return res.status(200).json({
            success: true,
            message: "Driver rejected successfully"
        })


    } catch (error) {
        console.log(error)

        return res.status(500).json({
            success: false,
            message: "Error in rejecting driver.",
            error: error.message || error,
        })
    }

}

// Cancel Booking
export const cancelBooking = async (req, res) => {
    const { bookingId, reason } = req.body;

    try {
        const bookingRef = db.collection('bookings').doc(bookingId);
        const bookingSnapshot = await bookingRef.get();

        if (!bookingSnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "Booking not found.",
            });
        }

        await bookingRef.update({
            status: 'cancelled'
        });

        const booking = bookingSnapshot.data();
        if (booking.driverId) {
            const driverRef = db.collection('drivers').doc(booking.driverId);
            await driverRef.update({
                status: 'available'
            });

            await bookingRef.update({
                reason: reason
            })

            // Notify driver about booking cancellation
            wss.clients.forEach((client) => {
                if(client.userId === booking.driverId){
                    sendDataToClient(client, { type: 'bookingCancelled', message: "Customer has cancelled the booking", reason: reason });
                }
            });
        }

        // Notify user about booking cancellation

        wss.clients.forEach((client) => {
            if(client.userId === booking.userId){
                sendDataToClient(client, { type: 'bookingCancelled', message: "Your booking has been cancelled successfully" });
            }
        });

        return res.status(200).json({
            success: true,
            message: "Booking cancelled successfully.",
        });
    } catch (error) {
        console.error("Error in cancelling booking:", error);
        return res.status(500).json({
            success: false,
            message: "Error in cancelling booking.",
            error: error.message || error,
        });
    }
};

// Driver at Pickup Location
export const driverAtPickupLocation = async (req, res) => {
    const { bookingId } = req.body;

    try {
        const bookingRef = db.collection('bookings').doc(bookingId);
        const bookingSnapshot = await bookingRef.get();

        if (!bookingSnapshot.exists || bookingSnapshot.data().status !== 'confirmed') {
            return res.status(404).json({
                success: false,
                message: "Invalid booking or booking not in confirmed status.",
            });
        }

        await bookingRef.update({
            driverArrivedAtPickup: true
        });

        // Notify user about driver arrival
        const booking = bookingSnapshot.data();

        wss.clients.forEach((client) => {
            if(client.userId === booking.userId){
                sendDataToClient(client, { type: 'driverArrived', message: "Your driver has arrived at pickup Location", booking: JSON.stringify(booking)});
            }
        })

        return res.status(200).json({
            success: true,
            message: "Driver Arrived at pick location successfully set to true",
        });
    } catch (error) {
        console.error("Error in notifying driver arrival at pickup location:", error);
        return res.status(500).json({
            success: false,
            message: "Error in notifying driver arrival at pickup location.",
            error: error.message || error,
        });
    }
};

// Start Ride
export const startRide = async (req, res) => {

    const { bookingId } = req.body;

    try {
        const bookingRef = db.collection('bookings').doc(bookingId);
        const bookingSnapshot = await bookingRef.get();

        if (!bookingSnapshot.exists || !bookingSnapshot.data().driverArrivedAtPickup) {
            return res.status(400).json({
                success: false,
                message: "You must arrive at the pickup location before starting the ride.",
            });
        }

        await bookingRef.update({
            status: 'ongoing'
        });

        // Notify user about ride start
        const booking = bookingSnapshot.data();

        wss.clients.forEach((client) => {
            if(client.userId === booking.userId){
                sendDataToClient(client, { type: 'rideStarted', message: "You are now on the way", booking: JSON.stringify(booking) });
            }
        })

        return res.status(200).json({
            success: true,
            message: "Ride has started.",
        });
    } catch (error) {
        console.error("Error in starting the ride:", error);
        return res.status(500).json({
            success: false,
            message: "Error in starting the ride.",
            error: error.message || error,
        });
    }
};

// End Ride
export const endRide = async (req, res) => {

    const { bookingId } = req.body;

    try {
        const bookingRef = db.collection('bookings').doc(bookingId);
        const bookingSnapshot = await bookingRef.get();

        if (!bookingSnapshot.exists || bookingSnapshot.data().status !== 'ongoing') {
            return res.status(400).json({
                success: false,
                message: "The ride is not ongoing or booking not found.",
            });
        }

        await bookingRef.update({
            driverArrivedAtDropoff: true,
            status: 'arrived',
            rated: false,
        });

        // Notify user about ride end
        const booking = bookingSnapshot.data();

        wss.clients.forEach((client) => {
            if(client.userId === booking.userId){
                sendDataToClient(client, { type: 'rideEnded', message: "You have arrived at your destination, remember to rate your driver!", booking: JSON.stringify(booking) });
            }
        })

        return res.status(200).json({
            success: true,
            message: "Ride has ended."
        });

    } catch (error) {
        console.error("Error in ending the ride:", error);
        return res.status(500).json({
            success: false,
            message: "Error in ending the ride.",
            error: error.message || error,
        });
    }
};
