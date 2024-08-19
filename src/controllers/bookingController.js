import { FieldValue } from "firebase-admin/firestore";

import { db } from "../config/firebase.js";

import { sendDataToClient, wss } from "../../server.js";

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
}

export const passengerBookingRequest = async (req, res) => {
    const { pickUpLatitude, pickUpLongitude, dropOffLatitude, dropOffLongitude, price, hasThirdStop, thirdStopLatitude, thirdStopLongitude, seats, paymentMethod } = req.body;

    const user = req.user;

    if(!user) {
        return res.status(400).json({
            success: false,
            message: "Unauthorized"
        })
    }

    if ( !pickUpLatitude || !pickUpLongitude || !dropOffLatitude || !dropOffLongitude) {
        return res.status(400).json({
            success: false,
            message: "pick-up, and drop-off locations are required.",
        });
    }

    const newBooking = {
        userId: user.uid,
        pickUpLocation: { latitude: pickUpLatitude, longitude: pickUpLongitude },
        dropOffLocation: { latitude: dropOffLatitude, longitude: dropOffLongitude },
        price,
        seats,
        paymentMethod,
        hasThirdStop,
        status: 'pending',
        paymentReceived: false,
        createdAt: FieldValue.serverTimestamp()
    };

    if (hasThirdStop && thirdStopLatitude && thirdStopLongitude) {
        newBooking.thirdStopLocation = { latitude: thirdStopLatitude, longitude: thirdStopLongitude };
    }

    try {
        const bookingRef = db.collection('bookings').doc();
        await bookingRef.set(newBooking);

        const bookingSnapshot = await bookingRef.get();
        const bookingData = bookingSnapshot.data();
        const bookingId = bookingRef.id;

        wss.clients.forEach((client) => {
            if (client.userId === user.uid) {
                sendDataToClient(client, { notificationId: `${bookingId + "01"}`, type: 'requestReceived', message: "Booking Request Received Successfully!" });
            }
        });

        return res.status(200).json({
            success: true,
            message: "Booking Request Received Successfully!",
            booking: {
                bookingId,
                ...bookingData
            }
        });

    } catch (error) {
        console.log("Error in booking ride", error);
        return res.status(500).json({
            success: false,
            message: "Error in booking a ride.",
            error: "An internal server error occured",
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

                if (distance < 2) {
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
                                        notificationId: driverId,
                                        message: "A driver has been found initially and is reserved for 30 seconds",
                                        driver: JSON.stringify(driverData),
                                        distance: distance
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

                        if (distance < 2) {
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
                                                notificationId: driverId,
                                                message: "A driver has been found and is reserved for 30 seconds",
                                                driver: JSON.stringify(driverData),
                                                distance: distance,
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
                            sendDataToClient(client, { type: 'bookingConfirmed', message: "Your booking has been confirmed." });
                        }
                    });

                    res.status(200).json({
                        success: true,
                        message: "Booking confirmed and Search has now stopped",
                    });
                } else if (bookingData.status === "cancelled") {
                    if (searchTimeout) clearTimeout(searchTimeout);
                    if (driverStatusUnsubscribe) driverStatusUnsubscribe();
                    if (bookingStatusUnsubscribe) bookingStatusUnsubscribe();
                    
                    res.status(200).json({
                        success: false,
                        message: "Booking cancelled and Search has now stopped",
                    })

                }
            });

        // Handle timeout after 2 minutes
        searchTimeout = setTimeout(async () => {
            if (driverStatusUnsubscribe) driverStatusUnsubscribe();
            if (searchTimeout) clearTimeout(searchTimeout); // Stop checking booking status

            if (reservedDrivers.size === 0) {
                wss.clients.forEach((client) => {
                    if (client.userId === booking.userId) {
                        sendDataToClient(client, { notificationId: Math.random() + `${bookingId}`, type: 'driversNotFoundOnTime', message: "No drivers found within the specified time" });
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
        }, 120000);

    } catch (error) {
        console.error("Error in searching drivers for booking:", error);
        if (searchTimeout) clearTimeout(searchTimeout); // Clear timeout in case of error
        if (driverStatusUnsubscribe) driverStatusUnsubscribe(); // Clear Firestore listener
        if (bookingStatusUnsubscribe) bookingStatusUnsubscribe(); // Clear booking status listener
        return res.status(500).json({
            success: false,
            message: "Error in processing your request.",
        });
    }
};

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
            bookingId: bookingRef.id,
            driverId: driverId,
            status: 'confirmed',
            driverCurrentLocation: driver.location.coordinates
        });

        await driverRef.update({
            driverStatus: 'unavailable',
            reservedUntil: null
        });

        const updatedBookingSnapshot = await bookingRef.get();
        const updatedBooking = updatedBookingSnapshot.data();

        const updatedDriverSnapshot = await driverRef.get();
        const updatedDriver = updatedDriverSnapshot.data();

        const userRef = db.collection('users').doc(updatedBooking.userId);
        const userSnapshot = await userRef.get();
        const user = userSnapshot.data();

        wss.clients.forEach((client) => {
            if(client.userId === updatedBooking.userId){
                sendDataToClient(client, {
                    type: 'driverAssigned',
                    notificationId: `${bookingId + "03"}`,
                    message: "You have a new driver",
                    booking: JSON.stringify(updatedBooking),
                    driver: JSON.stringify(updatedDriver)
                });
            }
        });
        
        wss.clients.forEach((client) => {
            if(client.userId === driverId){
                sendDataToClient(client, {
                    type: 'driverAssigned',
                    notificationId: `${bookingId + "03"}`,
                    message: "You have a new customer",
                    booking: JSON.stringify(updatedBooking),
                    user: JSON.stringify(user)
                });
            }
        });

        return res.status(200).json({
            success: true,
            message: "Booking confirmed successfully!",
        });

    } catch (error) {
        console.error("Error in assigning driver to booking:", error);
        return res.status(500).json({
            success: false,
            message: "Error in assigning driver to booking.",
        });
    }
};

