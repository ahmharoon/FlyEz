# Stitch Flights Backend - Running Instructions

## 1. Setup

### Install Dependencies
Run the following command in the `flyezbackend` directory:
```bash
npm install
```

### Environment Variables
Rename `.env.example` to `.env` and update the values if needed (especially `MONGO_URI` if you have a local instance or Atlas URI).
```bash
cp .env.example .env
```
Default config:
- PORT: 5000
- MONGO_URI: mongodb://localhost:27017/stitch_flights

## 2. Run Server

### Development Mode (with nodemon)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

## 3. API Testing (Postman)

### Import Collection
I have included a Postman Collection file: `StitchFlights_API.postman_collection.json`.
1. Open Postman.
2. Click **Import**.
3. Drag and drop `StitchFlights_API.postman_collection.json` or select it from the `flyezbackend` folder.
4. The collection uses a `baseUrl` variable (default: `http://localhost:5000`).
5. **Login first**: The Login request test script automatically sets the `token` variable, so you don't need to copy-paste it manually for subsequent requests!

### Auth
I have separated Auth into "Admin Auth" and "User Auth" folders in Postman.

**Admin**
1.  **Register Admin**: POST `http://localhost:5000/api/auth/register` (Auto-sets Admin token)
2.  **Login Admin**: POST `http://localhost:5000/api/auth/login` (Auto-sets Admin token)

**User**
1.  **Register User**: POST `http://localhost:5000/api/auth/register` (Auto-sets User token)
2.  **Login User**: POST `http://localhost:5000/api/auth/login` (Auto-sets User token)

**Important**: The last person to login (Admin or User) overwrites the `token` variable. If you want to `Create Flight`, ensure you ran **Login Admin** last. If you want to `Book Flight`, you can be either, but usually `Login User` is what you want for testing the customer flow.

### Flights
*Auth: Bearer Token required for Creation*
1.  **Add Flight (Admin)**: POST `http://localhost:5000/api/flights` (Add `Authorization: Bearer <token>` header)
    - Body: `{ "flightNumber": "SF101", "airline": "StitchAir", "origin": "NYC", "destination": "LDN", "departureDate": "2023-12-25", "departureTime": "10:00", "availableSeats": 100, "basePrice": 500 }`
2.  **Search Flights**: GET `http://localhost:5000/api/flights?origin=NYC&destination=LDN`

### Bookings
*Auth: Bearer Token required*
1.  **Book Flight**: POST `http://localhost:5000/api/bookings`
    - Body: `{ "flightId": "<FLIGHT_ID>", "numberOfSeats": 2, "seatClass": "Economy" }`
2.  **My Bookings**: GET `http://localhost:5000/api/bookings/my-bookings`
3.  **Cancel Booking**: PATCH `http://localhost:5000/api/bookings/cancel/<BOOKING_ID>`
