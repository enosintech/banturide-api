import { fileURLToPath } from 'url';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

import { db } from "../config/firebase.js";
import cloudinary from "../config/cloudinary.js";

// Ensure uploads directory exists
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb('Error: Images Only!');
        }
    }
}).single('avatar');

// passenger controllers

export const getUserProfile = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: "User not found" });
        }

        const userData = {
            userId: user.uid,
            ...userDoc.data(),
        }

        res.status(200).json(userData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Upload profile picture
export const uploadProfilePicture = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    upload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ success: false, error: err });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        try {
            const uploadResponse = await cloudinary.uploader.upload(req.file.path, { public_id: `profile_${user.uid}` });
            await db.collection('users').doc(user.uid).update({ avatar: uploadResponse.secure_url });

            res.status(200).json({ message: "Profile picture uploaded successfully"});
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
};

// Remove profile picture
export const removeProfilePicture = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists || !userDoc.data().avatar) {
            return res.status(400).json({ error: "No profile picture to remove" });
        }

        const publicId = userDoc.data().avatar.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(publicId);

        await db.collection('users').doc(user.uid).update({ avatar: null });

        const updatedUserDoc = await db.collection('users').doc(user.uid).get();
        res.status(200).json({ message: "profile picture successfully removed"});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Edit user's name
export const editUserName = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    const { firstname, lastname } = req.body;

    try {
        await db.collection('users').doc(user.uid).update({ firstname, lastname });
        res.status(200).json({ message: "Username updated successfully"});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Toggle notifications for user
export const toggleNotifications = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    const { value } = req.body;

    try {
        await db.collection('users').doc(user.uid).update({ notificationsEnabled: value });
        res.status(200).json("Notifications updated successfully");
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Toggle driver should call
export const toggleDriverShouldCall = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    const { value } = req.body;

    try {
        await db.collection('users').doc(user.uid).update({ driverShouldCall: value });
        res.status(200).json({ message: "Driver Should Call Updated Successfully"});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// driver controllers 

// Edit driver profile
export const editDriverProfile = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    const { firstName, lastName, dob, email, phoneNumber, nrcNumber, address, vehicleInfo } = req.body;
    const driverRef = db.collection('drivers').doc(user.uid);

    try {
        await driverRef.update({
            firstName,
            lastName,
            dob,
            email,
            phoneNumber,
            nrcNumber,
            address,
            vehicleInfo
        });
        const updatedDriver = await driverRef.get();
        res.status(200).json(updatedDriver.data());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Toggle driver availability
export const toggleDriverAvailability = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    const driverRef = db.collection('drivers').doc(user.uid);

    try {
        const doc = await driverRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: "Driver not found" });
        }
        const currentStatus = doc.data().driverStatus;
        await driverRef.update({
            driverStatus: currentStatus === 'available' ? 'unavailable' : 'available'
        });
        const updatedDoc = await driverRef.get();
        res.status(200).json(updatedDoc.data());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get all driver information
export const getDriverInfo = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    const driverRef = db.collection('drivers').doc(user.uid);

    try {
        const doc = await driverRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: "Driver not found" });
        }

        const driverData = {
            driverId: doc.id,
            ...doc.data(),
        }

        res.status(200).json(driverData);
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


// Get Total Earnings
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
        res.status(500).json({ error: error.message });
    }
};

// Update Driver Status (e.g., set status to 'online' or 'offline')
export const updateDriverStatus = async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    const { status } = req.body;

    try {
        const driverRef = db.collection('drivers').doc(user.uid);
        await driverRef.update({
            status: status
        });

        res.status(200).json({ message: "Driver status updated successfully" });
    } catch (error) {
        console.error("Error updating driver status:", error);
        res.status(500).json({ error: error.message });
    }
};

// Get Driver Statistics
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

        const driverData = driverDoc.data();
        const totalEarnings = await getTotalEarningsInternal({ currentUser: user }, res);
        const completedRides = await db.collection('bookings').where('driverId', '==', user.uid).where('status', '==', 'completed').get();

        const statistics = {
            totalEarnings: totalEarnings.totalEarnings,
            completedRides: completedRides.size,
        };

        res.status(200).json(statistics);
    } catch (error) {
        console.error("Error getting driver statistics:", error);
        res.status(500).json({ error: error.message });
    }
};

// Helper function for getting total earnings (used internally)
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
        throw new Error(error.message);
    }
};