export const addStop = async (req, res) => {

    const { bookingId, thirdStopLatitude, thirdStopLongitude, price } = req.body;

    if ( !bookingId || !thirdStopLatitude || !thirdStopLongitude || !price ) {
        return res.status(400).json({
            success: false,
            message: "booking Id, third stop locations and price are required.",
        });
    }

    try {
        const bookingRef = db.collection("bookings").doc(bookingId);
        const bookingSnapshot = await bookingRef.get();

        if (!bookingSnapshot.exists) {
            return res.status(404).json({ success: false, message: "Booking not found." });
        }

        const booking = bookingSnapshot.data();

        if(booking.hasThirdStop){
            return res.status(400).json({
                success: false,
                message: "Booking already has an extra stop"
            })
        }

        const distance = getDistanceFromLatLonInKm(
            booking.driverCurrentLocation[0],
            booking.driverCurrentLocation[1],
            booking.dropOffLocation.latitude,
            booking.dropOffLocation.longitude
        );

        if( distance < 5 ){
            return res.status(400).json({
                success: false,
                message: "You are close to the drop off location and cannot add a stop"
            })
        }

        await bookingRef.update({
            hasThirdStop: true,
            thirdStopLocation : { latitude: thirdStopLatitude, longitude: thirdStopLongitude },
            price
        })

        const updatedBookingSnapshot = await bookingRef.get();
        const updatedBooking = updatedBookingSnapshot.data();

        wss.clients.forEach((client) => {
            if(client.userId === updatedBooking.userId) {
                sendDataToClient(client, {
                    type: "StopAdded",
                    notificationId: `${bookingId + "30"}`,
                    message: "A Stop has been added to your current trip",
                    booking: JSON.stringify(updatedBooking),
                })
            }
        })

        wss.clients.forEach((client) => {
            if(client.userId === updatedBooking.driverId) {
                sendDataToClient(client, {
                    type: "StopAdded",
                    notificationId: `${bookingId + "30"}`,
                    message: "A Stop has been added to your current trip",
                    booking: JSON.stringify(updatedBooking),
                })
            }
        })

        return res.status(200).json({
            success: true,
            message: "Stop added successfully"
        })

    } catch (error) {
        console.error("Error adding a third Stop", error);
        return res.status(500).json({
            success: false,
            message: "Error adding a third stop."
        })
    }

};

