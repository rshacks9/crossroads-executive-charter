"""Official vAMSYS Operations API locations verified from the published OpenAPI document."""

ORWELL_API_DOC = "https://vamsys.co.uk/docs/orwell/api"
OPERATIONS_DOC = "https://vamsys.io/docs/operations"
OPENAPI_URL = "https://vamsys.io/api-docs/operations.json"
BASE_URL = "https://vamsys.io/api/v3/operations"
TOKEN_URL = "https://vamsys.io/oauth/token"
READ_SCOPE = "ops:read"

# Exact GET paths in Operations OpenAPI 3.0.0. No Pilot API endpoints are included.
GET_ENDPOINTS = {
    "pilots": "/pilots",
    "fleet_types": "/fleet",
    "aircraft": "/fleet/{fleet_id}/aircraft",
    "routes": "/routes",
    "airports": "/airports",
    "bookings": "/bookings",
    "pireps": "/pireps",
}

# These prevent a safe, complete built-in mapping to the Crossroad canonical schema.
UNMAPPED_CANONICAL_SEMANTICS = (
    "No Operations GET exposes the airline profile name and ICAO/IATA codes.",
    "RouteData has fleet_ids, not one canonical aircraft_id; airport IDs require AirportData joins.",
    "BookingData has no canonical status, updated_at, or status_history fields.",
    "PirepData has no canonical landing_passed assessment and booking_id can be null.",
)
