import { FieldValue } from 'firebase-admin/firestore';

import { db } from "../config/firebase.js";

// passenger controllers

export const getUserProfile = async (req, res) => {

    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }
    
    const passengerRef = db.collection("passengers").doc(user.uid);

    try {
        const userDoc = await passengerRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: "User not found", success: false });
        }

        const userData = {
            userId: user.uid,
            ...userDoc.data(),
        }

        res.status(200).json(userData);

    } catch (error) {
        console.error("Error when obtaining user profile details", error)
        res.status(500).json({ error: "Error when obtaining profile details.", success: false });
    }
};

// Edit user's name
export const editUserName = async (req, res) => {

    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    const { firstname, lastname } = req.body;

    if (!firstname || !lastname) {
        return res.status(400).json({ error: "Firstname and lastname are required", success: false });
    }

    try {
        await db.collection('users').doc(user.uid).update({ firstname, lastname });

        res.status(200).json({ message: "Username updated successfully", success: true });

    } catch (error) {
        console.log("Error editing username", error)
        res.status(500).json({ error: "Error when obtaining profile details.", success: false });
    }

};

// Toggle notifications for user
export const toggleNotifications = async (req, res) => {

    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    const { value } = req.body;

    if (typeof value !== 'boolean') {
        return res.status(400).json({ error: "Invalid value for notificationsEnabled", success: false });
    }

    try {
        await db.collection('users').doc(user.uid).update({ notificationsEnabled: value });

        res.status(200).json({ message: "Notifications updated successfully", value, success: true });
    } catch (error) {
        console.log("Error toggling notifications", error)
        res.status(500).json({ error: "Error when obtaining profile details.", success: false });
    }

};

// Toggle driver should call
export const toggleDriverShouldCall = async (req, res) => {

    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    const { value } = req.body;

    if (typeof value !== 'boolean') {
        return res.status(400).json({ error: "Invalid value for notificationsEnabled", success: false });
    }

    try {
        await db.collection('users').doc(user.uid).update({ driverShouldCall: value });

        res.status(200).json({ message: "Driver Should Call Updated Successfully", value, success: true });
    } catch (error) {
        console.log("Error toggling driver should call", error)
        res.status(500).json({ error: "Error when obtaining profile details.", success: false });
    }

};

// driver controllers 

export const verifyDriverProfile = async (req, res) => {

    const {
        avatar,
        nrc,
        licenseNumber,
        licenseExpiry,
        canDriver,
        canDeliver,
        vehicleReg,
        carMake,
        carModel,
        carColor,
        seats,
        vehicleImage1,
        vehicleImage2,
        insuranceCertificateImage,
        driversLicenseImage
    } = req.body;

    const user = req.user;

    if(!user) {
        return res.status(403).json({ error: "Unauthorized", success: false})
    }

    if (!avatar || !nrc || !licenseNumber || !licenseExpiry || !vehicleReg || !carMake || !carModel || !carColor || !seats || !vehicleImage1 || !vehicleImage2 || !insuranceCertificateImage || !driversLicenseImage ) {
        return res.status(400).json({ error: "Missing required fields", success: false });
    }
    
    const driverRef = db.collection('drivers').doc(user.uid);

    const newDriverApplication = {
        driverId: user.uid,
        avatar,
        nrc,
        licenseNumber,
        licenseExpiry,
        vehicleReg,
        carMake,
        carModel,
        carColor,
        seats,
        vehicleImage1,
        vehicleImage2,
        insuranceCertificateImage,
        canDriver,
        canDeliver,
        driversLicenseImage,
        driverVerificationStatus: "pending",
        createdAt: FieldValue.serverTimestamp()
    }

    try {

        const driverApplicationsRef = db.collection("driver-applications").doc();

        await driverApplicationsRef.set(newDriverApplication);

        await driverRef.update({
            avatar,
            vehicleReg,
            carMake,
            carModel,
            carColor,
            seats,
            canDriver,
            canDeliver,
            driverVerificationStatus: "pending",
            createdAt: FieldValue.serverTimestamp()
        })

        const updatedDriverDoc = await driverRef.get();
        const updatedDriver = updatedDriverDoc.data();

        return res.status(200).json({
            driver: updatedDriver,
            message: "Driver information uploaded successfully",
            success: true,
        });
    } catch (error) {
        console.error('Error updating driver profile details:', error);
        return res.status(500).json({
            message: "Error updating driver profile details",
            error: error.message,
            success: false,
        });
    }
}