export const changeDestination = async (req, res) => {

    const { bookingId, dropOffLatitude, dropOffLongitude } = req.body;

    if ( !bookingId || !dropOffLatitude || !dropOffLongitude ) {
        return res.status(400).json({
            success: false,
            message: "booking Id and drop-off locations are required.",
        });
    }

    try {

        const bookingRef = db.collection("bookings").doc(bookingId);
        const bookingSnapshot = await bookingRef.get();

        if (!bookingSnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "Booking not found.",
            });
        }

        const booking = bookingSnapshot.data();
        const distance = getDistanceFromLatLonInKm(
            booking.driverCurrentLocation[0],
            booking.driverCurrentLocation[1],
            booking.dropOffLocation.latitude,
            booking.dropOffLocation.longitude
        );

        if(distance < 5) {
            return res.status(400).json({
                success: false,
                message: "You are close to the drop off location and your destination cannot be changed"
            })
        }

        await bookingRef.update({
            dropOffLocation: {latitude: dropOffLatitude, longitude: dropOffLongitude },
        })

        const updatedBookingSnapshot = await bookingRef.get();
        const updatedBooking = updatedBookingSnapshot.data();

        wss.clients.forEach((client) => {
            if(client.userId === updatedBooking.userId) {
                sendDataToClient(client, {
                    type: "dropOffLocationUpdated",
                    notificationId: `${bookingId + "20"}`,
                    message: "Your drop off location has been changed",
                    booking: JSON.stringify(updatedBooking),
                })
            }
        })

        wss.clients.forEach((client) => {
            if(client.userId === updatedBooking.driverId) {
                sendDataToClient(client, {
                    type: "dropOffLocationUpdated",
                    notificationId: `${bookingId + "20"}`,
                    message: "Your current booking destination has been changed",
                    booking: JSON.stringify(updatedBooking),
                })
            }
        })

        return res.status(200).json({
            success: true,
            message: "Drop Off location updated successfully"
        })

    } catch (error) {
        console.error("Error changing destination: ", error);
        return res.status(500).json({
            success: false,
            messsage: "Error changing destination"
        })
    }
};

export const findNewDriver = async (req, res) => {
    const { bookingId, driverId, reason } = req.body;
    
    if(!bookingId || !driverId ) {
        return res.status(400).json({
            success: false,
            message: "booking Id and driver Id are required"
        })
    }

    try {

        const bookingRef = db.collection('bookings').doc(bookingId);
        const driverRef = db.collection('drivers').doc(driverId);

        const bookingSnapshot = await bookingRef.get();
        const driverSnapshot = await driverRef.get();

        if(!bookingSnapshot.exists || !driverSnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "Booking or driver not found"
            })
        }

        await bookingRef.update({
            driverId: null,
            status: "pending",
            driverCurrentLocation: null,
        })

        await driverRef.update({
            driverStatus: "available",
            reservedBy: null,
            reservedUntil: null,
        })

        const updatedBookingSnapshot = await bookingRef.get();
        const updatedBooking = updatedBookingSnapshot.data();
        
        wss.clients.forEach((client) => {
            if(client.userId === driverId){
                sendDataToClient(client, { notificationId: `${bookingId + "04"}`, type: 'bookingCancelled', message: "Customer has cancelled the booking", reason: reason });
            }
        });

        return res.status(200).json({
            success: true,
            message: "Booking pending new driver",
            booking: JSON.stringify(updatedBooking),
        });

    } catch (error) {
        console.error("Error in cancelling current driver and finding a new one: ", error);
        return res.status(500).json({
            success: false,
            message: "Error in cancelling current driver and finding a new one"
        })
    }
};

