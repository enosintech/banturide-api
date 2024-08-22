import { FieldValue } from "firebase-admin/firestore";

import { db } from "../config/firebase.js";

import { sendDataToClient } from "../../server.js";

// Function to calculate distance between two coordinates (Haversine formula)
const calculateDistance = (coord1, coord2) => {
  const R = 6371; // Radius of the Earth in kilometers
  const lat1 = coord1[0];
  const lon1 = coord1[1];
  const lat2 = coord2.latitude;
  const lon2 = coord2.longitude;

  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in kilometers
  return distance;
};

// Function to convert degrees to radians
const deg2rad = (deg) => {
  return deg * (Math.PI / 180);
};

export const updatePaymentMethod = async (req, res) => {

  const user = req.user;

  if(!user) {
    return res.status(403).json({ error: "Unauthorized", success: false})
  }

  const { bookingId, paymentMethod } = req.body;
  
  if (!bookingId || !paymentMethod) {
    return res.status(400).json({ error: "Booking ID and payment method are required", success: false });
  }

  try {
    const bookingRef = db.collection('bookings').doc(bookingId);

    const bookingSnapshot = await bookingRef.get();

    if (!bookingSnapshot.exists) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      })
    }

    await bookingRef.update({
      paymentMethod: paymentMethod
    })

    const updatedBookingSnapshot = await bookingRef.get();
    const updatedBooking = updatedBookingSnapshot.data();

    sendDataToClient(updatedBooking.driverId, "notification", { type: "paymentChanged", notificationId: `${bookingId}-${Date.now()}`, message: "Payment Method Updated", booking: JSON.stringify(updatedBooking)})

    return res.status(200).json({
      success: true,
      message: "Payment method updated successfully",
      booking: JSON.stringify(updatedBooking)
    })

  } catch (error) {
    console.error("Error updating payment method: ", error);
    return res.status(500).json({
      success: false,
      message: "Error updating payment method"
    })
  }

};

// Controller to handle confirming payment and marking the ride as successful
export const confirmPaymentAndMarkRideAsSuccessful = async (req, res) => {

  const user = req.user

  if (!user) {
    return res.status(403).json({ error: "Unauthorized", success: false });
  }

  const { bookingId, amount } = req.body;

  if (!bookingId) {
    return res.status(400).json({ error: "Booking ID is required", success: false });
  }

  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount, amount must be number", success: false });
  }

  try {

    const bookingRef = db.collection('bookings').doc(bookingId);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    if(!bookingDoc.data().driverArrivedAtDropoff) {
      return res.status(404).json({
        success: false,
        messsage: "Driver has not arrived at the dropoff location."
      })
    }

    const booking = bookingDoc.data();
    const driverDistanceFromDropoff = calculateDistance(booking.driverCurrentLocation, booking.dropOffLocation);

    if (driverDistanceFromDropoff > 1) {
      return res.status(400).json({
          success: false,
          message: `Driver is ${driverDistanceFromDropoff.toFixed(2)} km away and is not close enough to the dropoff location to confirm payment.`,
      });
    }

    const newPayment = {
      bookingId,
      amount,
      paymentStatus: 'completed',
      paymentType: booking.paymentMethod,
      createdAt: FieldValue.serverTimestamp()
    };

    const paymentRef = db.collection('payments').doc();
    await paymentRef.set(newPayment);

    const driverRef = db.collection("drivers").doc(booking?.driverId);

    await bookingRef.update({ 
      status: 'completed', 
      paymentReceived: true
    });

    await driverRef.update(({
      driverStatus: "available",
      reservedBy: null,
    }))

    const updatedBookingSnapshot = await bookingRef.get();
    const updatedBooking = updatedBookingSnapshot.data();

    sendDataToClient(updatedBooking.userId, "notification", { type: "paymentReceived", notificationId: `${bookingId}-${Date.now()}`, title: "Ride Complete", message: "Your ride is complete, Please remember to Rate your driver", booking: JSON.stringify(updatedBooking) })

    return res.status(200).json({
      success: true,
      message: "Payment confirmed and ride marked as successful.",  
    });

  } catch (error) {

    console.error("Error in confirming payment and marking ride as successful:", error);

    return res.status(500).json({
      success: false,
      message: "Error in confirming payment and marking ride as successful.",
    });

  }
};

export const confirmPaymentAndMarkDeliveryAsSuccessful = async (req, res) => {
  const user = req.user

  if (!user) {
    return res.status(403).json({ error: "Unauthorized", success: false });
  }

  const { deliveryId, amount } = req.body;

  if (!deliveryId) {
    return res.status(400).json({ error: "deliveryID is required", success: false });
  }

  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount, amount must be number", success: false });
  }

  try {
    const deliveryRef = db.collection('deliveries').doc(deliveryId);
    const deliveryDoc = await deliveryRef.get();

    if (!deliveryDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "delivery not found.",
      });
    }

    if(!deliveryDoc.data().driverArrivedAtDropoff) {
      return res.status(404).json({
        success: false,
        messsage: "Driver has not arrived at the dropoff location."
      })
    }

    const delivery = deliveryDoc.data();
    const driverDistanceFromDropoff = calculateDistance(delivery.driverCurrentLocation, delivery.dropOffLocation);

    if (driverDistanceFromDropoff > 1) {
      return res.status(400).json({
          success: false,
          message: `Driver is ${driverDistanceFromDropoff.toFixed(2)} km away and is not close enough to the dropoff location to confirm payment.`,
      });
    }

    const newPayment = {
      bookingId: deliveryId,
      amount,
      paymentStatus: 'completed',
      paymentType: delivery.paymentMethod,
      createdAt: FieldValue.serverTimestamp()
    };

    const paymentRef = db.collection('payments').doc();
    await paymentRef.set(newPayment);

    const driverRef = db.collection("drivers").doc(delivery?.driverId);

    await deliveryRef.update({ 
      status: 'completed', 
      paymentReceived: true
    });

    await driverRef.update(({
      driverStatus: "available",
      reservedBy: null,
    }))

    const updatedDeliverySnapshot = await deliveryRef.get();
    const updatedDelivery = updatedDeliverySnapshot.data();

    sendDataToClient(updatedDelivery.userId, "notification", { type: "paymentReceived", notificationId: `${deliveryId}-${Date.now()}`, title: "Ride Complete", message: "Your delivery is complete, Please remember to Rate your rider", booking: JSON.stringify(updatedDelivery) })

    return res.status(200).json({
      success: true,
      message: "Payment confirmed and delivery marked as successful.",  
    });

  } catch (error) {
    console.error("Error in confirming payment and marking delivery as successful:", error);

    return res.status(500).json({
      success: false,
      message: "Error in confirming payment and marking delivery as successful.",
    });
  }
}
