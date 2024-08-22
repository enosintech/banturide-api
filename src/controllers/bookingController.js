import { FieldValue } from "firebase-admin/firestore";

import { db } from "../config/firebase.js";

import { sendDataToClient } from "../../server.js";

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
        return res.status(401).json({
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
        bookingType: "ride",
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

        sendDataToClient(user.uid, "notification", { type: "requestReceived" , notificationId: `${user.uid}-${Date.now()}`, message: "Booking Request Received Successfully!"})

        return res.status(200).json({
            success: true,
            message: "Booking Request Received Successfully!",
            booking: {
                bookingId,
                ...bookingData
            }
        });

    } catch (error) {
        console.error("Error in booking ride", error);
        return res.status(500).json({
            success: false,
            message: "Error in booking a ride.",
            error: "An internal server error occured",
        });
    }
};

export const searchDriversForBooking = async (req, res) => {
    
    const { bookingId } = req.body;

    if(!bookingId){
        return res.status(400).json({
            success: false,
            message: "bookingId is required"
        })
    }

    const foundDrivers = [];
    const reservedDrivers = new Map();
    const clientReservations = new Map(); 
    const notifiedDrivers = new Set(); 

    let searchTimeout;
    let bookingStatusUnsubscribe; 
    let driverStatusUnsubscribe; 

    let responseSent = false;

    try {

        const bookingSnapshot = await db.collection('bookings').doc(bookingId).get();
        if (!bookingSnapshot.exists) {
            return res.status(404).json({ success: false, message: "Booking not found." });
        }
        const booking = bookingSnapshot.data();

        sendDataToClient(booking.userId, "notification", { type: "searchStarted", message: "Search for drivers has commenced"})

        const reserveDriver = async (driverId, clientId) => {
            try {
                await db.runTransaction(async (transaction) => {
                    const driverRef = db.collection('drivers').doc(driverId);
                    const driverDoc = await transaction.get(driverRef);

                    if (!driverDoc.exists) {
                        console.log('Driver does not exist');
                    }

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

                    if(!foundDrivers.includes(driverId)){
                        foundDrivers.push(driverId)
                    }

                    if (reservedDrivers.has(driverId)) return;

                    const driverRef = db.collection('drivers').doc(driverId); 

                    reserveDriver(driverId, booking.userId).then(async () => {
                        const updatedDriverDoc = await driverRef.get();
                        const updatedDriverData = updatedDriverDoc.data();
                        const driverData = {
                            driverId: driverId,
                            ...updatedDriverData
                        }

                        if (!notifiedDrivers.has(driverId)) {

                            sendDataToClient(booking.userId, "notification", {
                                type: 'driverFound',
                                notificationId: `${driverId}-${Date.now()}`,
                                message: "A driver has been found initially and is reserved for 30 seconds",
                                driver: JSON.stringify(driverData),
                                distance: distance
                            })
                            notifiedDrivers.add(driverId);
                        }
                    })
                    .catch((error) => {
                        console.log("Error Reserving a driver", error)
                    })
                }
            });
        };

        await searchDrivers();

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

                            if(!foundDrivers.includes(driverId)){
                                foundDrivers.push(driverId)
                            }

                            if (reservedDrivers.has(driverId)) return;

                            const driverRef = db.collection('drivers').doc(driverId); 

                            reserveDriver(driverId, booking.userId).then(async () => {
                                const updatedDriverDoc = await driverRef.get();
                                const updatedDriverData = updatedDriverDoc.data();

                                const driverData = {
                                    driverId: driverId,
                                    ...updatedDriverData
                                }

                                if (!notifiedDrivers.has(driverId)) {
                                    sendDataToClient(booking.userId, "notification", {
                                        type: 'driverFound',
                                        notificationId: `${booking.userId}-${Date.now()}`,
                                        message: "A driver has been found and is reserved for 30 seconds",
                                        driver: JSON.stringify(driverData),
                                        distance: distance,
                                    })
                                    notifiedDrivers.add(driverId);
                                }
                            })
                            .catch((error) => {
                                console.log("Error reserving a driver for a booking: ", error)
                            })
                        }
                    }
                });
            });

        bookingStatusUnsubscribe = db.collection('bookings').doc(bookingId)
            .onSnapshot(async (doc) => {
                const bookingData = doc.data();
                if (bookingData.status === 'confirmed') {
                    if (searchTimeout) clearTimeout(searchTimeout);
                    if (driverStatusUnsubscribe) driverStatusUnsubscribe();
                    if (bookingStatusUnsubscribe) bookingStatusUnsubscribe();

                    sendDataToClient(booking.userId, "notification", { type: 'bookingConfirmed', message: "Your booking has been confirmed." })

                    if (!responseSent) {
                        responseSent = true;
                        sendDataToClient(booking.userId, "notification", { type: 'bookingConfirmed', message: "Your booking has been confirmed." });

                        res.status(200).json({
                            success: true,
                            message: "Booking confirmed and Search has now stopped",
                        });
                    }

                }

                if(bookingData.status === "cancelled") {
    
                    if (searchTimeout) clearTimeout(searchTimeout);
                    if (driverStatusUnsubscribe) driverStatusUnsubscribe();
                    if (bookingStatusUnsubscribe) bookingStatusUnsubscribe();

                    if (!responseSent) {
                        responseSent = true;
                        res.status(200).json({
                            success: true,
                            message: "Booking cancelled and Search has now stopped",
                        });
                    }

                }
            });

        searchTimeout = setTimeout(async () => {
            if (driverStatusUnsubscribe) driverStatusUnsubscribe();
            if (searchTimeout) clearTimeout(searchTimeout);

            if (!responseSent) { 
                responseSent = true;

                if (foundDrivers.length === 0) {
                    sendDataToClient(booking.userId, "notification", { notificationId: `${booking.userId}-${Date.now()}`, type: 'driversNotFoundOnTime', message: "No drivers found within the specified time" });
                    res.status(404).json({ success: false, message: "No drivers found within the time limit." });
                } else {
                    sendDataToClient(booking.userId, "notification", { type: 'searchComplete', message: "Drivers were found and the search is complete" });
                    res.status(200).json({
                        success: true,
                        message: "Drivers were found and the search is complete.",
                    });
                }
            }
        }, 120000);

    } catch (error) {
        console.error("Error in searching drivers for booking:", error);
        if (searchTimeout) clearTimeout(searchTimeout); 
        if (driverStatusUnsubscribe) driverStatusUnsubscribe();
        if (bookingStatusUnsubscribe) bookingStatusUnsubscribe();
        
        if (!responseSent) {
            responseSent = true;
            return res.status(500).json({
                success: false,
                message: "Error in searching drivers for booking.",
                error: "internal server error",
            });
        }
    }
};

