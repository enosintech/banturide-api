import { FieldValue } from "firebase-admin/firestore";

import { db } from "../config/firebase.js";

import { sendDataToClient } from "../../server.js";

export const approveDriverApplication = async (req, res) => {

    const user = req.user;

    // Uncomment this if user authentication is required
    // if (!user) {
    //     return res.status(401).json({
    //         success: false,
    //         message: "Unauthorized"
    //     });
    // }

    const { applicationId, driverId, bookingClass, deliveryClass } = req.body;

    if (!applicationId || !driverId) {
        return res.status(400).json({
            success: false,
            message: "Driver id and application id are required"
        });
    }

    try {
        await db.runTransaction(async (transaction) => {
            const applicationRef = db.collection('driver-applications').doc(applicationId);
            const applicationDoc = await transaction.get(applicationRef);

            if (!applicationDoc.exists) {
                throw new Error("Driver application not found");
            }

            transaction.update(applicationRef, {
                driverVerificationStatus: 'approved'
            });

            const driverRef = db.collection('drivers').doc(driverId);
            const driverDoc = await transaction.get(driverRef);

            if (!driverDoc.exists) {
                throw new Error("Driver not found");
            }

            const updateData = {
                driverVerificationStatus: 'approved'
            };

            if (bookingClass) {
                updateData.bookingClass = bookingClass;
            }
            if (deliveryClass) {
                updateData.deliveryClass = deliveryClass;
            }

            transaction.update(driverRef, updateData);
        });

        return res.status(200).json({
            success: true,
            message: "Driver application approved",
            driverId
        });

    } catch (error) {
        console.error("Error approving driver application:", error);
        const statusCode = error.message.includes("not found") ? 404 : 500;
        return res.status(statusCode).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

export const denyDriverApplication = async (req, res) => {
    const user = req.user;

    // Uncomment this if user authentication is required
    // if (!user) {
    //     return res.status(401).json({
    //         success: false,
    //         message: "Unauthorized"
    //     });
    // }

    const { driverId, applicationId, reason } = req.body;

    if (!driverId || !applicationId || !reason) {
        return res.status(400).json({
            success: false,
            message: "Driver id, application id and reason are required"
        });
    }

    try {
        await db.runTransaction(async (transaction) => {
            const applicationRef = db.collection('driver-applications').doc(applicationId);
            const applicationDoc = await transaction.get(applicationRef);

            if (!applicationDoc.exists) {
                throw new Error("Driver application not found");
            }

            transaction.update(applicationRef, {
                driverVerificationStatus: 'failed',
                reason
            });

            const driverRef = db.collection('drivers').doc(driverId);
            const driverDoc = await transaction.get(driverRef);

            if (!driverDoc.exists) {
                throw new Error("Driver not found");
            }

            transaction.update(driverRef, {
                driverVerificationStatus: 'failed',
                reason
            });
        });

        return res.status(200).json({
            success: true,
            message: "Driver application denied",
            driverId
        });

    } catch (error) {
        console.error("Error denying driver application:", error);
        const statusCode = error.message.includes("not found") ? 404 : 500;
        return res.status(statusCode).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};