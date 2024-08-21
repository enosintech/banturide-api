import { db, getAuth, createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword, signOut, deleteUser, sendPasswordResetEmail } from "../config/firebase.js";

const auth = getAuth();

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
        // Create user with email and password
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        try {
            // Check if the user already exists in Firestore
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                await deleteUser(user); // Rollback user creation
                return res.status(400).json({ message: "User already exists", success: false });
            }

            // Add user data to Firestore
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
                success: true
            });

        } catch (firestoreError) {
            await deleteUser(user); // Rollback user creation in case of Firestore error
            console.log("Error saving user information to Database : ", firestoreError)
            return res.status(500).json({ 
                message: "Failed to write user data to Firestore. User creation rolled back.", 
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

export const registerDriverController = async (req, res) => {
    const { email, password, firstname, lastname, dob, phoneNumber, address } = req.body;

    if (!email || !password || !firstname || !lastname || !dob || !phoneNumber || !address) {
        return res.status(422).json({
            message: "Missing required fields",
            fields: {
                email: !email ? "Email is required" : undefined,
                password: !password ? "Password is required" : undefined,
                firstname: !firstname ? "First name is required" : undefined,
                lastname: !lastname ? "Last name is required" : undefined,
                dob: !dob ? "Date of birth is required" : undefined,
                phoneNumber: !phoneNumber ? "Phone number is required" : undefined,
                address: !address ? "Address is required" : undefined,
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

            await db.collection('drivers').doc(user.uid).set({
                userId: user.uid,
                firstname,
                lastname,
                dob,
                email,
                phoneNumber,
                address,
                role: 'driver',
                driverStatus: 'unavailable',
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

            await sendEmailVerification(user);

            return res.status(201).json({ message: "Driver registered successfully. Verify your Email", success: false });

        } catch (firestoreError) {
            await deleteUser(user);
            console.log("Error saving driver info to fireStore", firestoreError)
            return res.status(500).json({ 
                message: "Failed to write driver data to Firestore. User creation rolled back.",
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
            return res.status(500).json({ message: "An error occurred while registering driver", success: false });
        }
    }
};

export const signinController = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(422).json({
            message: "Missing required fields",
            fields: {
                email: !email ? "Email is required" : undefined,
                password: !password ? "Password is required" : undefined,
            },
            success: false
        });
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // if (!user.emailVerified) {
        //     return res.status(403).json({ message: "Email not verified", success: false });
        // }

        res.status(200).json({ message: "Logged in successfully", userCredential, success: true });

    } catch (error) {
        console.log("An error occured while loggin in ", error)
        if (error.code === 'auth/user-not-found') {
            return res.status(404).json({ message: "User not found", success: false });
        } else if (error.code === 'auth/wrong-password') {
            return res.status(401).json({ message: "Incorrect password", success: false });
        } else if (error.code === 'auth/invalid-email') {
            return res.status(400).json({ message: "Invalid email address", success: false });
        } else {
            return res.status(500).json({ message: "An error occurred while logging in", success: false});
        }
    }
};

export const signoutController = async (req, res) => {
    try {
        await signOut(auth);
        res.status(200).json({ message: "Logged out successfully", success: true });
    } catch (error) {
        console.log("An error occured while logging out", error)
        res.status(500).json({ message: "An error occurred while logging out", success: false });
    }
};

export const forgotPassword = async (req, res) => {

    const { email } = req.body;

    if (!email) {
        return res.status(422).json({
            message: "Missing required fields",
            fields: {
                email: "Email is required",
            },
            success: false
        });
    }

    try {
        await sendPasswordResetEmail(auth, email);

        res.status(200).json({
            message: "Password reset email sent successfully",
            success: true
        });
    } catch (error) {
        console.log("An error occured while sending password reset email", error);
        if (error.code === 'auth/invalid-email') {
            return res.status(400).json({ message: "Invalid email address", success: false });
        } else if (error.code === 'auth/user-not-found') {
            return res.status(404).json({ message: "User not found", success: false });
        } else {
            return res.status(500).json({ message: "An error occurred while sending password reset email", success: false });
        }
    }
};
