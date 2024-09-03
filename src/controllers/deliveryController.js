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

export const deliveryRequest = async (req, res ) => {
    const { pickUpLatitude, pickUpLongitude, dropOffLatitude, dropOffLongitude, hasThirdStop, thirdStopLatitude, thirdStopLongitude, price, paymentMethod, recipientName, recipientContact, deliveryClass } = req.body;

    const user = req.user;

    if(!user) {
        return res.status(400).json({
            success: false,
            message: "Unauthorized"
        })
    }

    if(!pickUpLatitude || !pickUpLongitude || !dropOffLatitude || !dropOffLongitude || !recipientName || !recipientContact) {
        return res.status(400).json({
            success: false,
            messsage: "pick-up, drop-off, and recipient details are required"
        })
    }
    
    const newDelivery = {
        userId: user.uid,
        pickUpLocation: { latitude: pickUpLatitude, longitude: pickUpLongitude },
        dropOffLocation: { latitude: dropOffLatitude, longitude: dropOffLongitude },
        price,
        paymentMethod,
        deliveryClass,
        recipientName,
        recipientContact,
        hasThirdStop,
        bookingType: "delivery",
        status: "pending",
        paymentReceived: false,
        createdAt: FieldValue.serverTimestamp()
    }

    if ( hasThirdStop && thirdStopLatitude && thirdStopLongitude ) {
        newDelivery.thirdStopLocation = { latitude: thirdStopLatitude, longitude: thirdStopLongitude };
    }

    try {
        const deliveryRef = db.collection('deliveries').doc();
        await deliveryRef.set(newDelivery);

        const deliverySnapshot = await deliveryRef.get();
        const deliveryData = deliverySnapshot.data();
        const deliveryId = deliveryRef.id;

        sendDataToClient(user.uid, "notification", { type: "deliveryReceived", notificationId: `${user.uid}-${Date.now()}`, message: "Delivery Requuest made successfully! "})

        return res.status(200).json({
            success: true,
            message: "Delivery request received successfully!",
            booking: {
                bookingId: deliveryId,
                ...deliveryData
            }
        });

    } catch (error) {
        console.error("Error in making delivery request", error); 
        return res.status(500).json({
            success: false,
            message: "Error in making delivery request",
            error: "An internal server error occured.",
        });
    }  
};

export const searchAndAssignDriverToDelivery = async (req, res) => {
    const { deliveryId } = req.body;

    if (!deliveryId) {
        return res.status(400).json({
            success: false,
            message: "delivery id is required",
        });
    }

    let responseSent = false;
    let searchTimeout;
    let unsubscribe;

    try {
        const deliverySnapshot = await db.collection("deliveries").doc(deliveryId).get();

        if (!deliverySnapshot.exists) {
            return res.status(404).json({ success: false, message: "Delivery not found." });
        }

        const delivery = deliverySnapshot.data();

        sendDataToClient(delivery.userId, "notification", { type: "searchStarted", message: "Search for drivers has commenced" });

        const availableDriversSnapshot = await db.collection("drivers")
            .where('driverStatus', "==", "available")
            .where('canDeliver', '==', true)
            .where("deliveryClass", "==", delivery.deliveryClass)
            .get();

        const assignDriver = async (doc) => {
            const driverData = doc.data();
            const distance = getDistanceFromLatLonInKm(
                delivery?.pickUpLocation?.latitude,
                delivery?.pickUpLocation?.longitude,
                driverData?.location?.coordinates[0],
                driverData?.location?.coordinates[1]
            );

            if (distance < 3) {
                const driverId = doc.id;
                const driverRef = db.collection('drivers').doc(driverId);
                const deliveryRef = db.collection('deliveries').doc(deliveryId);

                try {
                    await db.runTransaction(async (transaction) => {
                        const driverDoc = await transaction.get(driverRef);

                        if (!driverDoc.exists || driverDoc.data().driverStatus !== "available") {
                            throw new Error("Driver does not exist or is no longer available");
                        }

                        transaction.update(driverRef, {
                            driverStatus: "unavailable",
                            reservedBy: delivery.userId,
                        });

                    });

                    const updatedDriverDoc = await driverRef.get();
                    const updatedDriverData = updatedDriverDoc.data();

                    const driverDetails = {
                        driverId: driverId,
                        ...updatedDriverData
                    };

                    await deliveryRef.update({
                        status: "confirmed",
                        driverId: driverId,
                        bookingId: deliveryRef.id,
                        driverCurrentLocation: updatedDriverData.location.coordinates
                    });

                    const updatedBookingDoc = await deliveryRef.get();
                    const updatedBookingData = updatedBookingDoc.data();

                    if (!responseSent) {
                        responseSent = true;
                        if (searchTimeout) clearTimeout(searchTimeout);
                        if (unsubscribe) unsubscribe();

                        return res.status(200).json({ success: true, message: "A driver has been found for your delivery", driver: driverDetails, booking: updatedBookingData });
                    }
                } catch (error) {
                    console.error("Failed to reserve driver for customer:", error);
                }
            }
        };

        // Assign any existing drivers
        for (const doc of availableDriversSnapshot.docs) {
            await assignDriver(doc);
            if (responseSent) break;
        }

        // Set up the real-time listener
        if (!responseSent) {
            unsubscribe = db.collection("drivers")
                .where('driverStatus', "==", "available")
                .where('canDeliver', '==', true)
                .where("deliveryClass", "==", delivery.deliveryClass)
                .onSnapshot(async (snapshot) => {
                    for (const doc of snapshot.docs) {
                        await assignDriver(doc);
                        if (responseSent) break;
                    }
                });

            // Set a timeout to stop searching after 2 minutes
            searchTimeout = setTimeout(() => {
                if (!responseSent) {
                    responseSent = true;
                    if (unsubscribe) unsubscribe();
                    sendDataToClient(delivery.userId, "notification", { notificationId: `${delivery.userId}-${Date.now()}`, type: "driversNotFoundOnTime", message: "No drivers found within the specified time." });
                    return res.status(200).json({ success: true, message: "No drivers found within the time limit." });
                }
            }, 120000);
        }

    } catch (error) {
        console.error("Error in finding a driver for delivery: ", error);
        if (searchTimeout) clearTimeout(searchTimeout);
        if (unsubscribe) unsubscribe();

        if (!responseSent) {
            responseSent = true;
            return res.status(500).json({
                success: false,
                message: "Error in finding a driver for delivery.",
                error: "internal server error",
            });
        }
    }
};

