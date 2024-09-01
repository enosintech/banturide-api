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
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: "User not found", success: false });
        }

        const userData = {
            userId: user.uid,
            isVerified: user.email_verified,
            ...userDoc.data(),
        }

        res.status(200).json({ userData, success: true });
    } catch (error) {
        console.error("Error when obtaining user profile details", error)
        res.status(500).json({ error: "Error when obtaining profile details.", success: false });
    }
};

// Upload profile picture
export const uploadProfilePicture = async (req, res) => {

    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    upload(req, res, async (err) => {
        if (err) {
            console.error("Upload error:", err);
            return res.status(400).json({ success: false, error: "File upload error"});
        }

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        try {
            const uploadResponse = await cloudinary.uploader.upload(req.file.path, { public_id: `profile_${user.uid}` });

            if (!uploadResponse || !uploadResponse.secure_url) {
                return res.status(500).json({ success: false, error: 'Cloudinary upload failed or returned invalid response' });
            }

            await db.collection('users').doc(user.uid).update({ avatar: uploadResponse.secure_url });

            res.status(200).json({ message: "Profile picture uploaded successfully", success: true});
        } catch (error) {
            console.log("Error uploading profile picture", error)
            res.status(500).json({ error: "Error when obtaining profile details.", success: false });
        }
    });
    
};

// Remove profile picture
export const removeProfilePicture = async (req, res) => {

    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
            return res.status(400).json({ error: "User not found", success: false });
        }

        if(!userDoc.data().avatar){
            return res.status(400).json({ error: "No profile picture to remove ", success: false});
        }

        const publicId = userDoc.data().avatar.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(publicId);

        await db.collection('users').doc(user.uid).update({ avatar: null });

        res.status(200).json({ message: "profile picture successfully removed", success: true });
    } catch (error) {
        console.log("Error removing profile picture", error)
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
        });
        const updatedDriver = await driverRef.get();

        res.status(200).json(updatedDriver.data());
    } catch (error) {
        res.status(500).json({ error: "Error when obtaining profile details." });
    }

};

export const uploadDriverProfilePicture = async (req, res) => {

    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    upload(req, res, async (err) => {
        if (err) {
            console.error("Upload error:", err);
            return res.status(400).json({ success: false, error: "File upload error"});
        }

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        try {
            const uploadResponse = await cloudinary.uploader.upload(req.file.path, { public_id: `profile_${user.uid}` });

            if (!uploadResponse || !uploadResponse.secure_url) {
                return res.status(500).json({ success: false, error: 'Cloudinary upload failed or returned invalid response' });
            }

            await db.collection('drivers').doc(user.uid).update({ avatar: uploadResponse.secure_url });

            res.status(200).json({ message: "Profile picture uploaded successfully", success: true});
        } catch (error) {
            console.log("Error uploading profile picture", error)
            res.status(500).json({ error: "Error when obtaining profile details.", success: false });
        }
    });
    
};

// Remove profile picture
export const removeDriverProfilePicture = async (req, res) => {

    const user = req.user;

    if (!user) {
        return res.status(403).json({ error: "Unauthorized", success: false });
    }

    try {
        const userDoc = await db.collection('drivers').doc(user.uid).get();
        if (!userDoc.exists) {
            return res.status(400).json({ error: "User not found", success: false });
        }

        if(!userDoc.data().avatar){
            return res.status(400).json({ error: "No profile picture to remove ", success: false});
        }

        const publicId = userDoc.data().avatar.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(publicId);

        await db.collection('drivers').doc(user.uid).update({ avatar: null });

        res.status(200).json({ message: "profile picture successfully removed", success: true });
    } catch (error) {
        console.log("Error removing profile picture", error)
        res.status(500).json({ error: "Error when obtaining profile details.", success: false });
    }

};

export const updateDriverInfo = async (req, res) => {

    const {
        nrc,
        driversLicense,
        insuranceNumber,
        vehicleReg,
        carModel,
        carManufacturer,
        carColor,
        seats,
        canDriver,
        canDeliver,
        bookingClass,
        deliveryClass,
    } = req.body;

    const user = req.user;

    if(!user) {
        return res.status(403).json({ error: "Unauthorized", success: false})
    }

    if (!nrc || !driversLicense || !insuranceNumber || !vehicleReg || !carModel || !carManufacturer || !carColor || !seats ) {
        return res.status(400).json({ error: "Missing required fields", success: false });
    }
    
    const driverRef = db.collection('drivers').doc(user.uid);

    try {
        await driverRef.update({
            nrc,
            driversLicense,
            insuranceNumber,
            vehicleReg,
            carModel,
            carManufacturer,
            carColor,
            seats,
            canDriver,
            canDeliver,
            bookingClass,
            deliveryClass,
            isVerifiedDriver: true,
        })

        const updatedDriverDoc = await driverRef.get();
        const updatedDriver = updatedDriverDoc.data();

        return res.status(200).json({
            driver: updatedDriver,
            message: "Driver information updated successfully",
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
        res.status(200).json({ message: "Current Status Updated", currentStatus: updatedDoc.data().driverStatus});
    } catch (error) {
        res.status(500).json({ error: "Error when obtaining profile details." });
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
        res.status(500).json({ error: "Error when obtaining profile details." });
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
        res.status(500).json({ error: "Error when obtaining profile details." });
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
        res.status(500).json({ error: "Error when obtaining profile details." });
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
        throw new Error("Error when obtaining profile details.");
    }

};



