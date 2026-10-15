
import os
import urllib.request
import urllib.parse
import json
import uuid
import datetime


# ============================================================
# FAST2SMS CONFIGURATION
# Load these values from your Django environment / .env file.
# ============================================================

FAST2SMS_API_KEY = os.environ.get("FAST2SMS_API_KEY", "").strip()
DEFAULT_PHONE = os.environ.get("EVACSIM_ALERT_PHONE", "").strip()

FAST2SMS_URL = "https://www.fast2sms.com/dev/bulkV2"

# In-memory log of dispatched SMS messages.
# This log resets whenever the Django process restarts.
SMS_DISPATCH_LOG = []


def send_emergency_sms(
    phone=None,
    message=None,
    hazard_type="fire",
    floor="Ground",
):
    """
    Send an emergency evacuation SMS using Fast2SMS.

    Args:
        phone: Recipient's Indian mobile number.
               Defaults to EVACSIM_ALERT_PHONE.
        message: Custom SMS message. If omitted, a default
                 evacuation alert is generated.
        hazard_type: Type of simulated hazard.
        floor: Location of the hazard.

    Returns:
        A dictionary containing the SMS request status,
        provider response, and dispatch details.

    Note:
        ACCEPTED means the provider accepted the request.
        It does not guarantee delivery to the handset.
    """

    # --------------------------------------------------------
    # 1. Validate recipient phone number
    # --------------------------------------------------------

    phone = phone or DEFAULT_PHONE

    clean_phone = (
        str(phone)
        .replace("+", "")
        .replace(" ", "")
        .replace("-", "")
        .replace("(", "")
        .replace(")", "")
    )

    # Convert an Indian +91 number to its 10-digit local form.
    if clean_phone.startswith("91") and len(clean_phone) == 12:
        local_phone = clean_phone[2:]
    else:
        local_phone = clean_phone

    if not local_phone.isdigit() or len(local_phone) != 10:
        return {
            "success": False,
            "status": "FAILED",
            "error": "Configure a valid 10-digit Indian phone number.",
        }

    # --------------------------------------------------------
    # 2. Validate API key
    # --------------------------------------------------------

    api_key = os.environ.get(
        "FAST2SMS_API_KEY",
        FAST2SMS_API_KEY,
    ).strip()

    if not api_key:
        return {
            "success": False,
            "status": "FAILED",
            "error": "FAST2SMS_API_KEY is not configured.",
        }

    # --------------------------------------------------------
    # 3. Build emergency alert message
    # --------------------------------------------------------

    if not message:
        message = (
            "EVACSIM EMERGENCY ALERT: "
            f"{str(hazard_type).upper()} detected on {floor}. "
            "Move away from the affected area and follow "
            "the simulation's designated safe evacuation route."
        )

    message = str(message).strip()

    if not message:
        return {
            "success": False,
            "status": "FAILED",
            "error": "SMS message cannot be empty.",
        }

    # --------------------------------------------------------
    # 4. Prepare dispatch record
    # --------------------------------------------------------

    msg_id = f"SMS-{uuid.uuid4().hex[:8].upper()}"

    timestamp = datetime.datetime.now().isoformat(
        timespec="seconds"
    )

    sms_uri = (
        f"sms:+91{local_phone}"
        f"?body={urllib.parse.quote(message)}"
    )

    gateway_used = "Fast2SMS"
    delivery_status = "FAILED"
    external_response = None

    # --------------------------------------------------------
    # 5. Send SMS through Fast2SMS
    # --------------------------------------------------------

    try:
        payload = json.dumps({
            "route": "q",
            "message": message,
            "language": "english",
            "flash": 0,
            "numbers": local_phone,
        }).encode("utf-8")

        request = urllib.request.Request(
            FAST2SMS_URL,
            data=payload,
            headers={
                "authorization": api_key,
                "Content-Type": "application/json",
            },
            method="POST",
        )

        with urllib.request.urlopen(
            request,
            timeout=3.0,
        ) as response:
            http_status = response.status
            response_text = response.read().decode("utf-8")

        try:
            external_response = json.loads(response_text)
        except json.JSONDecodeError:
            external_response = {
                "response": response_text,
            }

        provider_accepted = (
            200 <= http_status < 300
            and isinstance(external_response, dict)
            and external_response.get("return") is True
        )

        if provider_accepted:
            delivery_status = "ACCEPTED"
        else:
            delivery_status = "FAILED"

    except urllib.error.HTTPError as exc:
        try:
            err_body = exc.read().decode("utf-8")
            err_json = json.loads(err_body)
            external_response = err_json
            err_msg = err_json.get("message", "")
            if "100 INR" in err_msg:
                gateway_used = "Fast2SMS (Needs ₹100 Recharge for Cellular Towers)"
            else:
                gateway_used = f"Fast2SMS ({err_msg[:40]})"
        except Exception:
            external_response = {"error": f"HTTP {exc.code}: {exc.reason}"}
        delivery_status = "GATEWAY_PAYMENT_REQUIRED" if "100 INR" in str(external_response) else "FAILED"
    except Exception as exc:
        external_response = {
            "error": str(exc),
        }
        delivery_status = "FAILED"

    # --------------------------------------------------------
    # 6. Record the result
    # --------------------------------------------------------

    dispatch_entry = {
        "id": msg_id,
        "phone": f"+91 {local_phone}",
        "raw_phone": local_phone,
        "hazard_type": hazard_type,
        "floor": floor,
        "message": message,
        "char_count": len(message),
        "timestamp": timestamp,
        "status": delivery_status,
        "gateway": gateway_used,
        "sms_uri": sms_uri,
        "external_response": external_response,
        "success": delivery_status == "ACCEPTED",
    }

    SMS_DISPATCH_LOG.insert(0, dispatch_entry)

    if len(SMS_DISPATCH_LOG) > 50:
        SMS_DISPATCH_LOG.pop()

    print(
        f"[EVACSIM SMS] {msg_id} | "
        f"Recipient: +91 {local_phone} | "
        f"Status: {delivery_status}"
    )

    return dispatch_entry
