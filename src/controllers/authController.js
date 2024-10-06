import { db, getAuth, createUserWithEmailAndPassword, sendEmailVerification,  deleteUser, } from "../config/firebase.js";

const auth = getAuth();

export const registerDriverController = async (req, res) => {

    const user = req.user;

    if(!user) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized"
        })
    }

    const { phoneNumber, firstname, lastname, gender, dob } = req.body;

    if(!phoneNumber || !firstname || !lastname || !gender || !dob ) {
        return res.status(422).json({
            message: "Missing required fields",
            fields: {
                phoneNumber: !phoneNumber ? "phone number is required" : undefined,
                firstname: !firstname ? "firstname is required" : undefined,
                lastname: !lastname ? "lastname is required" : undefined,
                gender: !gender ? "gender is required" : undefined,
                dob: !dob ? "dob is required" : undefined
            },
            success: false
        });
    }

    try {

        const userDoc = await db.collection("drivers").doc(user.uid).get();

        if (userDoc.exists) {
            return res.status(400).json({ message: "User already exists. Sign in instead", success: false });
        }

        await db.collection("drivers").doc(user.uid).set({
            userId: user.uid,
            firstname,
            lastname,
            phoneNumber,
            dob,
            gender,
            avatar: null,
            role: "driver",
            driverStatus: "offline",
            driverVerificationStatus: "unverified",
            ratingsSum: 5.0,
            numberOfRatings: 1,
            driverRating: 5.0,
            knownFor: ["New Driver"],
            location: {
                type: "Point",
                coordinates: [0, 0]
            },
            createdAt: new Date().toISOString()
        });

        return res.status(201).json({ message: "Driver registered successfully.", success: true, })

    } catch (error) {
        return res.status(500).json({ message: "An error occured during sign up", success: false })
    }
}

export const registerPassengerController = async (req, res) => {

    const user = req.user;

    if(!user) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized"
        })
    }

    const { phoneNumber, firstname, lastname, gender } = req.body;

    if (!phoneNumber || !firstname || !lastname || !gender ) {
        return res.status(422).json({
            message: "Missing required fields",
            fields: {
                firstname: !firstname ? "First name is required" : undefined,
                lastname: !lastname ? "Last name is required" : undefined,
                phoneNumber: !phoneNumber ? "Phone number is required" : undefined,
                gender: !gender ? "Gender is required" : undefined
            },
            success: false
        });
    }

    try {
        
        const userDoc = await db.collection("passengers").doc(user.uid).get();
        
        if (userDoc.exists) {
            return res.status(400).json({ message: "User already exists. Sign in instead", success: false });
        }

        await db.collection('passengers').doc(user.uid).set({
            userId: user.uid,
            firstname,
            lastname,
            phoneNumber,
            gender: gender || "Unspecified",
            driverShouldCall: false,
            notificationsEnabled: true,
            avatar: null,
            role: 'user',
            createdAt: new Date().toISOString()
        });

        return res.status(201).json({ message: "User registered successfully.", success: true, })

    } catch (error) {
        return res.status(500).json({ message: "An error occured during sign up", success: false })
    }
};
