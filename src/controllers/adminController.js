import { FieldValue } from "firebase-admin/firestore";

import { db } from "../config/firebase.js";

import { sendDataToClient } from "../../server.js";


export const getAllDriverApplications = async (req, res) => {
    try {
        const applicationsSnapshot = await db.collection('driver-applications').get();
        
        if (applicationsSnapshot.empty) {
            return res.status(404).json({
                success: false,
                message: "No driver applications found"
            });
        }

        const applications = applicationsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        return res.status(200).json({
            success: true,
            applications
        });

    } catch (error) {
        console.error("Error fetching driver applications:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


export const getAllComplaints = async (req, res) => {
    try {
        const complaintsSnapshot = await db.collection('complaints').get();
        
        if (complaintsSnapshot.empty) {
            return res.status(404).json({
                success: false,
                message: "No complaints found"
            });
        }

        const complaints = complaintsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        return res.status(200).json({
            success: true,
            complaints
        });

    } catch (error) {
        console.error("Error fetching complaints:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};



export const approveDriverApplication = async (req, res) => {
    const { applicationId, driverId, bookingClass, deliveryClass } = req.body;

    if (!applicationId || !driverId) {
        return res.status(400).json({
            success: false,
            message: "Driver id and application id are required"
        });
    }

    try {
        await db.runTransaction(async (transaction) => {
            // Perform all reads first
            const applicationRef = db.collection('driver-applications').doc(applicationId);
            const driverRef = db.collection('drivers').doc(driverId);

            const [applicationDoc, driverDoc] = await Promise.all([
                transaction.get(applicationRef),
                transaction.get(driverRef)
            ]);

            // Validate the reads
            if (!applicationDoc.exists) {
                throw new Error("Driver application not found");
            }

            if (!driverDoc.exists) {
                throw new Error("Driver not found");
            }

            // Prepare update data for driver
            const driverUpdateData = {
                driverVerificationStatus: 'approved'
            };

            if (bookingClass) {
                driverUpdateData.bookingClass = bookingClass;
            }
            if (deliveryClass) {
                driverUpdateData.deliveryClass = deliveryClass;
            }

            // After all reads are complete, perform the writes
            transaction.update(applicationRef, {
                driverVerificationStatus: 'approved'
            });
            transaction.update(driverRef, driverUpdateData);
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
    const { driverId, applicationId, reason } = req.body;

    if (!driverId || !applicationId || !reason) {
        return res.status(400).json({
            success: false,
            message: "Driver id, application id and reason are required"
        });
    }

    try {
        await db.runTransaction(async (transaction) => {
            // Perform all reads first
            const applicationRef = db.collection('driver-applications').doc(applicationId);
            const driverRef = db.collection('drivers').doc(driverId);

            const [applicationDoc, driverDoc] = await Promise.all([
                transaction.get(applicationRef),
                transaction.get(driverRef)
            ]);

            // Validate the reads
            if (!applicationDoc.exists) {
                throw new Error("Driver application not found");
            }

            if (!driverDoc.exists) {
                throw new Error("Driver not found");
            }

            // After all reads are complete, perform the writes
            const updateData = {
                driverVerificationStatus: 'failed',
                reason
            };

            transaction.update(applicationRef, updateData);
            transaction.update(driverRef, updateData);
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
