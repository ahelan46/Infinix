import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Compass,
  ShieldAlert,
  Flame,
  CheckCircle2,
  Navigation,
  ArrowLeft,
  RefreshCw,
  ExternalLink,
  MapPin,
  Layers,
  ChevronRight,
  Award
} from 'lucide-react';
import SafetyQuizModal from './SafetyQuizModal';
import './StandaloneFloorMap.css';

const W = 40, H = 25, FS = W * H, F = 4, CS = 20;
const FN = ['Ground Floor', 'Floor 1', 'Floor 2', 'Floor 3'];

export default function StandaloneFloorMap({ onBack }) {
  const canvasRef = useRef(null);
  const [activeFloor, setActiveFloor] = useState(0);
  const [pin, setPin] = useState(null); // { x, y, floor }
  const [calculatedRoute, setCalculatedRoute] = useState(null); // { path, distMeters, estSec, targetExit }
  const [emergencyAlert, setEmergencyAlert] = useState({ active: false, hazard: 'none', floor: 'None' });
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(Date.now());
  const [gridData, setGridData] = useState(() => {
    // Attempt to load from localStorage first for instant rendering
    try {
      const saved = localStorage.getItem('evac_layout_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.layout?.g && parsed.layout.g.length === 4000) {
          return {
            g: new Uint8Array(parsed.layout.g),
            ex: parsed.layout.ex || [],
            st: parsed.layout.st || [],
            nf: parsed.layout.nf || 4
          };
        }
      }
    } catch (e) {}
    return null;
  });

  // Check URL query parameters for floor initialisation (e.g. ?floor=1)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const f = parseInt(params.get('floor'), 10);
      if (!isNaN(f) && f >= 0 && f < 4) {
        setActiveFloor(f);
      }
    }
  }, []);

  // Sync latest building layout and active emergency alert from Django backend & localStorage
  const syncBlueprintAndAlerts = useCallback(async () => {
    try {
      // 1. Sync Alert state
      const alertResp = await fetch('/api/evacuation/latest-alert/');
      if (alertResp.ok) {
        const alertRes = await alertResp.json();
        if (alertRes.status === 'success' && alertRes.alert) {
          const isAct = alertRes.alert.active || alertRes.alert.hazard_type === 'fire' || alertRes.alert.hazard_type === 'flood';
          setEmergencyAlert({
            active: isAct,
            hazard: alertRes.alert.hazard_type || 'none',
            floor: alertRes.alert.floor || 'None',
            message: alertRes.alert.incident || ''
          });
        }
      }

      // 2. Sync Blueprint Layout
      const loadResp = await fetch('/api/evacuation/load/');
      if (loadResp.ok) {
        const loadRes = await loadResp.json();
        if (loadRes.status === 'success' && loadRes.layout?.g && loadRes.layout.g.length === 4000) {
          setGridData({
            g: new Uint8Array(loadRes.layout.g),
            ex: loadRes.layout.ex || [],
            st: loadRes.layout.st || [],
            nf: loadRes.layout.nf || 4
          });
          setLastSyncTime(Date.now());
          return;
        }
      }

      // Fallback to local storage if API is quiet
      const localStr = localStorage.getItem('evac_layout_v2');
      if (localStr) {
        const parsed = JSON.parse(localStr);
        if (parsed?.layout?.g && parsed.layout.g.length === 4000) {
          setGridData({
            g: new Uint8Array(parsed.layout.g),
            ex: parsed.layout.ex || [],
            st: parsed.layout.st || [],
            nf: parsed.layout.nf || 4
          });
          setLastSyncTime(Date.now());
        }
      }
    } catch (e) {
      // Local network fallback
      try {
        const localStr = localStorage.getItem('evac_layout_v2');
        if (localStr) {
          const parsed = JSON.parse(localStr);
          if (parsed?.layout?.g && parsed.layout.g.length === 4000) {
            setGridData({
              g: new Uint8Array(parsed.layout.g),
              ex: parsed.layout.ex || [],
              st: parsed.layout.st || [],
              nf: parsed.layout.nf || 4
            });
          }
        }
      } catch (err) {}
    }
  }, []);

  useEffect(() => {
    syncBlueprintAndAlerts();
    const interval = setInterval(syncBlueprintAndAlerts, 2500);
    return () => clearInterval(interval);
  }, [syncBlueprintAndAlerts]);

  // Compute BFS escape route from current user pin to safest open exit
  const computePinRoute = useCallback((startX, startY, floor, currentGrid, exits, stairs) => {
    if (!currentGrid) return null;
    const g = currentGrid;
    const offset = floor * FS;
    const startNode = offset + startY * W + startX;

    // Helper: is cell walkable (avoids walls, lifts, fire, and immediate fire proximity)
    const isWalkable = (c) => {
      const v = g[c];
      if (v === 1 || v === 3 || v === 5 || v === 6 || v === 7) return false;
      return true;
    };

    const isNearFire = (c) => {
      const r = c % FS, cx = r % W, cy = Math.floor(r / W), cf = Math.floor(c / FS);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H) {
            if (g[cf * FS + ny * W + nx] === 3) return true;
          }
        }
      }
      return false;
    };

    // Find destination target nodes
    let targetNodes = [];
    if (floor === 0) {
      // Ground level targets: Ground Exits
      targetNodes = exits.filter(e => !e.refuge && g[e.y * W + e.x] !== 3).map(e => e.y * W + e.x);
    } else {
      // Upper floors targets: unblocked Stairwells
      targetNodes = stairs.filter(s => g[offset + s.y * W + s.x] !== 3).map(s => offset + s.y * W + s.x);
    }

    if (!targetNodes.length) return null;

    // Run BFS on current floor
    const queue = [startNode];
    const visited = new Set([startNode]);
    const parent = new Map();
    let foundTarget = -1;

    while (queue.length > 0) {
      const curr = queue.shift();
      if (targetNodes.includes(curr)) {
        foundTarget = curr;
        break;
      }

      const cr = curr % FS, cx = cr % W, cy = Math.floor(cr / W);
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
          const neighbor = offset + ny * W + nx;
          if (!visited.has(neighbor) && isWalkable(neighbor)) {
            // Strong avoidance of cells near fire unless starting inside
            if (isNearFire(neighbor) && !isNearFire(startNode)) continue;
            visited.add(neighbor);
            parent.set(neighbor, curr);
            queue.push(neighbor);
          }
        }
      }
    }

    if (foundTarget === -1) return null;

    // Reconstruct path
    const path = [];
    let curr = foundTarget;
    while (curr !== undefined) {
      path.unshift(curr);
      curr = parent.get(curr);
    }

    const distMeters = (path.length * 1.5).toFixed(1);
    const estSec = (distMeters / 1.3).toFixed(0);
    let targetLabel = 'Ground Exit';

    if (floor === 0) {
      const matchedExit = exits.find(e => e.y * W + e.x === foundTarget);
      const idx = exits.indexOf(matchedExit);
      targetLabel = matchedExit ? `Exit ${String.fromCharCode(65 + Math.max(0, idx))}` : 'Exit';
    } else {
      const r = foundTarget % FS;
      const sx = r % W, sy = Math.floor(r / W);
      const matchedStair = stairs.findIndex(s => s.x === sx && s.y === sy);
      targetLabel = matchedStair >= 0 ? `Stairwell S${matchedStair + 1}` : 'Stairwell';
    }

    return {
      path,
      distMeters,
      estSec,
      targetLabel
    };
  }, []);

  // Handle map touch / click to place "YOU ARE HERE" pin
  const handleCanvasClick = (e) => {
    const cv = canvasRef.current;
    if (!cv || !gridData) return;
    const rect = cv.getBoundingClientRect();
    const scaleX = cv.width / rect.width;
    const scaleY = cv.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const cellX = Math.floor(clickX / CS);
    const cellY = Math.floor(clickY / CS);

    if (cellX < 0 || cellX >= W || cellY < 0 || cellY >= H) return;

    const cellVal = gridData.g[activeFloor * FS + cellY * W + cellX];
    if (cellVal === 1) return; // Ignore clicks on solid concrete walls

    const newPin = { x: cellX, y: cellY, floor: activeFloor };
    setPin(newPin);

    // Compute route to nearest exit immediately
    const routeResult = computePinRoute(cellX, cellY, activeFloor, gridData.g, gridData.ex, gridData.st);
    setCalculatedRoute(routeResult);
  };

  // Main Canvas Rendering Loop
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !gridData) return;
    const ctx = cv.getContext('2d');
    const o = activeFloor * FS;
    const g = gridData.g;

    let animId;

    const render = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);

      // 1. Dark architectural blueprint background
      ctx.fillStyle = '#060d1a';
      ctx.fillRect(0, 0, cv.width, cv.height);

      // 2. Blueprint precision grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= cv.width; x += CS) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, cv.height);
        ctx.stroke();
      }
      for (let y = 0; y <= cv.height; y += CS) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cv.width, y);
        ctx.stroke();
      }

      // 3. Render Building Architectural Cells
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const v = g[o + y * W + x];
          const px = x * CS, py = y * CS;

          if (v === 1) {
            // Solid Wall
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(px, py, CS, CS);
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 0.5, py + 0.5, CS - 1, CS - 1);

            // Overhead Sprinkler Piping along Wall Tops
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(px, py + 2);
            ctx.lineTo(px + CS, py + 2);
            ctx.stroke();
          } else if (v === 3) {
            // Radiant Red Fire Hazard Cell
            ctx.fillStyle = '#dc2626';
            ctx.fillRect(px, py, CS, CS);
            const pulse = Math.sin(Date.now() / 150 + x * 2 + y * 3) * 0.15;
            ctx.fillStyle = `rgba(239, 68, 68, ${0.85 + pulse})`;
            ctx.fillRect(px + 1, py + 1, CS - 2, CS - 2);
            ctx.strokeStyle = '#f87171';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(px + 1, py + 1, CS - 2, CS - 2);
            ctx.font = 'bold 11px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('🔥', px + 10, py + 14);
          } else if (v === 4) {
            // Stairwell Shaft
            ctx.fillStyle = '#1e3a8a';
            ctx.fillRect(px, py, CS, CS);
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(px + 1, py + 1, CS - 2, CS - 2);
            ctx.fillStyle = '#93c5fd';
            ctx.font = 'bold 8px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('STAIR', px + 10, py + 13);
          } else if (v === 5) {
            // Disabled Elevator Shaft
            ctx.fillStyle = '#111827';
            ctx.fillRect(px, py, CS, CS);
            ctx.strokeStyle = '#dc2626';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px + 3, py + 3);
            ctx.lineTo(px + CS - 3, py + CS - 3);
            ctx.moveTo(px + CS - 3, py + 3);
            ctx.lineTo(px + 3, py + CS - 3);
            ctx.stroke();
          } else if (v === 8) {
            // Fire Extinguisher Station
            ctx.fillStyle = '#2a0e14';
            ctx.fillRect(px, py, CS, CS);
            ctx.strokeStyle = '#dc2626';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(px + 1, py + 1, CS - 2, CS - 2);
            ctx.font = '11px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('🧯', px + 10, py + 14);
          } else {
            // Walkable Room / Corridor floor (Crisp white matching simulator First Image)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(px, py, CS, CS);
            ctx.strokeStyle = 'rgba(100, 116, 139, 0.12)';
            ctx.strokeRect(px + 0.5, py + 0.5, CS, CS);
          }
        }
      }

      // 4. Draw Ground Exits if viewing Ground Floor
      if (activeFloor === 0 && gridData.ex) {
        gridData.ex.forEach((e, i) => {
          if (e.refuge) return;
          const exLetter = String.fromCharCode(65 + i);
          const exX = e.x * CS, exY = (e.y === 0 ? 2 : e.y) * CS;
          const isBlocked = g[e.n] === 3;

          ctx.save();
          ctx.shadowColor = isBlocked ? '#ef4444' : '#10b981';
          ctx.shadowBlur = 10;
          ctx.fillStyle = isBlocked ? '#991b1b' : '#059669';
          ctx.fillRect(exX - 35, exY - 14, 70, 22);
          ctx.strokeStyle = isBlocked ? '#fca5a5' : '#a7f3d0';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(exX - 35, exY - 14, 70, 22);
          ctx.restore();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(isBlocked ? `⛔ EXIT ${exLetter} BLK` : `🏃 EXIT ${exLetter}`, exX, exY + 1);
        });
      }

      // 5. Draw Stairwell Badges on Current Floor
      if (gridData.st) {
        gridData.st.forEach((stair, i) => {
          const sx = stair.x * CS, sy = stair.y * CS;
          const isStairBlocked = g[o + stair.y * W + stair.x] === 3;

          ctx.fillStyle = isStairBlocked ? '#991b1b' : '#1d4ed8';
          ctx.fillRect(sx - 20, sy - 14, 40, 16);
          ctx.strokeStyle = isStairBlocked ? '#ef4444' : '#60a5fa';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(sx - 20, sy - 14, 40, 16);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(isStairBlocked ? `🔥 S${i + 1} BLK` : `🪜 S${i + 1}`, sx, sy - 2);
        });
      }

      // 6. Draw Directional Wayfinding Chevrons along Corridors (Animated)
      const animT = (Date.now() / 250) % 1;
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.45)';
      ctx.lineWidth = 1.5;
      for (let y = 3; y < H - 3; y += 3) {
        for (let x = 3; x < W - 3; x += 3) {
          const idx = o + y * W + x;
          const v = g[idx];
          if (v === 0) {
            let dirX = 0, dirY = 0;
            if (activeFloor === 0) {
              dirX = x < 20 ? -1 : 1;
            } else if (gridData.st?.length) {
              let minD = Infinity, bestSt = gridData.st[0];
              for (const st of gridData.st) {
                const d = Math.hypot(x - st.x, y - st.y);
                if (d < minD) { minD = d; bestSt = st; }
              }
              if (bestSt) {
                dirX = Math.sign(bestSt.x - x);
                dirY = Math.sign(bestSt.y - y);
              }
            }
            if (dirX !== 0 || dirY !== 0) {
              const cx = x * CS + 10, cy = y * CS + 10;
              const ax = cx + dirX * (6 * animT);
              const ay = cy + dirY * (6 * animT);
              ctx.beginPath();
              ctx.moveTo(ax - dirX * 3, ay - dirY * 3);
              ctx.lineTo(ax, ay);
              ctx.stroke();
            }
          }
        }
      }

      // 7. Draw Active Emergency Fire Glow Overlay (Vibrant Red)
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const idx = o + y * W + x;
          if (g[idx] === 3) {
            ctx.save();
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 12;
            ctx.fillStyle = '#dc2626';
            ctx.fillRect(x * CS, y * CS, CS, CS);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(x * CS + 2, y * CS + 2, CS - 4, CS - 4);
            ctx.strokeStyle = '#fca5a5';
            ctx.lineWidth = 1.8;
            ctx.strokeRect(x * CS + 1, y * CS + 1, CS - 2, CS - 2);
            ctx.restore();

            ctx.font = 'bold 11px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('🔥', x * CS + 10, y * CS + 14);
          }
        }
      }

      // 8. Draw "YOU ARE HERE" Pin and Shortest Safe Escape Trail
      if (pin && pin.floor === activeFloor) {
        const pinX = pin.x * CS + 10;
        const pinY = pin.y * CS + 10;

        // Pulsing radar ripple
        const pulseR = 8 + (Math.sin(Date.now() / 150) + 1) * 6;
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pinX, pinY, pulseR, 0, Math.PI * 2);
        ctx.stroke();

        // Pin Point
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(pinX, pinY, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Pin Label
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(pinX - 45, pinY - 26, 90, 18);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(pinX - 45, pinY - 26, 90, 18);
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('📍 YOU ARE HERE', pinX, pinY - 13);

        // Draw glowing green escape trail
        if (calculatedRoute?.path && calculatedRoute.path.length > 1) {
          ctx.save();
          ctx.shadowColor = '#22c55e';
          ctx.shadowBlur = 12;
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 3.5;
          ctx.setLineDash([6, 4]);
          ctx.lineDashOffset = -(Date.now() / 40);
          ctx.beginPath();

          let started = false;
          for (const node of calculatedRoute.path) {
            const nf = Math.floor(node / FS);
            if (nf !== activeFloor) continue;
            const nx = (node % FS) % W;
            const ny = Math.floor((node % FS) / W);
            const px = nx * CS + 10;
            const py = ny * CS + 10;
            if (!started) {
              ctx.moveTo(px, py);
              started = true;
            } else {
              ctx.lineTo(px, py);
            }
          }
          ctx.stroke();
          ctx.restore();
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [activeFloor, gridData, pin, calculatedRoute]);

  return (
    <div className="standalone-floor-map-container">
      {/* Sleek Top Floor Map Navigation Bar */}
      <header className="standalone-map-header">
        <div className="standalone-map-brand">
          <div className="brand-icon-box">
            <Compass size={20} color="#38bdf8" />
          </div>
          <div>
            <h1 className="brand-title">AEGIS · Building Floor Map</h1>
            <div className="brand-subtitle">
              <span className="live-status-dot"></span>
              <span>LIVE MOBILE BLUEPRINT VIEW</span>
            </div>
          </div>
        </div>

        {/* Floor Selection Pills */}
        <div className="standalone-floor-pills">
          {FN.map((name, idx) => (
            <button
              key={idx}
              className={`floor-pill-btn ${activeFloor === idx ? 'active' : ''}`}
              onClick={() => {
                setActiveFloor(idx);
                if (pin && pin.floor !== idx) {
                  setPin(null);
                  setCalculatedRoute(null);
                }
              }}
            >
              {name}
            </button>
          ))}
        </div>

        {/* Action buttons: Quiz & Certificate and Return */}
        <div className="standalone-header-actions">
          <button
            className="btn-quiz-cta"
            onClick={() => setShowQuizModal(true)}
            title="Take Fire Safety & Exit Quiz to earn Official Safety Certificate"
          >
            <Award size={15} color="#fbbf24" />
            <span>Safety Quiz 🎓</span>
          </button>
          {onBack ? (
            <button className="btn-back-cmd" onClick={onBack} title="Return to Simulator Command Center">
              <ArrowLeft size={15} />
              <span>Command Center</span>
            </button>
          ) : (
            <button
              className="btn-back-cmd"
              onClick={() => {
                window.location.href = '/';
              }}
              title="Return to Full Simulator"
            >
              <ArrowLeft size={15} />
              <span>Simulator</span>
            </button>
          )}
        </div>
      </header>

      {/* Emergency Alert Banner (Displays only if active incident) */}
      {emergencyAlert.active && (
        <div className="standalone-alert-banner">
          <Flame size={18} color="#ef4444" className="pulse-danger-icon" />
          <div className="alert-banner-text">
            <b>🚨 ACTIVE FIRE HAZARD REPORTED ON {emergencyAlert.floor.toUpperCase()}</b> · Avoid fired zones & follow glowing green route markers.
          </div>
        </div>
      )}

      {/* Main Floor Map Canvas Viewport */}
      <main className="standalone-canvas-viewport">
        <div className="canvas-wrapper-card">
          <canvas
            ref={canvasRef}
            width={800}
            height={500}
            className="standalone-floor-canvas"
            onClick={handleCanvasClick}
          />
        </div>

        {/* Interactive Floating Wayfinding Info Chip */}
        {calculatedRoute ? (
          <div className="standalone-route-float-chip">
            <div className="float-chip-title">
              <Navigation size={15} color="#22c55e" />
              <span>Fastest Escape Path: <b>{calculatedRoute.targetLabel}</b></span>
            </div>
            <div className="float-chip-meta">
              <span>Distance: <b>{calculatedRoute.distMeters}m</b></span>
              <span>•</span>
              <span>Walking Time: <b>~{calculatedRoute.estSec}s</b></span>
            </div>
          </div>
        ) : (
          <div className="standalone-tap-hint">
            <MapPin size={14} color="#38bdf8" />
            <span>Tap anywhere on the floor map to pinpoint your location and see your fastest emergency exit route</span>
          </div>
        )}

        {/* Safety Quiz & Certification Prompt Bar */}
        <div className="standalone-quiz-invite-bar" onClick={() => setShowQuizModal(true)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Award size={18} color="#fbbf24" />
            <span><b>Block 4 Safety Test:</b> Quiz on Fire Extinguishers & Exits to earn your official certificate.</span>
          </div>
          <span className="quiz-invite-action">Take Quiz & Get Certified →</span>
        </div>
      </main>

      {/* Interactive Safety Quiz & Certificate Modal */}
      <SafetyQuizModal isOpen={showQuizModal} onClose={() => setShowQuizModal(false)} />
    </div>
  );
}
