import { FieldValue } from "firebase-admin/firestore";

import { db } from "../config/firebase.js";

export const addFavoriteLocation = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    const { type, address, name } = req.body;

    if (!type || !address || !name) {
        return res.status(422).json({
            message: "Missing required fields",
            fields: {
                type: !type ? "Type is required" : undefined,
                address: !address ? "Address is required" : undefined,
                name: !name ? "Name is required" : undefined,
            },
            success: false
        });
    }

    try {
        const favoriteLocation = {
            userId: user.uid,
            type,
            address,
            name,
            createdAt: FieldValue.serverTimestamp(),
        };

        const favoriteRef = db.collection('favoriteLocations').doc();
        await favoriteRef.set(favoriteLocation);

        res.status(201).json({ message: "favorite location added successfully", success: true });
    } catch (error) {
        console.log("Error adding favorite location", error);
        res.status(500).json({ error: "Error adding favorite location", success: false });
    }
};

export const getFavoriteLocations = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    try {
        const favoriteLocationsSnapshot = await db.collection('favoriteLocations').where('userId', '==', user.uid).get();
        const favoriteLocations = favoriteLocationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json({ favoriteLocations, success: true});

    } catch (error) {
        console.log("Error getting favorite locations", error);
        res.status(500).json({ error: "Error getting favorite locations", success: false });
    }
};

export const updateFavoriteLocation = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    const { locationId, address, name } = req.body;

    if (!locationId || !address || !name) {
        return res.status(422).json({
            message: "Missing required fields",
            fields: {
                locationId: !locationId ? "location id is required" : undefined,
                address: !address ? "Address is required" : undefined,
                name: !name ? "Name is required" : undefined,
            },
            success: false
        });
    }

    try {
        const favoriteRef = db.collection('favoriteLocations').doc(locationId);
        const favoriteDoc = await favoriteRef.get();

        if (!favoriteDoc.exists) {
            return res.status(404).json({ error: 'Favorite location not found', success: false });
        }

        const favoriteData = favoriteDoc.data();
        if (favoriteData.userId !== user.uid) {
            return res.status(403).json({ error: "You do not have permission to update this location", success: false });
        }

        await favoriteRef.update({
            address,
            name,
            updatedAt: FieldValue.serverTimestamp()
        });

        res.status(200).json({ message: "Favorite location updated successfully!", success: true});
    } catch (error) {
        console.error("Error updating favorite location", error);
        res.status(500).json({ error: "Error updating favorite location", success: false });
    }
};

export const deleteFavoriteLocation = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    const { locationId } = req.body;

    if (!locationId) {
        return res.status(422).json({
            message: "Missing required fields",
            fields: {
                locationId: !locationId ? "location id is required" : undefined,
            },
            success: false
        });
    }

    try {
        const favoriteRef = db.collection('favoriteLocations').doc(locationId);
        const favoriteDoc = await favoriteRef.get();

        if (!favoriteDoc.exists) {
            return res.status(404).json({ error: 'Favorite location not found' , success: false});
        }

        const favoriteData = favoriteDoc.data();
        if (favoriteData.userId !== user.uid) {
            return res.status(403).json({ error: "You do not have permission to update this location", success: false });
        }

        await favoriteRef.delete();

        res.status(200).json({ message: 'Favorite location deleted Successfully!', success: true });
    } catch (error) {
        console.error("Error deleting favorite location", error);
        res.status(500).json({ error: "Error deleting favorite location", success: false });
    }
};