export const findNewDriverForDelivery = async (req, res) => {
    const { deliveryId, driverId, reason } = req.body;

    if(!deliveryId || !driverId ) { 
        return res.status(400).json({
            success: false,
            message: "delivery id and driver id are required"
        })
    }

    try {

        const deliveryRef = db.collection("deliveries").doc(deliveryId);
        const driverRef = db.collection('drivers').doc(driverId);

        const deliverySnapshot = await deliveryRef.get();
        const driverSnapshot = await driverRef.get();

        if(!deliverySnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "Booking not found"
            })
        }

        if(!driverSnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "driver not found"
            })
        }

        await deliveryRef.update({
            driverId: null,
            status: "pending",
            driverCurrentLocation: null,
            driverArrivedAtPickup: false,
        })

        await driverRef.update({
            driverStatus: "available",
            reservedBy: null,
        })

        const updatedDeliverySnapshot = await deliveryRef.get();
        const updatedDelivery = updatedDeliverySnapshot.data();

        sendDataToClient(driverId, "notification", { type: "bookingCancelled", notificationId: `${driverId}-${Date.now()}`, message: "Customer has cancelled the booking", reason: reason || "No reason provided" })

        return res.status(200).json({
            success: true,
            message: "your delivery is pending new rider",
            booking: updatedDelivery,
        })

    } catch (error) {
        console.error("Error in cancelling current rider and finding a new one: ", error);

        return res.status(500).json({
            success: false,
            message: "Error in cancelling current rider and finding a new one"
        })
    }
}

