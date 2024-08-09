import { db, getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser } from "../config/firebase.js";

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
            }
        });
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                await deleteUser(user);
                return res.status(400).json({ message: "User already exists" });
            }

            await db.collection('users').doc(user.uid).set({
                userId: user.uid,
                firstname,
                lastname,
                email,
                gender,
                avatar: null,
                role: 'user',
                createdAt: new Date().toISOString()
            });

            return res.status(201).json({ message: "User created successfully", userCredential });

        } catch (firestoreError) {
            await deleteUser(user);
            return res.status(500).json({ 
                message: "Failed to write user data to Firestore. User creation rolled back.", 
                error: firestoreError 
            });
        }
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            return res.status(400).json({ message: "Email is already in use" });
        } else if (error.code === 'auth/invalid-email') {
            return res.status(400).json({ message: "Invalid email address" });
        } else if (error.code === 'auth/weak-password') {
            return res.status(400).json({ message: "Password is too weak" });
        } else {
            return res.status(500).json({ message: "An error occurred while registering user" });
        }
    }
};

export const registerDriverController = async (req, res) => {
    const { email, password, firstname, lastname, dob, phoneNumber, nrcNumber, address } = req.body;

    if (!email || !password || !firstname || !lastname || !dob || !phoneNumber || !nrcNumber || !address) {
        return res.status(422).json({
            message: "Missing required fields",
            fields: {
                email: !email ? "Email is required" : undefined,
                password: !password ? "Password is required" : undefined,
                firstname: !firstname ? "First name is required" : undefined,
                lastname: !lastname ? "Last name is required" : undefined,
                dob: !dob ? "Date of birth is required" : undefined,
                phoneNumber: !phoneNumber ? "Phone number is required" : undefined,
                nrcNumber: !nrcNumber ? "NRC number is required" : undefined,
                address: !address ? "Address is required" : undefined,
            }
        });
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                await deleteUser(user);
                return res.status(400).json({ message: "User already exists" });
            }

            await db.collection('drivers').doc(user.uid).set({
                userId: user.uid,
                firstname,
                lastname,
                dob,
                email,
                phoneNumber,
                nrcNumber,
                address,
                role: 'driver',
                driverStatus: 'available',
                isVerifiedDriver: false,
                rated: false,
                knownFor: ["New Driver"],
                location: {
                    type: "Point",
                    coordinates: [0, 0]
                },
                createdAt: new Date().toISOString()
            });

            return res.status(201).json({ message: "Driver registered successfully", userCredential });

        } catch (firestoreError) {
            await deleteUser(user);
            return res.status(500).json({ 
                message: "Failed to write driver data to Firestore. User creation rolled back.", 
                error: firestoreError 
            });
        }
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            return res.status(400).json({ message: "Email is already in use" });
        } else if (error.code === 'auth/invalid-email') {
            return res.status(400).json({ message: "Invalid email address" });
        } else if (error.code === 'auth/weak-password') {
            return res.status(400).json({ message: "Password is too weak" });
        } else {
            return res.status(500).json({ message: "An error occurred while registering driver" });
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
            }
        });
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);

        res.status(200).json({ message: "Logged in successfully", userCredential });
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            return res.status(404).json({ message: "User not found" });
        } else if (error.code === 'auth/wrong-password') {
            return res.status(401).json({ message: "Incorrect password" });
        } else if (error.code === 'auth/invalid-email') {
            return res.status(400).json({ message: "Invalid email address" });
        } else {
            return res.status(500).json({ message: "An error occurred while logging in", error: error});
        }
    }
};

export const signoutController = async (req, res) => {
    try {
        await signOut(auth);
        res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
        res.status(500).json({ message: "An error occurred while logging out" });
    }
};