export const assignDriverToBooking = async (req, res) => {
    const { bookingId, driverId } = req.body;

    if(!bookingId || !driverId) {
        return res.status(400).json({
            success: false,
            message: "Booking id and driver id are required"
        })
    }

    try {
        const bookingRef = db.collection('bookings').doc(bookingId);
        const driverRef = db.collection('drivers').doc(driverId);

        const bookingSnapshot = await bookingRef.get();
        const driverSnapshot = await driverRef.get();

        if (!bookingSnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "Booking not found.",
            });
        }

        if (!driverSnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "Driver not found.",
            });
        }

        const driver = driverSnapshot.data();

        if (driver.driverStatus !== 'reserved') {
            return res.status(400).json({
                success: false,
                message: "Driver is not available.",
            });
        }

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

        sendDataToClient(driverId, "notification", {
            type: 'driverAssigned',
            notificationId: `${driverId}-${Date.now()}`,
            message: "You have a new customer",
            booking: JSON.stringify(updatedBooking),
            user: JSON.stringify(user)
        })

        return res.status(200).json({
            success: true,
            message: "Booking confirmed successfully!",
            booking: updatedBooking,
            driver: updatedDriver
        });

    } catch (error) {
        console.error("Error in assigning driver to booking:", error);
        return res.status(500).json({
            success: false,
            message: "Error in assigning driver to booking.",
            error: "Internal Server Error"
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
            driverArrivedAtPickup: false
        })

        await driverRef.update({
            driverStatus: "available",
            reservedBy: null,
            reservedUntil: null,
        })

        const updatedBookingSnapshot = await bookingRef.get();
        const updatedBooking = updatedBookingSnapshot.data();

        sendDataToClient(driverId, "notification", { type: "bookingCancelled", notificationId: `${driverId}-${Date.now()}`, message: "Customerr has cancelled the booking", reason: reason || "No reason Provided"})

        return res.status(200).json({
            success: true,
            message: "Booking pending new driver",
            booking: updatedBooking,
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
                reason: reason || "No reason provided"
            })

            sendDataToClient(booking.driverId, "notification", { notificationId: `${bookingId}-${Date.now()}`, type: 'bookingCancelled', message: "Customer has cancelled the booking", reason: reason || "No reason Provided" })
        }

        const updatedBookingSnapshot = await bookingRef.get();
        const updatedBooking = updatedBookingSnapshot.data();

        sendDataToClient(booking.userId, "notification", { notificationId: `${booking.userId}-${Date.now()}`, type: 'bookingCancelled', message: "Your booking has been cancelled successfully" })

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
            error: "Internal Server Error"
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

        if (!bookingSnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "Booking not found."
            });
        }

        const bookingData = bookingSnapshot.data();

        if (bookingData.status !== 'confirmed') {
            return res.status(400).json({
                success: false,
                message: "Booking not confirmed."
            });
        }

        await bookingRef.update({
            driverArrivedAtPickup: true
        });

        const updatedBookingSnapshot = await bookingRef.get();
        const updatedBooking = updatedBookingSnapshot.data();

        sendDataToClient(updatedBooking.userId, "notification", { notificationId: `${updatedBooking.userId}-${Date.now()}`, type: 'driverArrived', message: "Your driver has arrived at pickup Location", booking: JSON.stringify(updatedBooking) })

        return res.status(200).json({
            success: true,
            message: "Driver Arrived at pick location successfully set to true",
        });
    } catch (error) {
        console.error("Error in notifying driver arrival at pickup location:", error);
        return res.status(500).json({
            success: false,
            message: "Error in notifying driver arrival at pickup location.",
            error: "Internal Server Error"
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

        if (!bookingSnapshot.exists) {
            return res.status(400).json({
                success: false,
                message: "Booking Not Found",
            });
        }

        const bookingData = bookingSnapshot.data();

        if (!bookingData.driverArrivedAtPickup) {
            return res.status(400).json({
                success: false,
                message: "You must arrive at pickup location before starting the ride"
            });
        }

        await bookingRef.update({
            status: 'ongoing',
            rated: false
        });

        const updatedBookingSnapshot = await bookingRef.get();
        const updatedBooking = updatedBookingSnapshot.data();

        sendDataToClient(updatedBooking.userId, "notification", { notificationId: `${updatedBooking.userId}-${Date.now()}`, type: 'rideStarted', message: "You are now on the way", booking: JSON.stringify(updatedBooking) })

        return res.status(200).json({
            success: true,
            message: "Ride has started.",
        });

    } catch (error) {
        console.error("Error in starting the ride:", error);
        return res.status(500).json({
            success: false,
            message: "Error in starting the ride.",
            error: "internal Server Error"
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

        if (!bookingSnapshot.exists) {
            return res.status(400).json({
                success: false,
                message: "booking not found.",
            });
        }

        const bookingData = bookingSnapshot.data();

        if (bookingData.status !== "ongoing") {
            return res.status(400).json({
                success: false,
                message: "The ride is not on the way"
            });
        }

        await bookingRef.update({
            driverArrivedAtDropoff: true,
            status: 'arrived',
        });

        const updatedBookingSnapshot = await bookingRef.get();
        const updatedBooking = updatedBookingSnapshot.data();

        sendDataToClient(updatedBooking.userId, 'notification', {  notificationId: `${updatedBooking.userId}-${Date.now()}`, type: 'rideEnded', message: "You have arrived at your destination, remember to rate your driver!", booking: JSON.stringify(updatedBooking) })

        return res.status(200).json({
            success: true,
            message: "Ride has ended."
        });

    } catch (error) {
        console.error("Error in ending the ride:", error);
        return res.status(500).json({
            success: false,
            message: "Error in ending the ride.",
            error: "Internal server error."
        });
    }
};
