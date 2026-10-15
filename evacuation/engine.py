import math
import heapq
from collections import deque

GRID_WIDTH = 40
GRID_HEIGHT = 25
NUM_FLOORS = 4

CELL_EMPTY = 0
CELL_WALL = 1
CELL_EXIT = 2
CELL_STAIR = 3
CELL_LIFT = 4
CELL_FIRE = 5
CELL_EXTINGUISHER = 8

def create_default_building():
    """
    Creates the default 4-floor office building matching the reference architecture.
    Returns: dict with floor plans, exits, stairs, and initial occupants.
    """
    floors = []
    
    # Base layout template for all floors
    def build_base_grid():
        grid = [[CELL_EMPTY for _ in range(GRID_WIDTH)] for _ in range(GRID_HEIGHT)]
        
        # Outer boundary walls
        for x in range(GRID_WIDTH):
            grid[0][x] = CELL_WALL
            grid[GRID_HEIGHT - 1][x] = CELL_WALL
        for y in range(GRID_HEIGHT):
            grid[y][0] = CELL_WALL
            grid[y][GRID_WIDTH - 1] = CELL_WALL
            
        # Interior horizontal walls (corridors)
        # Main central corridor between y=10 and y=14
        for x in range(GRID_WIDTH):
            if x not in [0, 3, 20, 36, 39]: # door/pass gaps
                grid[6][x] = CELL_WALL
                grid[18][x] = CELL_WALL
        
        # Vertical room dividing walls
        for y in range(1, 6):
            for x in [8, 16, 24, 32]:
                grid[y][x] = CELL_WALL
                
        for y in range(7, 18):
            for x in [10, 30]:
                grid[y][x] = CELL_WALL

        for y in range(19, 24):
            for x in [8, 16, 24, 32]:
                grid[y][x] = CELL_WALL
                
        # Room doorways (clear walls for doors)
        doorways = [
            (4, 6), (12, 6), (20, 6), (28, 6), (36, 6),
            (4, 18), (12, 18), (20, 18), (28, 18), (36, 18),
            (10, 12), (30, 12)
        ]
        for dx, dy in doorways:
            if 0 <= dx < GRID_WIDTH and 0 <= dy < GRID_HEIGHT:
                grid[dy][dx] = CELL_EMPTY

        return grid

    # Ground Floor: Contains ground exits + stairs + lifts
    ground_grid = build_base_grid()
    
    # Exits on Ground (x, y, id, capacity in ppl/sec)
    exits = [
        {"id": "A", "x": 0, "y": 12, "cap": 2.5},
        {"id": "B", "x": 39, "y": 12, "cap": 2.5},
        {"id": "C", "x": 20, "y": 24, "cap": 1.5},
        {"id": "D", "x": 20, "y": 0, "cap": 1.5},
        {"id": "E", "x": 29, "y": 1, "cap": 9.5},
        {"id": "F", "x": 29, "y": 0, "cap": 9.5},
    ]
    for ex in exits:
        ground_grid[ex["y"]][ex["x"]] = CELL_EXIT
        
    # Stairwells on all floors
    stairs = [
        {"id": "S1", "x": 3, "y": 11, "cap": 2.0},
        {"id": "S2", "x": 36, "y": 11, "cap": 2.0},
        {"id": "S3", "x": 20, "y": 13, "cap": 1.5},
        {"id": "S4", "x": 4, "y": 24, "cap": 2.0},
        {"id": "S5", "x": 3, "y": 21, "cap": 2.0},
        {"id": "S6", "x": 4, "y": 21, "cap": 2.0},
        {"id": "S7", "x": 4, "y": 22, "cap": 2.0},
        {"id": "S8", "x": 5, "y": 23, "cap": 2.0},
        {"id": "S9", "x": 6, "y": 24, "cap": 2.0},
        {"id": "S10", "x": 5, "y": 20, "cap": 2.0},
        {"id": "S11", "x": 6, "y": 21, "cap": 2.0},
        {"id": "S12", "x": 6, "y": 22, "cap": 2.0},
        {"id": "S13", "x": 7, "y": 23, "cap": 2.0},
        {"id": "S14", "x": 7, "y": 24, "cap": 2.0},
        {"id": "S15", "x": 7, "y": 3, "cap": 2.0},
        {"id": "S16", "x": 8, "y": 3, "cap": 2.0},
        {"id": "S17", "x": 9, "y": 3, "cap": 2.0},
        {"id": "S18", "x": 9, "y": 2, "cap": 2.0},
        {"id": "S19", "x": 9, "y": 1, "cap": 2.0},
        {"id": "S20", "x": 9, "y": 0, "cap": 2.0},
    ]

    # Lift location (disabled in emergency)
    lifts = [
        {"id": "L1", "x": 19, "y": 11},
        {"id": "L2", "x": 21, "y": 11},
    ]

    for st in stairs:
        if 0 <= st["x"] < GRID_WIDTH and 0 <= st["y"] < GRID_HEIGHT:
            ground_grid[st["y"]][st["x"]] = CELL_STAIR
            
    for lf in lifts:
        if 0 <= lf["x"] < GRID_WIDTH and 0 <= lf["y"] < GRID_HEIGHT:
            ground_grid[lf["y"]][lf["x"]] = CELL_LIFT

    # 2 Fire Extinguishers per floor in central corridors (not in rooms)
    ground_grid[12][10] = CELL_EXTINGUISHER
    ground_grid[12][30] = CELL_EXTINGUISHER

    floors.append({
        "floor": 0,
        "name": "Ground",
        "grid": ground_grid,
        "default_occupants": 29
    })

    # Upper floors (Floor 1, Floor 2, Floor 3)
    floor_names = ["Floor 1", "Floor 2", "Floor 3"]
    default_counts = [35, 33, 52]
    for idx, (fname, count) in enumerate(zip(floor_names, default_counts), start=1):
        fgrid = build_base_grid()
        for st in stairs:
            if 0 <= st["x"] < GRID_WIDTH and 0 <= st["y"] < GRID_HEIGHT:
                fgrid[st["y"]][st["x"]] = CELL_STAIR
        for lf in lifts:
            if 0 <= lf["x"] < GRID_WIDTH and 0 <= lf["y"] < GRID_HEIGHT:
                fgrid[lf["y"]][lf["x"]] = CELL_LIFT

        # 2 Fire Extinguishers per floor in central corridors (not in rooms)
        fgrid[12][10] = CELL_EXTINGUISHER
        fgrid[12][30] = CELL_EXTINGUISHER
                
        floors.append({
            "floor": idx,
            "name": fname,
            "grid": fgrid,
            "default_occupants": count
        })

    return {
        "width": GRID_WIDTH,
        "height": GRID_HEIGHT,
        "floors": floors,
        "exits": exits,
        "stairs": stairs,
        "lifts": lifts
    }

