import { db, getAuth, createUserWithEmailAndPassword, sendEmailVerification,  deleteUser, } from "../config/firebase.js";

const auth = getAuth();

export const registerDriverController = async (req, res) => {

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
            driverStatus: "unavailable",
            isVerifiedDriver: false,
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
    const { email, password, firstname, lastname, gender } = req.body;

    if (!email || !password || !firstname || !lastname) {
        return res.status(422).json({
            message: "Missing required fields",
            fields: {
                email: !email ? "Email is required" : undefined,
                password: !password ? "Password is required" : undefined,
                firstname: !firstname ? "First name is required" : undefined,
                lastname: !lastname ? "Last name is required" : undefined,
            },
            success: false
        });
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                await deleteUser(user); 
                return res.status(400).json({ message: "User already exists", success: false });
            }

            await db.collection('users').doc(user.uid).set({
                userId: user.uid,
                firstname,
                lastname,
                email,
                gender: gender || "Unspecified",
                driverShouldCall: false,
                notificationsEnabled: true,
                avatar: null,
                role: 'user',
                createdAt: new Date().toISOString()
            });

            await sendEmailVerification(user);

            return res.status(201).json({ 
                message: "User created successfully. Please verify your email.", 
                success: true,
                userCredential
            });

        } catch (firestoreError) {
            await deleteUser(user);
            console.log("Error saving user information to Database : ", firestoreError)
            return res.status(500).json({ 
                message: "An error occurred while registering user", 
                success: false
            });
        }

    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            return res.status(400).json({ message: "Email is already in use", success: false });
        } else if (error.code === 'auth/invalid-email') {
            return res.status(400).json({ message: "Invalid email address", success: false });
        } else if (error.code === 'auth/weak-password') {
            return res.status(400).json({ message: "Password is too weak", success: false });
        } else {
            return res.status(500).json({ message: "An error occurred while registering user", success: false });
        }
    }
};
