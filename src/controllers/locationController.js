import { FieldValue } from "firebase-admin/firestore";

import { db } from "../config/firebase.js";
  
export const updateDriverLocation = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    const { latitude, longitude, description } = req.body;

    if (typeof latitude !== 'number' || typeof longitude !== 'number' || 
        isNaN(latitude) || isNaN(longitude) || 
        latitude < -90 || latitude > 90 || 
        longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: "Invalid latitude or longitude values", success: false });
    }

    if(!description) {
        return res.status(403).json({ error: "Location Description Not provided", success: false})
    }

    try {
        const driverRef = db.collection('drivers').doc(user.uid);

        await driverRef.update({
            location: {
                type: "Point",
                description: description,
                coordinates: [latitude, longitude]
            },
            updatedAt: FieldValue.serverTimestamp()
        });

        return res.status(200).json({ message: "Driver Location updated successfully", success: true });

    } catch (error) {
        console.error("Error updating driver location:", error);
        return res.status(500).json({ error: "Error updating driver location", success: false });
    }
};