export const cancelDelivery = async (req, res) => {
    const { deliveryId, reason } = req.body;

    if(!deliveryId){
        return res.status(400).json({
            success: false,
            message: "deliveryId is required"
        })
    }

    try {

        const deliveryRef = db.collection('deliveries').doc(deliveryId);
        const deliverySnapshot = await deliveryRef.get();

        if (!deliverySnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "delivery not found.",
            });
        }

        await deliveryRef.update({
            status: 'cancelled'
        });

        const delivery = deliverySnapshot.data();

        if (delivery.driverId) {
            const driverRef = db.collection('drivers').doc(delivery.driverId);
            await driverRef.update({
                driverStatus: 'available',
                reservedBy: null,
            });

            await deliveryRef.update({
                reason: reason || "No reason provided"
            })

            sendDataToClient(delivery.driverId, "notification", { notificationId: `${deliveryId}-${Date.now()}`, type: 'bookingCancelled', message: "Customer has cancelled the booking", reason: reason || "No reason Provided" })
        }

        const updatedDeliverySnapshot = await deliveryRef.get();
        const updatedDelivery = updatedDeliverySnapshot.data();

        sendDataToClient(delivery.userId, "notification", { notificationId: `${delivery.userId}-${Date.now()}`, type: 'bookingCancelled', message: "Your booking has been cancelled successfully" })

        return res.status(200).json({
            success: true,
            message: "Delivery cancelled successfully.",
            booking: updatedDelivery
        });

    } catch (error) {
        console.error("Error in cancelling delivery:", error);
        return res.status(500).json({
            success: false,
            message: "Error in cancelling delivery.",
            error: "Internal Server Error"
        });
    }
}

export const deliveryRiderAtPickUp = async (req, res) => {
    const { deliveryId } = req.body;

    if(!deliveryId){
        return res.status(400).json({
            success: false,
            message: "deliveryId is required"
        })
    }

    try {
        const deliveryRef = db.collection('deliveries').doc(deliveryId);
        const deliverySnapshot = await deliveryRef.get();

        if (!deliverySnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "delivery not found.",
            });
        }

        const deliveryData = deliverySnapshot.data();

        if (deliveryData.status !== 'confirmed') {
            return res.status(400).json({
                success: false,
                message: "delivery not confirmed."
            });
        }

        await deliveryRef.update({
            driverArrivedAtPickup: true
        });

        const updatedDeliverySnapshot = await deliveryRef.get();
        const updatedDelivery = updatedDeliverySnapshot.data();

        sendDataToClient(updatedDelivery.userId, "notification", { notificationId: `${updatedDelivery.userId}-${Date.now()}`, type: 'driverArrived', message: "Your driver has arrived at pickup Location", booking: JSON.stringify(updatedDelivery) })

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
} 

export const startDelivery = async ( req, res ) => {
    const { deliveryId } = req.body;

    if(!deliveryId){
        return res.status(400).json({
            success: false,
            message: "deliveryId is required"
        })
    }

    try {
        const deliveryRef = db.collection('deliveries').doc(deliveryId);
        const deliverySnapshot = await deliveryRef.get();

        if (!deliverySnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "delivery not found.",
            });
        }

        const deliveryData = deliverySnapshot.data();

        if (!deliveryData.driverArrivedAtPickup) {
            return res.status(400).json({
                success: false,
                message: "You must arrive at pickup location before starting the journey"
            });
        }

        await deliveryRef.update({
            status: 'ongoing',
            rated: false
        });

        const updatedDeliverySnapshot = await deliveryRef.get();
        const updatedDelivery = updatedDeliverySnapshot.data();

        sendDataToClient(updatedDelivery.userId, "notification", { notificationId: `${updatedDelivery.userId}-${Date.now()}`, type: 'rideStarted', message: "You are now on the way", booking: JSON.stringify(updatedDelivery) })

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
}

export const deliveryRiderAtDropOff = async (req, res) => {
    const { deliveryId } = req.body;

    if(!deliveryId){
        return res.status(400).json({
            success: false,
            message: "deliveryId is required"
        })
    }

    try {
        const deliveryRef = db.collection('deliveries').doc(deliveryId);
        const deliverySnapshot = await deliveryRef.get();

        if (!deliverySnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "delivery not found.",
            });
        }

        const deliveryData = deliverySnapshot.data();

        if (deliveryData.status !== "ongoing") {
            return res.status(400).json({
                success: false,
                message: "The ride is not on the way"
            });
        }

        await deliveryRef.update({
            status: 'arrived',
            driverArrivedAtDropoff: true
        });

        const updatedDeliverySnapshot = await deliveryRef.get();
        const updatedDelivery = updatedDeliverySnapshot.data();  
        
        sendDataToClient(updatedDelivery.userId, "notification", { notificationId: `${updatedDelivery.userId}-${Date.now()}`, type: 'rideEnded', message: "You have arrived at your destination, remember to rate your driver!", booking: JSON.stringify(updatedDelivery) })

        return res.status(200).json({
            success: true,
            message: "Ride has ended.",
        });

    } catch (error) {
        console.error("Error in ending the ride:", error);
        return res.status(500).json({
            success: false,
            message: "Error in ending the ride.",
            error: "Internal server error."
        });
    }
}