import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";

export const fileComplaint = async (req, res) => {
    const user = req.user;

    if(!user) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized"
        })
    }

    const { complaint, complaintRelation, complainer } = req.body;

    if(!complaint || !complaintRelation || !complainer) {
        return res.status(400).json({
            success: false,
            message: "Complaint, Complaint Relation and Complainer are required"
        })
    }

    try {

        const newComplaint = {
            userId: user.uid,
            complainer,
            complaintRelation,
            complaint,
            createdAt: FieldValue.serverTimestamp()
        }

        const complaintRef = db.collection("complaints").doc();

        await complaintRef.set(newComplaint)

        return res.status(201).json({ message: "Complaint Filed Successfully", success: true })

    } catch (error) {
        console.error("Error adding complaint", error);
        return res.status(500).json({ message: "Error filing complaint", success: false })
    }
}