export const checkDriverApplication = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    try {
        const applicationsSnapshot = await db.collection("driver-applications")
            .where("driverId", "==", user.uid)
            .get();

        if (applicationsSnapshot.empty) {
            return res.status(404).json({ success: false, message: "Application not found." });
        }

        const applicationDoc = applicationsSnapshot.docs[0];
        const applicationData = applicationDoc.data();
        const { driverVerificationStatus } = applicationData;

        if (driverVerificationStatus === "approved") {
            return res.status(200).json({ success: true, message: "Driver verified successfully" });
        } else if (driverVerificationStatus === "failed") {
            return res.status(200).json({ success: true, message: "Driver application failed"  });
        } else if (driverVerificationStatus === "pending") {
            return res.status(200).json({ success: true, message: "Application is still pending" });
        } else {
            return res.status(400).json({ success: false, message: "Invalid verification status" });
        }

    } catch (error) {
        console.error("Error processing application:", error);
        return res.status(500).json({ success: false, error: "Internal server error." });
    }
};

export const updateDriverStatus = async (req, res) => {

    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    const { status } = req.body;

    try {
        const driverRef = db.collection('drivers').doc(user.uid);
        await driverRef.update({
            driverStatus: status
        });

        res.status(200).json({ message: "Driver status updated successfully", success: true });

    } catch (error) {
        console.error("Error updating driver status:", error);
        res.status(500).json({ error: "Error updating driver status.", success: false });
    }

};

export const getDriverInfo = async (req, res) => {

    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    const driverRef = db.collection('drivers').doc(user.uid);

    try {
        const doc = await driverRef.get();

        console.log("this is the user", user.uid)

        if (!doc.exists) {
            console.log("this is doc", doc.data)
            console.log("is it true", doc.exists)
            return res.status(404).json({ error: "Driver not found", success: false });
        }

        const driverData = {
            driverId: doc.id,
            ...doc.data(),
        }

        res.status(200).json(driverData);
        
    } catch (error) {
        res.status(500).json({ error: "Error when obtaining profile details.", success: false });
    }

};

export const getTotalTrips = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(401).json({ error: "Unauthorized", success: false });
    }

    try {
        const bookingsSnapshot = await db.collection("bookings").where("driverId", "==", user.uid).get();

        const totalTrips = bookingsSnapshot.size; 

        return res.status(200).json({ totalTrips });

    } catch (error) {
        console.error("Error getting driver bookings:", error);
        return res.status(500).json({ error: "Error when obtaining total trips", success: false });
    }
};

export const getTotalEarnings = async (req, res) => {

    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    try {
        const bookingsSnapshot = await db.collection('bookings').where('driverId', '==', user.uid).get();
        let totalEarnings = 0;

        bookingsSnapshot.forEach(doc => {
            const booking = doc.data();
            if (booking.paymentStatus === 'completed') {
                totalEarnings += booking.price;
            }
        });

        res.status(200).json({ totalEarnings });
    } catch (error) {
        console.error("Error getting total earnings:", error);
        res.status(500).json({ error: "Error when obtaining profile details." });
    }

};

export const getDriverStatistics = async (req, res) => {

    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    try {
        const driverRef = db.collection('drivers').doc(user.uid);
        const driverDoc = await driverRef.get();

        if (!driverDoc.exists) {
            return res.status(404).json({ error: "Driver not found" });
        }

        const totalEarnings = await getTotalEarningsInternal({ currentUser: user }, res);
        const completedRides = await db.collection('bookings').where('driverId', '==', user.uid).where('status', '==', 'completed').get();

        const statistics = {
            totalEarnings: totalEarnings.totalEarnings,
            completedRides: completedRides.size,
        };

        res.status(200).json(statistics);
    } catch (error) {
        console.error("Error getting driver statistics:", error);
        res.status(500).json({ error: "Error when obtaining profile details." });
    }

};

const getTotalEarningsInternal = async (req, res) => {

    const user = req.user;

    try {
        const bookingsSnapshot = await db.collection('bookings').where('driverId', '==', user.uid).get();
        let totalEarnings = 0;

        bookingsSnapshot.forEach(doc => {
            const booking = doc.data();
            if (booking.paymentStatus === 'completed') {
                totalEarnings += booking.price;
            }
        });

        return { totalEarnings };

    } catch (error) {
        console.error("Error getting total earnings:", error);
        throw new Error("Error when obtaining profile details.");
    }

};



