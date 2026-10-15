// ============================================================================
// AEGIS Wi-Fi Mobile Phone Connection & Emergency Dispatch Configuration
// ============================================================================

/**
 * 1. IPV4 ADDRESS CONFIGURATION:
 * Enter your computer's Wi-Fi IPv4 address here.
 * (Run `ipconfig` in terminal or PowerShell to view your IPv4 Address).
 * Current detected Wi-Fi IP is: 10.51.105.70
 */
export const WIFI_LAPTOP_IP = "10.51.105.70"; // <--- ENTER YOUR IPV4 ADDRESS HERE

/**
 * 2. EMERGENCY DISPATCH PHONE NUMBER:
 * Connected mobile responder / occupant contact number.
 */
export const EMERGENCY_PHONE = "7200673492"; // <--- CONNECTED PHONE NUMBER (+91 7200673492)

/**
 * Helper to get the mobile app connection URL
 */
export const getMobileAppUrl = () => {
  if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return `http://${window.location.hostname}:5173`;
  }
  return `http://${WIFI_LAPTOP_IP}:5173`;
};

/**
 * Helper to get standalone Floor Map URL for QR code scan
 * That page ONLY displays the floor map!
 */
export const getMobileFloorMapUrl = () => {
  if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return `http://${window.location.hostname}:5173/?view=map`;
  }
  return `http://${WIFI_LAPTOP_IP}:5173/?view=map`;
};

/**
 * Helper to get the API base endpoint
 */
export const getApiBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return `http://${window.location.hostname}:8000`;
  }
  return '';
};

/**
 * Direct zero-click SMS launcher endpoint
 */
export const getMobileSmsRedirectUrl = () => {
  if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return `http://${window.location.hostname}:5173/sms`;
  }
  return `http://${WIFI_LAPTOP_IP}:5173/sms`;
};