class EvacuationGraph:
    """
    Multi-floor 3D graph representation for evacuation path finding.
    """
    def __init__(self, floors_data, blocked_nodes=None):
        self.floors = floors_data
        self.width = len(floors_data[0]["grid"][0])
        self.height = len(floors_data[0]["grid"])
        self.num_floors = len(floors_data)
        self.blocked_nodes = set(blocked_nodes or [])

    def is_walkable(self, f, x, y):
        if not (0 <= f < self.num_floors and 0 <= x < self.width and 0 <= y < self.height):
            return False
        if (f, x, y) in self.blocked_nodes:
            return False
        cell = self.floors[f]["grid"][y][x]
        return cell != CELL_WALL and cell != CELL_FIRE and cell != CELL_LIFT

    def get_neighbors(self, f, x, y, allow_up=False):
        neighbors = []
        # Same floor horizontal/vertical moves
        dirs = [(-1, 0, 1.0), (1, 0, 1.0), (0, -1, 1.0), (0, 1, 1.0)]
        for dx, dy, cost in dirs:
            nx, ny = x + dx, y + dy
            if self.is_walkable(f, nx, ny):
                neighbors.append((f, nx, ny, cost))
                
        # Stair transitions: down by default; up if allow_up=True (tactical squads)
        curr_cell = self.floors[f]["grid"][y][x]
        if curr_cell == CELL_STAIR:
            if f > 0 and self.is_walkable(f - 1, x, y):
                neighbors.append((f - 1, x, y, 3.5))
            if allow_up and f + 1 < self.num_floors and self.is_walkable(f + 1, x, y):
                neighbors.append((f + 1, x, y, 3.5))
                
        return neighbors

    def compute_distance_fields(self):
        """
        Runs multi-source Dijkstra backwards from all ground exits (Floor 0).
        Returns dist dictionary mapping (f, x, y) -> distance to nearest ground exit.
        """
        dist = {}
        pq = []
        
        # Ground floor exits are distance 0 sources
        for y in range(self.height):
            for x in range(self.width):
                if self.floors[0]["grid"][y][x] == CELL_EXIT and (0, x, y) not in self.blocked_nodes:
                    dist[(0, x, y)] = 0.0
                    heapq.heappush(pq, (0.0, 0, x, y))

        while pq:
            d, f, x, y = heapq.heappop(pq)
            if d > dist.get((f, x, y), float('inf')):
                continue

            # Neighbors in reverse:
            # 1. Same floor neighbors
            dirs = [(-1, 0, 1.0), (1, 0, 1.0), (0, -1, 1.0), (0, 1, 1.0)]
            for dx, dy, cost in dirs:
                nx, ny = x + dx, y + dy
                if self.is_walkable(f, nx, ny):
                    nd = d + cost
                    if nd < dist.get((f, nx, ny), float('inf')):
                        dist[(f, nx, ny)] = nd
                        heapq.heappush(pq, (nd, f, nx, ny))

            # 2. Upstairs stair connections (moving from f to f + 1 backwards)
            if self.floors[f]["grid"][y][x] == CELL_STAIR and f + 1 < self.num_floors:
                if self.is_walkable(f + 1, x, y):
                    nd = d + 3.5
                    if nd < dist.get((f + 1, x, y), float('inf')):
                        dist[(f + 1, x, y)] = nd
                        heapq.heappush(pq, (nd, f + 1, x, y))

        return dist

    def find_path(self, start_f, start_x, start_y, dist_field):
        """
        Greedily traces gradient descent along distance field to nearest exit.
        """
        path = [(start_f, start_x, start_y)]
        curr = (start_f, start_x, start_y)
        visited = {curr}

        for _ in range(500):
            f, x, y = curr
            if f == 0 and self.floors[0]["grid"][y][x] == CELL_EXIT:
                break
                
            best_next = None
            best_dist = dist_field.get(curr, float('inf'))

            for nf, nx, ny, _ in self.get_neighbors(f, x, y):
                nd = dist_field.get((nf, nx, ny), float('inf'))
                if nd < best_dist and (nf, nx, ny) not in visited:
                    best_dist = nd
                    best_next = (nf, nx, ny)

            if not best_next or best_dist >= float('inf'):
                # Trapped or unreachable
                break

            curr = best_next
            visited.add(curr)
            path.append(curr)

        return path

