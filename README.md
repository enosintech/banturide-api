## Overview

The API is designed to support a mobile application for e-hailing services. It facilitates seamless interactions between users and drivers, enabling efficient booking and communication. Key features include:

- **User Authentication:** Secure login and registration for users and drivers.
- **Booking Management:** Create, update, and track ride requests.
- **Real-Time Communication:** Exchange messages between users and drivers.
- **Favorite Locations:** Manage and access frequently used locations.
- **Notifications:** Receive updates about booking status and other important events.

This API ensures a smooth and responsive experience for both riders and drivers by providing essential functionalities through a straightforward and secure interface.


## Base URL

The base URL for accessing the API is:

https://banturide-api.onrender.com




### **Delivery Controller Documentation**

This document provides a comprehensive overview of the delivery controller for the e-hailing app, including the flow of the delivery process and a detailed description of the API endpoints. The delivery controller is designed to manage parcel deliveries, allowing users to request deliveries, search for available drivers in real-time, assign drivers, and update the status of deliveries.

---

## **1. Overview of the Delivery Process**

### **Flow:**
1. **Request Delivery:**
   - A user initiates a delivery request by providing pick-up and drop-off locations, selecting a vehicle type, and specifying parcel details (weight, dimensions, etc.).
   - The system calculates the delivery fare based on the distance, vehicle type, time of day, and other factors.
   - The delivery request is saved in the Firebase `delivery` collection with a status of `pending`.

2. **Real-time Driver Search:**
   - The system starts searching for available drivers within a 10-mile radius of the pick-up location.
   - Drivers must have the selected vehicle type and be marked as available for deliveries (`driverDelivery` set to `true`).
   - If a suitable driver is found, the driver is temporarily reserved for the user, and the user is notified.

3. **Driver Assignment:**
   - Once the user confirms the reserved driver, the driver is assigned to the delivery.
   - The delivery status is updated to `ongoing`, and the driver’s status is set to `unavailable`.

4. **Delivery Status Updates:**
   - The delivery status can be updated at various stages (e.g., `arrived` when the driver reaches the drop-off location, `completed` when the delivery is finished).

5. **Delivery Completion:**
   - After the delivery is completed, the status is updated to `completed`.

6. **Cancellation:**
   - The user can cancel the delivery request at any time before it is completed, providing a reason for cancellation.

---

## **2. API Endpoints**

### **2.1 Request Delivery**

- **Endpoint:** `POST /requestDelivery`
- **Description:** Initiates a delivery request by saving the delivery details in the database and calculating the delivery fare.
- **Request Body:**
  ```json
  {
      "pickUpLatitude": "float",
      "pickUpLongitude": "float",
      "dropOffLatitude": "float",
      "dropOffLongitude": "float",
      "vehicleType": "string",
      "parcelDetails": {
          "weight": "float",
          "dimensions": {
              "length": "float",
              "width": "float",
              "height": "float"
          }
      },
      "timeOfDay": "float",
      "stops": "int",
      "tollCharges": "float"
  }
  ```
- **Response:**
  ```json
  {
      "success": true,
      "message": "Delivery request received successfully!",
      "delivery": {
          "id": "string",
          "userId": "string",
          "pickUpLocation": {
              "latitude": "float",
              "longitude": "float"
          },
          "dropOffLocation": {
              "latitude": "float",
              "longitude": "float"
          },
          "vehicleType": "string",
          "parcelDetails": {
              "weight": "float",
              "dimensions": {
                  "length": "float",
                  "width": "float",
                  "height": "float"
              }
          },
          "price": "float",
          "status": "string",
          "createdAt": "timestamp"
      }
  }
  ```

### **2.2 Search Drivers for Delivery**

- **Endpoint:** `POST /searchDriversForDelivery`
- **Description:** Starts a real-time search for available drivers near the pick-up location. The search is based on the selected vehicle type, and drivers are filtered by availability (`driverDelivery`).
- **Request Body:**
  ```json
  {
      "deliveryId": "string"
  }
  ```