export const cancelBooking = async (req, res) => {
    const { bookingId, reason } = req.body;

    if(!bookingId){
        return res.status(400).json({
            success: false,
            message: "bookingId is required"
        })
    }

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
                driverStatus: 'available',
                reservedBy: null,
            });

            await bookingRef.update({
                reason: reason
            })

            // Notify driver about booking cancellation
            wss.clients.forEach((client) => {
                if(client.userId === booking.driverId){
                    sendDataToClient(client, { notificationId: `${bookingId + "04"}`, type: 'bookingCancelled', message: "Customer has cancelled the booking", reason: reason });
                }
            });
        }

        const updatedBookingSnapshot = await bookingRef.get();
        const updatedBooking = updatedBookingSnapshot.data();

        wss.clients.forEach((client) => {
            if(client.userId === booking.userId){
                sendDataToClient(client, { notificationId: `${bookingId + "04"}`, type: 'bookingCancelled', message: "Your booking has been cancelled successfully" });
            }
        });

        return res.status(200).json({
            success: true,
            message: "Booking cancelled successfully.",
            booking: updatedBooking
        });
    } catch (error) {
        console.error("Error in cancelling booking:", error);
        return res.status(500).json({
            success: false,
            message: "Error in cancelling booking.",
        });
    }
};

export const driverAtPickupLocation = async (req, res) => {
    const { bookingId } = req.body;

    if(!bookingId){
        return res.status(400).json({
            success: false,
            message: "bookingId is required"
        })
    }

    try {
        const bookingRef = db.collection('bookings').doc(bookingId);
        const bookingSnapshot = await bookingRef.get();

        if (!bookingSnapshot.exists || bookingSnapshot.data().status !== 'confirmed') {
            return res.status(404).json({
                success: false,
                message: "Invalid booking or booking not confirmed.",
            });
        }

        await bookingRef.update({
            driverArrivedAtPickup: true
        });

        const updatedBookingSnapshot = await bookingRef.get();
        const updatedBooking = updatedBookingSnapshot.data();

        wss.clients.forEach((client) => {
            if(client.userId === updatedBooking.userId){
                sendDataToClient(client, { notificationId: `${bookingId + "06"}`, type: 'driverArrived', message: "Your driver has arrived at pickup Location", booking: JSON.stringify(updatedBooking)});
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
        });
    }
};

export const startRide = async (req, res) => {

    const { bookingId } = req.body;

    if(!bookingId){
        return res.status(400).json({
            success: false,
            message: "bookingId is required"
        })
    }

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

        const updatedBookingSnapshot = await bookingRef.get();
        const updatedBooking = updatedBookingSnapshot.data();

        wss.clients.forEach((client) => {
            if(client.userId === updatedBooking.userId){
                sendDataToClient(client, { notificationId: `${bookingId + "08"}`, type: 'rideStarted', message: "You are now on the way", booking: JSON.stringify(updatedBooking) });
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
        });
    }
};

export const endRide = async (req, res) => {

    const { bookingId } = req.body;

    if(!bookingId){
        return res.status(400).json({
            success: false,
            message: "bookingId is required"
        })
    }

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

        const updatedBookingSnapshot = await bookingRef.get();
        const updatedBooking = updatedBookingSnapshot.data();

        wss.clients.forEach((client) => {
            if(client.userId === updatedBooking.userId){
                sendDataToClient(client, { notificationId: `${bookingId + "10"}`, type: 'rideEnded', message: "You have arrived at your destination, remember to rate your driver!", booking: JSON.stringify(updatedBooking) });
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
        });
    }
};
