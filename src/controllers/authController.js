import { db, getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser } from "../config/firebase.js";

const auth = getAuth();

export const registerPassengerController = async (req, res) => {
    const { email, password, firstname, lastname, gender } = req.body;

    // Improved validation
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
        // Create the user with Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        try {
            // Write user data to Firestore
            await db.collection('users').doc(user.uid).set({
                firstname,
                lastname,
                email,
                gender,
                avatar: null,
                role: 'user',
                createdAt: new Date().toISOString()
            });

            res.status(201).json({ message: "User created successfully", userCredential });
        } catch (firestoreError) {
            console.error('Error writing user data to Firestore:', firestoreError);

            // Roll back user creation in Firebase Authentication
            await deleteUser(user);
            res.status(500).json({ message: "Failed to write user data to Firestore. User creation rolled back." });
        }
    } catch (error) {
        console.error('Error registering user:', error);

        // More granular error handling
        if (error.code === 'auth/email-already-in-use') {
            res.status(400).json({ message: "Email is already in use" });
        } else if (error.code === 'auth/invalid-email') {
            res.status(400).json({ message: "Invalid email address" });
        } else if (error.code === 'auth/weak-password') {
            res.status(400).json({ message: "Password is too weak" });
        } else {
            res.status(500).json({ message: "An error occurred while registering user" });
        }
    }
};

export const registerDriverController = async (req, res) => {
    const { email, password, firstname, lastname, dob, phoneNumber, nrcNumber, address } = req.body;

    // Improved validation
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
        // Create the user with Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        try {
            // Write user data to Firestore
            await db.collection('drivers').doc(user.uid).set({
                firstname,
                lastname,
                dob,
                email,
                phoneNumber,
                nrcNumber,
                address,
                role: 'driver',
                driverStatus: 'available',
                rated: false,
                knownFor: ["New Driver"],
                location: {
                    type: "Point",
                    coordinates: [0, 0]
                },
                createdAt: new Date().toISOString()
            });

            res.status(201).json({ message: "Driver registered successfully", userCredential });
        } catch (firestoreError) {
            console.error('Error writing driver data to Firestore:', firestoreError);

            // Roll back user creation in Firebase Authentication
            await deleteUser(user);
            res.status(500).json({ message: "Failed to write driver data to Firestore. User creation rolled back." });
        }
    } catch (error) {
        console.error('Error registering driver:', error);

        // More granular error handling
        if (error.code === 'auth/email-already-in-use') {
            res.status(400).json({ message: "Email is already in use" });
        } else if (error.code === 'auth/invalid-email') {
            res.status(400).json({ message: "Invalid email address" });
        } else if (error.code === 'auth/weak-password') {
            res.status(400).json({ message: "Password is too weak" });
        } else {
            res.status(500).json({ message: "An error occurred while registering driver" });
        }
    }
};

export const signinController = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(422).json({
            email: "Email is required",
            password: "Password is required",
        });
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);

        res.status(200).json({ message: "Logged in successfully", userCredential });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message || "An error occurred while logging in" });
    }
}

export const signoutController = async (req, res) => {
    try {
        await signOut(auth);
        res.status(200).json({ message: "Logged out successfully"});
    } catch (error) {
        res.status(500).json( { message : "Internal Server Error"} )
    }
}