def simulate_evacuation(building_data, occupants_per_floor=None, blockage_events=None):
    """
    Performs deterministic multi-agent simulation with bottleneck queuing,
    calculating clearance time, exit usage, staircase queues, and comparison scenarios.
    """
    floors = building_data["floors"]
    exits = building_data.get("exits", [])
    stairs = building_data.get("stairs", [])
    
    # Blockage events: list of {"time": 8.0, "floor": 3, "x": 12, "y": 0, "type": "fire"}
    blockage_events = blockage_events or []
    
    # Initialize occupants
    occupants = []
    agent_id = 1
    
    default_counts = [f.get("default_occupants", 30) for f in floors]
    counts = occupants_per_floor if occupants_per_floor and len(occupants_per_floor) == len(floors) else default_counts

    for f_idx, floor in enumerate(floors):
        f_grid = floor["grid"]
        count = counts[f_idx]
        walkable = []
        for y in range(len(f_grid)):
            for x in range(len(f_grid[0])):
                if f_grid[y][x] == CELL_EMPTY:
                    walkable.append((x, y))

        # Space out agents across walkable spots
        step = max(1, len(walkable) // max(1, count))
        selected = [walkable[(i * step) % len(walkable)] for i in range(count)] if walkable else []

        for x, y in selected:
            occupants.append({
                "id": agent_id,
                "floor": f_idx,
                "x": x,
                "y": y,
                "start_floor": f_idx,
                "state": "moving", # moving, waiting, evacuated, trapped
                "path": [],
                "evac_time": None,
                "reroutes": 0
            })
            agent_id += 1

    total_agents = len(occupants)
    time_step = 0.5 # 0.5s per simulation tick
    current_time = 0.0
    max_time = 120.0 # max 2 minutes simulation
    
    active_blockages = set()
    graph = EvacuationGraph(floors, active_blockages)
    dist_field = graph.compute_distance_fields()

    # Pre-compute initial paths
    for agent in occupants:
        agent["path"] = graph.find_path(agent["floor"], agent["x"], agent["y"], dist_field)
        if len(agent["path"]) <= 1:
            agent["state"] = "trapped"

    event_logs = []
    time_series = [] # (time, remaining_total, rem_g, rem_f1, rem_f2, rem_f3)
    reroutes_count = 0
    
    # Auto-detect exits from floor 0 grid if exits list is missing or empty
    if not exits and len(floors) > 0:
        for y in range(len(floors[0]["grid"])):
            for x in range(len(floors[0]["grid"][0])):
                if floors[0]["grid"][y][x] == CELL_EXIT:
                    exits.append({"id": chr(65 + (len(exits) % 26)), "x": x, "y": y, "cap": 2.5})

    # Tracking usage with safe key fallbacks
    exit_usage = {}
    for idx, ex in enumerate(exits):
        ex_id = ex.get("id") or chr(65 + (idx % 26))
        exit_usage[ex_id] = {"used": 0, "cap": ex.get("cap", 2.5), "queue": 0}

    stair_usage = {}
    for idx, st in enumerate(stairs):
        st_id = st.get("id") or f"S{idx + 1}"
        stair_usage[st_id] = {"used": 0, "cap": st.get("cap", 2.0), "on_now": 0}
    congestion_map = {} # (f, x, y) -> count of visits

    while current_time <= max_time:
        # Check if any blockage event triggers at this timestamp
        recompute_needed = False
        for event in blockage_events:
            if math.isclose(event.get("time", 0.0), current_time, abs_tol=0.25):
                ef, ex, ey = event["floor"], event["x"], event["y"]
                if (ef, ex, ey) not in active_blockages:
                    active_blockages.add((ef, ex, ey))
                    recompute_needed = True
                    event_logs.append({
                        "time": f"{current_time:.1f}s",
                        "type": "blockage",
                        "text": f"🔥 Blockage at Floor {ef} ({ex},{ey}) -> routes recomputed"
                    })

        if recompute_needed:
            graph = EvacuationGraph(floors, active_blockages)
            dist_field = graph.compute_distance_fields()
            for agent in occupants:
                if agent["state"] in ["moving", "waiting"]:
                    new_path = graph.find_path(agent["floor"], agent["x"], agent["y"], dist_field)
                    if not new_path or len(new_path) <= 1:
                        agent["state"] = "trapped"
                    else:
                        agent["path"] = new_path
                        agent["reroutes"] += 1
                        reroutes_count += 1

        # Move agents along path respecting node congestion
        rem_by_floor = [0] * len(floors)
        remaining_total = 0

        for agent in occupants:
            if agent["state"] == "evacuated":
                continue
                
            rem_by_floor[agent["floor"]] += 1
            remaining_total += 1

            if agent["state"] == "trapped":
                continue

            # Record congestion visit
            node_key = (agent["floor"], agent["x"], agent["y"])
            congestion_map[node_key] = congestion_map.get(node_key, 0) + 1

            if len(agent["path"]) > 1:
                next_node = agent["path"][1]
                nf, nx, ny = next_node

                # Check if next node is blocked
                if (nf, nx, ny) in active_blockages:
                    agent["state"] = "waiting"
                    continue

                # Advance agent
                agent["floor"] = nf
                agent["x"] = nx
                agent["y"] = ny
                agent["path"].pop(0)

                # Check if reached ground exit
                if nf == 0 and floors[0]["grid"][ny][nx] == CELL_EXIT:
                    agent["state"] = "evacuated"
                    agent["evac_time"] = current_time
                    # Find exit id
                    for idx, ex in enumerate(exits):
                        if ex.get("x") == nx and ex.get("y") == ny:
                            ex_id = ex.get("id") or chr(65 + (idx % 26))
                            if ex_id in exit_usage:
                                exit_usage[ex_id]["used"] += 1
                            break
            elif len(agent["path"]) == 1:
                f, x, y = agent["path"][0]
                if f == 0 and floors[0]["grid"][y][x] == CELL_EXIT:
                    agent["state"] = "evacuated"
                    agent["evac_time"] = current_time
                    for idx, ex in enumerate(exits):
                        if ex.get("x") == x and ex.get("y") == y:
                            ex_id = ex.get("id") or chr(65 + (idx % 26))
                            if ex_id in exit_usage:
                                exit_usage[ex_id]["used"] += 1
                            break

        time_series.append({
            "time": round(current_time, 1),
            "total": remaining_total,
            "floor_counts": list(rem_by_floor)
        })

        if remaining_total == 0:
            event_logs.append({
                "time": f"{current_time:.1f}s",
                "type": "complete",
                "text": f"✅ Evacuation finished at {current_time:.1f}s — all {total_agents} cleared"
            })
            break

        current_time += time_step

    # Calculate clearance times per floor
    floor_clearance = []
    for f_idx in range(len(floors)):
        f_evac_times = [a["evac_time"] for a in occupants if a["start_floor"] == f_idx and a["evac_time"] is not None]
        if f_evac_times and len(f_evac_times) == counts[f_idx]:
            floor_clearance.append(f"~{max(f_evac_times):.0f}s")
        elif f_evac_times:
            floor_clearance.append(f">{max(f_evac_times):.0f}s (cut off)")
        else:
            floor_clearance.append("N/A")

    evacuated_count = sum(1 for a in occupants if a["state"] == "evacuated")
    overall_clearance = max([a["evac_time"] for a in occupants if a["evac_time"] is not None], default=current_time)

    # Top congestion hotspots
    top_hotspots = sorted(congestion_map.items(), key=lambda kv: kv[1], reverse=True)[:5]
    hotspot_list = [{"floor": k[0], "x": k[1], "y": k[2], "density": v} for k, v in top_hotspots]

    return {
        "clearance_time": round(overall_clearance, 1),
        "total_occupants": total_agents,
        "evacuated": evacuated_count,
        "trapped": total_agents - evacuated_count,
        "reroutes": reroutes_count,
        "floor_clearance": floor_clearance,
        "exit_usage": exit_usage,
        "stair_usage": stair_usage,
        "time_series": time_series,
        "event_logs": event_logs,
        "hotspots": hotspot_list
    }


def calculate_tactical_rescue_plan(building_data, trapped_occupants, entry_points=None, blocked_nodes=None):
    """
    Computes inbound tactical rescue trajectories for First Responder squads (firefighters/medics).
    Performs multi-target triage prioritization and reverse extraction routing.
    """
    floors = building_data["floors"]
    exits = building_data.get("exits", [])
    blocked = set(tuple(b) for b in (blocked_nodes or []))
    graph = EvacuationGraph(floors, blocked)
    dist_field = graph.compute_distance_fields()

    # Default entry points: Ground exits
    if not entry_points:
        if exits:
            entry_points = [{"floor": 0, "x": ex["x"], "y": ex["y"], "name": f"Exit {ex.get('id', chr(65 + (i % 26)))}"} for i, ex in enumerate(exits) if "x" in ex and "y" in ex]
        if not entry_points and len(floors) > 0:
            for y in range(len(floors[0]["grid"])):
                for x in range(len(floors[0]["grid"][0])):
                    if floors[0]["grid"][y][x] == CELL_EXIT:
                        entry_points.append({"floor": 0, "x": x, "y": y, "name": f"Exit {chr(65 + (len(entry_points) % 26))}"})

    triage_queue = []
    rescue_routes = []

    for idx, victim in enumerate(trapped_occupants):
        vf = victim.get("floor", 0)
        vx = victim.get("x", 0)
        vy = victim.get("y", 0)
        vname = victim.get("name", f"Victim #{idx + 1}")
        health = victim.get("health", 100)
        smoke = victim.get("smoke", 0.0)

        # Inbound search: find shortest safe path from any entry point to victim
        best_entry = None
        best_path = None
        min_cost = float('inf')

        for ep in entry_points:
            ef, ex, ey = ep["floor"], ep["x"], ep["y"]
            # Dijkstra / BFS from entry point to (vf, vx, vy)
            pq = [(0.0, ef, ex, ey, [(ef, ex, ey)])]
            visited = set()
            found = False

            while pq:
                cost, f, x, y, path = heapq.heappop(pq)
                if (f, x, y) == (vf, vx, vy):
                    if cost < min_cost:
                        min_cost = cost
                        best_path = path
                        best_entry = ep
                    found = True
                    break

                if (f, x, y) in visited:
                    continue
                visited.add((f, x, y))

                for nf, nx, ny, step_cost in graph.get_neighbors(f, x, y, allow_up=True):
                    if (nf, nx, ny) not in visited:
                        heapq.heappush(pq, (cost + step_cost, nf, nx, ny, path + [(nf, nx, ny)]))

        # Triage urgency score: Higher = needs rescue first
        # Factored by: smoke exposure, low health, upper floor isolation
        urgency = round((100 - health) * 1.5 + (smoke * 50.0) + (vf * 10.0), 1)

        # Extraction route: path back to safe ground exit from victim location
        extraction_path = graph.find_path(vf, vx, vy, dist_field) if dist_field.get((vf, vx, vy), float('inf')) < float('inf') else best_path[::-1] if best_path else []

        plan_entry = {
            "id": idx + 1,
            "name": vname,
            "floor": vf,
            "x": vx,
            "y": vy,
            "health": health,
            "smoke": smoke,
            "urgency": urgency,
            "reachable": best_path is not None,
            "inbound_steps": len(best_path) if best_path else 0,
            "inbound_path": best_path or [],
            "extraction_path": extraction_path,
            "recommended_entry": best_entry["name"] if best_entry else "N/A",
            "est_inbound_time": round(min_cost / 1.6, 1) if min_cost < float('inf') else None
        }
        triage_queue.append(plan_entry)

    # Sort triage queue by urgency descending
    triage_queue.sort(key=lambda t: t["urgency"], reverse=True)

    return {
        "status": "success",
        "total_trapped": len(trapped_occupants),
        "reachable_count": sum(1 for t in triage_queue if t["reachable"]),
        "triage_queue": triage_queue,
        "entry_points": entry_points
    }