- **Response:**
  - On Success (Drivers found):
    ```json
    {
        "success": true,
        "message": "Drivers were found and the search is complete."
    }
    ```
  - On Timeout (No drivers found within the specified time):
    ```json
    {
        "success": false,
        "message": "No drivers found within the time limit."
    }
    ```

### **2.3 Assign Delivery Driver**

- **Endpoint:** `POST /assignDeliveryDriver`
- **Description:** Assigns a selected driver to the delivery request and updates the delivery status to `ongoing`.
- **Request Body:**
  ```json
  {
      "deliveryId": "string",
      "driverId": "string"
  }
  ```
- **Response:**
  ```json
  {
      "success": true,
      "message": "Driver assigned successfully!",
      "delivery": {
          "id": "string",
          "status": "string"
      }
  }
  ```

### **2.4 Update Delivery Status**

- **Endpoint:** `POST /updateDeliveryStatus`
- **Description:** Updates the status of the delivery at different stages (e.g., `ongoing`, `arrived`, `completed`).
- **Request Body:**
  ```json
  {
      "deliveryId": "string",
      "status": "string"
  }
  ```
- **Response:**
  ```json
  {
      "success": true,
      "message": "Delivery status updated successfully!"
  }
  ```

### **2.5 Cancel Delivery**

- **Endpoint:** `POST /cancelDelivery`
- **Description:** Cancels the delivery request and updates the status to `cancelled`.
- **Request Body:**
  ```json
  {
      "deliveryId": "string",
      "reason": "string"
  }
  ```
- **Response:**
  ```json
  {
      "success": true,
      "message": "Delivery cancelled successfully."
  }
  ```

### **2.6 Driver Arrived**

- **Endpoint:** `POST /deliveryArrived`
- **Description:** Marks the delivery as `arrived` when the driver reaches the drop-off location.
- **Request Body:**
  ```json
  {
      "deliveryId": "string"
  }
  ```
- **Response:**
  ```json
  {
      "success": true,
      "message": "Driver arrived at the destination."
  }
  ```

### **2.7 Complete Delivery**

- **Endpoint:** `POST /completeDelivery`
- **Description:** Marks the delivery as `completed` after the delivery process is finished.
- **Request Body:**
  ```json
  {
      "deliveryId": "string"
  }
  ```
- **Response:**
  ```json
  {
      "success": true,
      "message": "Delivery completed successfully!"
  }
  ```

---

## **3. Database Structure**

### **3.1 Delivery Collection**
- **Collection Name:** `delivery`
- **Fields:**
  - `userId`: User ID of the delivery requester
  - `pickUpLocation`: Coordinates of the pick-up location
  - `dropOffLocation`: Coordinates of the drop-off location
  - `vehicleType`: Type of vehicle selected
  - `parcelDetails`: Object containing weight and dimensions of the parcel
  - `price`: Calculated delivery fare
  - `status`: Current status of the delivery (e.g., `pending`, `ongoing`, `arrived`, `completed`, `cancelled`)
  - `createdAt`: Timestamp of when the delivery was created
  - `driverId`: ID of the assigned driver (if any)

### **3.2 Drivers Collection**
- **Collection Name:** `drivers`
- **Fields:**
  - `driverStatus`: Availability status of the driver (e.g., `available`, `reserved`, `unavailable`)
  - `driverDelivery`: Boolean indicating if the driver is available for deliveries
  - `vehicleType`: Type of vehicle the driver operates
  - `location`: Coordinates of the driver’s current location

---

## **4. Error Handling**

- **Unauthorized Access:**
  - All API endpoints verify that the user is authenticated. If a request is made without proper authentication, the system returns an unauthorized error.

- **Validation Errors:**
  - API requests validate input parameters. If required fields are missing or invalid, the system returns an error with a description of the missing or invalid fields.

- **Internal Server Errors:**
  - Any unexpected errors during the processing of a request result in an internal server error. The system logs these errors for further investigation.

---

## **5. Conclusion**

The delivery controller provides a comprehensive set of APIs to manage the entire delivery process in the e-hailing app, from requesting deliveries to searching for drivers in real-time, and completing or canceling deliveries. This documentation should guide the integration and usage of these APIs in your application, ensuring a smooth and efficient delivery service for users.