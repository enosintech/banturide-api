import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase.js";

import { sendDataToClient } from "../../server.js";

export const deliveryRequest = async (req, res ) => {
    const { } = req.body;

    const user = req.user;

    if(!user) {
        return res.status(400).json({
            success: false,
            message: "Unauthorized"
        })
    }

    try {

    } catch (error) {

    } 
};

export const searchAndAssignDriverToDelivery = async ( req, res ) => {

    const { } = req.body;

    try {

    } catch (error) {

    }
}

export const findNewDriverForDelivery = async (req, res) => {
    const { } = req.body;

    try {

    } catch (error) {

    }
}

export const cancelDelivery = async (req, res) => {
    const { } = req.body;

    try {

    } catch (error) {

    }
}

export const deliveryRiderAtPickUp = async (req, res) => {
    const { } = req.body;

    try {

    } catch (error) {

    }
} 

export const startDelivery = async ( req, res ) => {
    const { } = req.body;

    try {

    } catch (error) {

    }
}

export const deliveryRiderAtDropOff = async (req, res) => {
    const { } = req.body;

    try {

    } catch (error) {

    }
}