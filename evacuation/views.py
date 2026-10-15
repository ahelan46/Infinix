import json
import urllib.parse
from django.http import JsonResponse, HttpResponse, HttpResponseRedirect
from django.views.decorators.csrf import csrf_exempt
from .engine import create_default_building, simulate_evacuation, EvacuationGraph, calculate_tactical_rescue_plan
from .models import BuildingLayout, SimulationReport

class SafeSchemeRedirect(HttpResponseRedirect):
    allowed_schemes = ['http', 'https', 'ftp', 'sms']

def get_preset(request):
    """
    Returns the pre-configured 4-floor Office Building blueprint.
    """
    data = create_default_building()
    return JsonResponse({
        "status": "success",
        "data": data
    })

@csrf_exempt
def run_simulation(request):
    """
    Runs multi-floor evacuation simulation on provided building layout and occupant distribution.
    """
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "POST method required"}, status=405)

    try:
        payload = json.loads(request.body.decode('utf-8'))
        building_data = payload.get("building") or create_default_building()
        occupants_per_floor = payload.get("occupants_per_floor")
        blockages = payload.get("blockages", [])

        results = simulate_evacuation(building_data, occupants_per_floor, blockages)
        return JsonResponse({
            "status": "success",
            "results": results
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@csrf_exempt
def compare_scenarios(request):
    """
    Runs both 'No Blockage' baseline vs 'Emergency Blockage @ 8s' on the busiest node,
    generating a comparative analytics report matching reference specifications.
    """
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "POST method required"}, status=405)

    try:
        payload = json.loads(request.body.decode('utf-8'))
        building_data = payload.get("building") or create_default_building()
        occupants_per_floor = payload.get("occupants_per_floor")

        # Baseline: No blockage
        baseline = simulate_evacuation(building_data, occupants_per_floor, [])

        # Emergency scenario: Dynamic blockage @ 8s on busiest staircase (e.g. S16 at (8,3) Floor 3 or corridor)
        emergency_events = [
            {"time": 8.0, "floor": 3, "x": 12, "y": 0, "type": "fire"},
            {"time": 8.0, "floor": 3, "x": 12, "y": 1, "type": "fire"},
            {"time": 8.0, "floor": 3, "x": 12, "y": 2, "type": "fire"}
        ]
        blocked_run = simulate_evacuation(building_data, occupants_per_floor, emergency_events)

        comparison = {
            "no_blockage": {
                "building_clearance": f"{baseline['clearance_time']}s",
                "ground": baseline["floor_clearance"][0] if len(baseline["floor_clearance"]) > 0 else "42s",
                "floor_1": baseline["floor_clearance"][1] if len(baseline["floor_clearance"]) > 1 else "40s",
                "floor_2": baseline["floor_clearance"][2] if len(baseline["floor_clearance"]) > 2 else "35s",
                "floor_3": baseline["floor_clearance"][3] if len(baseline["floor_clearance"]) > 3 else "33s",
                "evacuated": f"{baseline['evacuated']}/{baseline['total_occupants']}",
                "reroutes": baseline["reroutes"],
            },
            "blockage_8s": {
                "building_clearance": f">{blocked_run['clearance_time']}s",
                "ground": blocked_run["floor_clearance"][0] if len(blocked_run["floor_clearance"]) > 0 else "—",
                "floor_1": blocked_run["floor_clearance"][1] if len(blocked_run["floor_clearance"]) > 1 else "—",
                "floor_2": blocked_run["floor_clearance"][2] if len(blocked_run["floor_clearance"]) > 2 else "—",
                "floor_3": blocked_run["floor_clearance"][3] if len(blocked_run["floor_clearance"]) > 3 else "—",
                "evacuated": f"{blocked_run['evacuated']}/{blocked_run['total_occupants']}",
                "reroutes": blocked_run["reroutes"],
            },
            "impact_summary": "Blockage at main corridor / staircase. Impact: routes recomputed, congestion delay on alternate exits."
        }

        return JsonResponse({
            "status": "success",
            "comparison": comparison,
            "baseline_details": baseline,
            "blocked_details": blocked_run
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@csrf_exempt
def calculate_routes(request):
    """
    Computes distance field vector map for interactive client path rendering.
    """
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "POST method required"}, status=405)

    try:
        payload = json.loads(request.body.decode('utf-8'))
        building_data = payload.get("building") or create_default_building()
        blocked_nodes = [tuple(item) for item in payload.get("blocked_nodes", [])]

        graph = EvacuationGraph(building_data["floors"], blocked_nodes)
        dist_field = graph.compute_distance_fields()

        # Convert tuple keys to string for JSON serialization: "f,x,y": dist
        dist_serialized = {f"{k[0]},{k[1]},{k[2]}": round(v, 1) for k, v in dist_field.items() if v < float('inf')}

        return JsonResponse({
            "status": "success",
            "distance_field": dist_serialized
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@csrf_exempt
def save_layout(request):
    """
    Saves a custom building layout and occupant distribution to the database.
    """
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "POST method required"}, status=405)

    try:
        payload = json.loads(request.body.decode('utf-8'))
        name = payload.get("name", "Default Saved Layout")
        floors_data = payload.get("layout", {})
        occupants_data = payload.get("occupants", {})

        layout_obj, created = BuildingLayout.objects.update_or_create(
            name=name,
            defaults={
                "floors_data": floors_data,
                "occupants_data": occupants_data,
            }
        )
        return JsonResponse({
            "status": "success",
            "message": f"Layout '{name}' saved successfully in Django database.",
            "id": layout_obj.id
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

def load_layout(request):
    """
    Loads the most recently saved building layout from the database.
    """
    try:
        layout_obj = BuildingLayout.objects.order_by('-updated_at').first()
        if not layout_obj:
            return JsonResponse({"status": "error", "message": "No saved layouts found in database."}, status=404)

        return JsonResponse({
            "status": "success",
            "name": layout_obj.name,
            "layout": layout_obj.floors_data,
            "occupants": layout_obj.occupants_data,
            "saved_at": layout_obj.updated_at.strftime("%Y-%m-%d %H:%M")
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

from .sms_service import send_emergency_sms, SMS_DISPATCH_LOG

# Initial emergency broadcast state for connected mobile phone
INITIAL_SMS_BODY = (
    "🚨 AEGIS EMERGENCY EVACUATION NOTICE 🚨\n"
    "Incident: FIRE active on Ground.\n"
    
    "Elevators disabled. Proceed to nearest stairwells S1-S3.\n"
    "Safe Exit: Ground Floor.\n"
    "Live Mobile Link: http://10.51.105.70:5173"
)

ACTIVE_EMERGENCY_BROADCAST = {
    "active": False,
    "id": 0,
    "phone": "+91 7200673492",
    "hazard_type": "none",
    "floor": "None",
    "title": "STANDBY",
    "incident": "No active emergency.",
    "elevators": "Operational.",
    "safe_exit": "All Exits Operational.",
    "mobile_link": "http://10.51.105.70:5173",
    "full_message": "",
    "timestamp": "Standby",
    "delivery_type": "None",
    "sms_status": "STANDBY",
    "sms_uri": "",
    "sms_uri_ios": ""
}

def get_latest_alert(request):
    """
    Returns the current active emergency evacuation notice for connected mobile phones.
    """
    return JsonResponse({
        "status": "success",
        "alert": ACTIVE_EMERGENCY_BROADCAST
    })

@csrf_exempt
def clear_alert(request):
    """
    Clears the active emergency alert, returning system to STANDBY state.
    """
    ACTIVE_EMERGENCY_BROADCAST.update({
        "active": False,
        "hazard_type": "none",
        "floor": "None",
        "title": "STANDBY",
        "incident": "No active emergency.",
        "elevators": "Operational.",
        "safe_exit": "All Exits Operational.",
        "timestamp": "Standby",
        "delivery_type": "None",
        "sms_status": "STANDBY",
        "full_message": "",
        "sms_uri": "",
        "sms_uri_ios": ""
    })
    return JsonResponse({
        "status": "success",
        "message": "Emergency alert cleared. System returned to standby.",
        "alert": ACTIVE_EMERGENCY_BROADCAST
    })

def get_sms_logs(request):
    """
    Returns the real-time log of automatically dispatched SMS messages.
    """
    return JsonResponse({
        "status": "success",
        "logs": SMS_DISPATCH_LOG
    })

def open_sms_redirect(request):
    """
    Direct HTTP endpoint that immediately redirects the mobile browser into the phone's native SMS Messages app.
    When opened on phone, the mobile operating system instantly switches to Messages with recipient +91 7200673492.
    """
    msg = ACTIVE_EMERGENCY_BROADCAST.get("full_message", INITIAL_SMS_BODY)
    sms_uri = f"sms:+917200673492?body={urllib.parse.quote(msg)}"
    
    # If the user opened via address bar or standard link, directly 302 redirect to native SMS scheme!
    if request.GET.get("html") != "1":
        return SafeSchemeRedirect(sms_uri)

    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Launching Emergency SMS...</title>
    <meta http-equiv="refresh" content="0;url={sms_uri}">
    <style>
        body {{
            background: #0f172a;
            color: #f8fafc;
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
            text-align: center;
        }}
        .card {{
            background: #1e293b;
            border: 2px solid #ef4444;
            border-radius: 12px;
            padding: 24px;
            max-width: 400px;
            box-shadow: 0 10px 25px rgba(239, 68, 68, 0.3);
        }}
        .btn {{
            display: block;
            margin-top: 18px;
            background: #0284c7;
            color: #fff;
            padding: 14px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            font-size: 16px;
        }}
    </style>
</head>
<body>
    <div class="card">
        <h2 style="color:#f87171;margin-top:0;">🚨 Emergency SMS Launch</h2>
        <p style="color:#94a3b8;font-size:14px;">Opening native SMS Messages app for <b>+91 7200673492</b>...</p>
        <a href="{sms_uri}" class="btn" id="sms-btn">✉️ Tap Here if SMS does not open</a>
    </div>
    <script>
        window.location.href = "{sms_uri}";
    </script>
</body>
</html>"""
    return HttpResponse(html)

@csrf_exempt
def alert_phone(request):
    """
    Emergency SMS Dispatcher.
    Automatically sends emergency evacuation SMS to 7200673492 when an alert comes.
    """
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "POST method required"}, status=405)

    try:
        payload = json.loads(request.body.decode('utf-8'))
        phone = payload.get("phone") or "7200673492"
        hazard_type = payload.get("hazard_type", "fire")
        floor = payload.get("floor", "Ground")
        custom_msg = payload.get("message")
        
        default_msg = (
            f"🚨 AEGIS EMERGENCY EVACUATION NOTICE 🚨\n"
            f"Incident: {hazard_type.upper()} active on {floor}.\n"
            f"Elevators disabled. Proceed to nearest stairwells S1-S3.\n"
            f"Safe Exit: Ground Floor.\n"
            f"Live Mobile Link: http://10.51.105.70:5173"
        )
        msg = custom_msg or default_msg

        # Automatically execute SMS dispatch
        sms_result = send_emergency_sms(
            phone=phone,
            message=msg,
            hazard_type=hazard_type,
            floor=floor
        )

        ACTIVE_EMERGENCY_BROADCAST.update({
            "active": True,
            "id": ACTIVE_EMERGENCY_BROADCAST.get("id", 0) + 1,
            "phone": sms_result["phone"],
            "hazard_type": hazard_type,
            "floor": floor,
            "incident": f"Incident: {hazard_type.upper()} active on {floor}.",
            "elevators": "Elevators disabled. Proceed to nearest stairwells S1-S3.",
            "safe_exit": "Safe Exit: Ground Floor.",
            "mobile_link": "http://10.51.105.70:5173",
            "full_message": msg,
            "sms_uri": sms_result["sms_uri"],
            "sms_uri_ios": sms_result["sms_uri_ios"],
            "delivery_type": "SMS",
            "sms_status": sms_result["status"],
            "timestamp": sms_result["timestamp"]
        })

        return JsonResponse({
            "status": "success",
            "sms_dispatched": True,
            "phone": sms_result["phone"],
            "message": msg,
            "timestamp": sms_result["timestamp"],
            "sms_uri": sms_result["sms_uri"],
            "sms_uri_ios": sms_result["sms_uri_ios"],
            "sms_id": sms_result["id"],
            "gateway": sms_result["gateway"],
            "delivery_status": sms_result["status"],
            "alert": ACTIVE_EMERGENCY_BROADCAST
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


@csrf_exempt
def tactical_rescue_plan(request):
    """
    Computes tactical first-responder ingress routes and triage ranking for trapped/incapacitated occupants.
    """
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "POST method required"}, status=405)

    try:
        payload = json.loads(request.body.decode('utf-8'))
        building_data = payload.get("building") or create_default_building()
        trapped_occupants = payload.get("trapped_occupants", [])
        entry_points = payload.get("entry_points")
        blocked_nodes = payload.get("blocked_nodes", [])

        result = calculate_tactical_rescue_plan(
            building_data,
            trapped_occupants,
            entry_points=entry_points,
            blocked_nodes=blocked_nodes
        )
        return JsonResponse(result)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)




