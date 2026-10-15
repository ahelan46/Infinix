import React, { useState, useEffect, useRef, useCallback } from 'react';
import HazardAlerts from './components/HazardAlerts';
import MobileEmergencyAlert from './components/MobileEmergencyAlert';
import StandaloneFloorMap from './components/StandaloneFloorMap';
import SafetyQuizModal from './components/SafetyQuizModal';
import { WIFI_LAPTOP_IP, EMERGENCY_PHONE, getMobileAppUrl, getMobileSmsRedirectUrl, getMobileFloorMapUrl } from './config';
import {
  ShieldAlert,
  Flame,
  Waves,
  Play,
  Pause,
  RotateCcw,
  Building2,
  Users,
  Radio,
  Layers,
  Activity,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Volume2,
  VolumeX,
  Sliders,
  Download,
  Save,
  Compass,
  Eye,
  HelpCircle,
  FileText,
  Clock,
  Sparkles,
  GitCompare,
  ArrowRight,
  ArrowLeft,
  Smartphone,
  Copy,
  Wifi,
  Mail,
  ExternalLink,
  QrCode,
  Award
} from 'lucide-react';
import './components/StandaloneFloorMap.css';
import './App.css';

// ============================================================================
// Simulation Engine Constants & Geometry
// ============================================================================
const W = 40, H = 25, FS = W * H, F = 4, CS = 20, SP = 1.3, MAXC = 4;
const FC = ['#64748b', '#f59e0b', '#8b5cf6', '#06b6d4'];
const FN = ['Ground', 'Floor 1', 'Floor 2', 'Floor 3'];
const FIRST_NAMES = [
  'Arun', 'Priya', 'Karthik', 'Divya', 'Rahul', 'Meena', 'Suresh', 'Lakshmi',
  'Vikram', 'Anjali', 'Dinesh', 'Kavya', 'Ravi', 'Sneha', 'Ganesh', 'Nisha',
  'Manoj', 'Pooja', 'Hari', 'Swathi', 'Bala', 'Deepa', 'Naveen', 'Revathi',
  'Sanjay', 'Ishita', 'Mohan', 'Tara', 'Ajay', 'Bhavna', 'Kiran', 'Latha'
];
const rname = () => FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)] + ' ' + String.fromCharCode(65 + Math.floor(Math.random() * 26)) + '.';

// 3D Oblique Projection Constants
const P3 = { ex: 110, sx: 12, kx: 5.5, sy: 3.4, top: 14, gap: 112 };
const fy3 = (f, nf) => P3.top + (nf - 1 - f) * P3.gap;
const p3 = (f, x, y, nf) => [P3.ex + x * P3.sx + y * P3.kx, fy3(f, nf) + y * P3.sy];
const pick3D = (px, py, nf) => {
  for (let f = 0; f < nf; f++) {
    const gy = (py - fy3(f, nf)) / P3.sy;
    const gx = (px - P3.ex - gy * P3.kx) / P3.sx;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) return [f, Math.floor(gx), Math.floor(gy)];
  }
  return null;
};

// Binary Min-Heap Priority Queue for Dijkstra
function pushHeap(h, v) {
  h.push(v);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p][0] <= h[i][0]) break;
    [h[p], h[i]] = [h[i], h[p]];
    i = p;
  }
}

function popHeap(h) {
  const t = h[0], l = h.pop();
  if (h.length) {
    h[0] = l;
    let i = 0;
    for (;;) {
      const a = 2 * i + 1, b = a + 1;
      let m = i;
      if (a < h.length && h[a][0] < h[m][0]) m = a;
      if (b < h.length && h[b][0] < h[m][0]) m = b;
      if (m === i) break;
      [h[m], h[i]] = [h[i], h[m]];
      i = m;
    }
  }
  return t;
}

// Full-featured 3D Graph & Multi-Agent Engine
class SimEngine {
  constructor(g, ex, st, pos, nf, spread, ci, hazardMode) {
    this.g = new Uint8Array(g);
    this.nf = nf;
    this.spread = spread;
    this.ci = ci || 0.5;
    this.hazard = hazardMode || 'fire';
    this.flood = this.hazard === 'flood';
    this.ex = ex.map(e => ({ ...e, tok: 0, used: 0, load: 0 }));
    this.st = st.map(s => ({ ...s, tok: 0, used: 0 }));
    this.t = 0;
    this.rer = 0;
    this.done = 0;
    this.dirty = true;
    this.ft = -9;
    this.evt = null;
    this.eid = 0;
    this.trapped = 0;
    this.est = 0;
    this.fe = Array(F).fill(0);
    this.d = [];
    this.sp = 0;
    this.ag = pos.map(([f, x, y, nm]) => ({
      f, x, y,
      name: nm || rname(),
      pr: Math.random() * 0.5,
      st: 'moving',
      ex: -1,
      nx: -1,
      rrE: -2,
      j: [Math.random() - 0.5, Math.random() - 0.5],
      health: 100,
      smokeExposure: 0,
      incapacitated: false,
      rescuedBy: null,
      rescued: false,
      inEscort: false
    }));
    this.n = this.ag.length;
    this.heat = new Float32Array(F * FS);
    this.smoke = new Float32Array(F * FS);
    this.tSmoke = true;
    this.responders = [];
    this.rescuedCount = 0;
    this.occ = new Uint8Array(F * FS);
    this.fc = Array(F).fill(0);
    this.ag.forEach(a => this.fc[a.f]++);
    this.n0 = this.fc.slice();
    this.fd = this.fc.map(c => c ? null : 0);
    this.hist = [[0, this.n, ...this.fc]];
    this.ht = 1;
    this.seeded = false;

    if (this.flood) {
      this.ref = { x: -1, y: -1, cap: 99, n: -1, refuge: true, tok: 0, used: 0, load: 0 };
      this.ex.push(this.ref);
    }
  }

  nd(a) { return a.f * FS + a.y * W + a.x; }
  blocked(i) {
    const v = this.g[i];
    return v === 1 || v === 3 || v === 5 || v === 6 || v === 7;
  }

  hasActiveFire() {
    for (let i = 0; i < F * FS; i++) if (this.g[i] === 3) return true;
    return false;
  }

  isNearFire(c, radius = 1) {
    if (c < 0 || c >= F * FS) return false;
    const f = Math.floor(c / FS), r = c % FS, x = r % W, y = Math.floor(r / W);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) {
          if (this.g[f * FS + ny * W + nx] === 3) return true;
        }
      }
    }
    return false;
  }

  fireDistance(c) {
    if (c < 0 || c >= F * FS) return 999;
    const f = Math.floor(c / FS), r = c % FS, x = r % W, y = Math.floor(r / W);
    let minDist = 999;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) {
          if (this.g[f * FS + ny * W + nx] === 3) {
            const d = Math.max(Math.abs(dx), Math.abs(dy));
            if (d < minDist) minDist = d;
          }
        }
      }
    }
    return minDist;
  }

  nbrs(c) {
    const r = c % FS, x = r % W, y = Math.floor(r / W), f = Math.floor(c / FS), o = [];
    if (x > 0) o.push(c - 1);
    if (x < W - 1) o.push(c + 1);
    if (r >= W) o.push(c - W);
    if (r < FS - W) o.push(c + W);
    const isStair = this.g[c] === 4 || (this.st && this.st.some(s => s.x === x && s.y === y));
    if (isStair) {
      if (f > 0 && !this.blocked(c - FS)) o.push(c - FS);
      if (f < F - 1 && !this.blocked(c + FS)) o.push(c + FS);
    }
    return o;
  }

  recount() {
    this.occ.fill(0);
    for (const a of this.ag) if (a.st !== 'out') this.occ[this.nd(a)]++;
  }

  fcount() {
    this.fc.fill(0);
    for (const a of this.ag) if (a.st !== 'out') this.fc[a.f]++;
  }

  compute() {
    this.recount();
    this.ex.forEach(e => e.load = 0);
    for (const a of this.ag) if (a.st !== 'out' && a.ex >= 0 && this.ex[a.ex]) this.ex[a.ex].load++;

    this.d = this.ex.map(e => {
      const d = new Float32Array(F * FS).fill(Infinity);
      if (!e.refuge && this.blocked(e.n)) return d;
      const h = [];
      if (e.refuge) {
        for (let r = 0; r < FS; r++) {
          const n = (this.nf - 1) * FS + r;
          if (!this.blocked(n)) { d[n] = 0; h.push([0, n]); }
        }
      } else {
        d[e.n] = 0;
        h.push([0, e.n]);
      }

      while (h.length) {
        const [dc, c] = popHeap(h);
        if (dc > d[c]) continue;
        for (const n of this.nbrs(c)) {
          const v = this.g[n];
          if (v === 1 || v === 3 || v === 5 || v === 6 || v === 7) continue; // Fire, walls, elevators, flood are impassable
          // Heavy proximity deterrence: people will NEVER cross near fire when alternate routes exist
          const fd = this.fireDistance(n);
          let nearFirePenalty = 0;
          if (fd === 1) nearFirePenalty = 500.0;
          else if (fd === 2) nearFirePenalty = 150.0;
          else if (fd === 3) nearFirePenalty = 40.0;

          const stairCost = v === 4 ? 3.5 : 1.0;
          const cost = stairCost + nearFirePenalty;
          const nd = dc + cost;
          if (nd < d[n]) {
            d[n] = nd;
            pushHeap(h, [nd, n]);
          }
        }
      }
      return d;
    });

    this.dirty = false;
    this.ft = this.t;
    this.estimate();
  }

  score(e, c) {
    if (!this.d[e]) return Infinity;
    return this.d[e][c] + (this.ex[e].load / this.ex[e].cap) * SP * 0.5;
  }

  mark(a) {
    const id = this.evt ? this.evt.id : -1;
    if (a.rrE !== id) {
      a.rrE = id;
      this.rer++;
    }
  }

  choose(a, silent) {
    const c = this.nd(a);
    let b = -1, bs = Infinity;
    this.ex.forEach((_, e) => {
      const s = this.score(e, c);
      if (s < bs) { bs = s; b = e; }
    });
    if (b < 0 || bs === Infinity) return -1;
    if (a.ex >= 0 && this.ex[a.ex]) {
      const so = this.score(a.ex, c);
      const isFireEmergency = this.hasActiveFire();
      const hysteresis = isFireEmergency ? 0.5 : 4.0;
      if (so < Infinity && so - bs < hysteresis) return a.ex;
      if (!silent) this.mark(a);
      this.ex[a.ex].load--;
    }
    this.ex[b].load++;
    a.ex = b;
    return b;
  }

  assign() {
    for (const a of this.ag) this.choose(a, true);
  }

  estimate() {
    const L = this.ex.map(() => []);
    let tr = 0;
    for (const a of this.ag) {
      if (a.st === 'out') continue;
      const c = this.nd(a);
      let b = -1, bd = Infinity;
      this.d.forEach((d, e) => {
        if (d[c] < bd) { bd = d[c]; b = e; }
      });
      if (b < 0 || bd >= Infinity) { tr++; continue; }
      L[b].push([bd / SP, a.f]);
    }

    const fe = Array(F).fill(0);
    let T = 0;
    L.forEach((l, e) => {
      l.sort((p, q) => p[0] - q[0]);
      const s = 1 / this.ex[e].cap;
      let prev = -s;
      for (const [t, f] of l) {
        prev = Math.max(t, prev + s);
        fe[f] = Math.max(fe[f], prev);
        T = Math.max(T, prev);
      }
    });

    this.trapped = tr;
    this.est = T;
    this.fe = fe;
  }

  addFire(f, x, y, r) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const i = f * FS + ny * W + nx, v = this.g[i];
        if (v !== 1 && v !== 5 && v !== 6) {
          this.g[i] = this.flood ? 7 : 3;
          if (this.smoke && !this.flood) this.smoke[i] = 1.0;
        }
      }
    }
    this.dirty = true;
    this.evt = { t: this.t, r: this.rer, x, y, f, id: ++this.eid };
    this.pend = true;

    // Immediately recompute distance fields and trigger dynamic reroutes for all active occupants
    this.compute();
    for (const a of this.ag) {
      if (a.st === 'out' || a.incapacitated) continue;
      const c = this.nd(a);
      if (a.nx >= 0 && (this.blocked(a.nx) || (this.isNearFire(a.nx, 1) && !this.isNearFire(c, 1)))) {
        a.nx = -1;
        a.pr = 0;
        this.mark(a);
      }
      this.choose(a);
    }
  }

  doSpread(dt) {
    this.sp += dt;
    if (this.sp < 3) return;
    this.sp = 0;
    const nw = [];
    for (let i = 0; i < F * FS; i++) {
      if (this.g[i] === 3) {
        const r = i % FS, x = r % W, y = Math.floor(r / W);
        const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && Math.random() < 0.35) {
          const j = i + dy * W + dx;
          if (this.g[j] !== 1 && this.g[j] !== 3 && this.g[j] !== 5 && this.g[j] !== 6 && this.g[j] !== 8) {
            nw.push(j);
            if (this.smoke) this.smoke[j] = 1.0;
          }
        }
      }
    }
    if (nw.length) {
      nw.forEach(j => this.g[j] = 3);
      this.dirty = true;
      const firstCell = nw[0];
      const sf = Math.floor(firstCell / FS), sr = firstCell % FS;
      this.evt = { t: this.t, r: this.rer, x: sr % W, y: Math.floor(sr / W), f: sf, id: ++this.eid };
      this.compute();
      for (const a of this.ag) {
        if (a.st === 'out' || a.incapacitated) continue;
        const c = this.nd(a);
        if (a.nx >= 0 && (this.blocked(a.nx) || (this.isNearFire(a.nx, 1) && !this.isNearFire(c, 1)))) {
          a.nx = -1;
          a.pr = 0;
          this.mark(a);
        }
        this.choose(a);
      }
    }
  }

  doSmokeSpread(dt) {
    if (!this.tSmoke || this.flood) return;
    for (let i = 0; i < F * FS; i++) {
      if (this.g[i] === 3) {
        this.smoke[i] = 1.0;
        const f = Math.floor(i / FS), r = i % FS, x = r % W, y = Math.floor(r / W);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H) {
            const j = f * FS + ny * W + nx;
            if (this.g[j] !== 1 && this.g[j] !== 5) {
              this.smoke[j] = Math.min(1.0, this.smoke[j] + 0.45 * dt);
            }
          }
        }
      }
    }

    const nextSmoke = new Float32Array(this.smoke);
    for (let i = 0; i < F * FS; i++) {
      const cur = this.smoke[i];
      if (cur <= 0.02) continue;
      const f = Math.floor(i / FS), r = i % FS;

      // Horizontal diffusion
      for (const n of this.nbrs(i)) {
        if (this.g[n] !== 1 && this.g[n] !== 5) {
          nextSmoke[n] = Math.min(1.0, nextSmoke[n] + cur * 0.12 * dt);
        }
      }

      // Vertical shaft chimney effect: smoke ascends stairs to upper floor
      if (this.g[i] === 4 && f < F - 1) {
        const up = (f + 1) * FS + r;
        if (this.g[up] === 4) {
          nextSmoke[up] = Math.min(1.0, nextSmoke[up] + cur * 0.35 * dt);
        }
      }

      // Dissipation in unburned rooms
      if (this.g[i] !== 3) {
        nextSmoke[i] = Math.max(0, cur - 0.04 * dt);
      }
    }
    this.smoke = nextSmoke;
  }

  doExtinguisherSuppression(dt) {
    if (this.flood) return;
    for (let i = 0; i < F * FS; i++) {
      if (this.g[i] === 8) {
        const f = Math.floor(i / FS), r = i % FS, ex = r % W, ey = Math.floor(r / W);
        let suppressed = false;
        for (let dx = -2; dx <= 2; dx++) {
          for (let dy = -2; dy <= 2; dy++) {
            const nx = ex + dx, ny = ey + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const j = f * FS + ny * W + nx;
            if (this.g[j] === 3) {
              this.g[j] = 0;
              if (this.smoke) this.smoke[j] = Math.max(0, this.smoke[j] - 0.7);
              suppressed = true;
            }
          }
        }
        if (suppressed) {
          this.dirty = true;
          if (this.log && (!this.lastExtLog || this.t - this.lastExtLog > 3)) {
            this.lastExtLog = this.t;
            this.log(`🧯 Fire Extinguisher auto-discharged on ${FN[f]} (${ex},${ey})! Fire suppressed.`);
          }
        }
      }
    }
  }

  doSprinklerSuppression(dt) {
    if (this.flood) return;
    let hasFire = false;
    for (let i = 0; i < F * FS; i++) {
      if (this.g[i] === 3) { hasFire = true; break; }
    }
    this.sprinklersActive = hasFire;
    if (!hasFire) return;

    let suppressedAny = false;
    for (let i = 0; i < F * FS; i++) {
      if (this.g[i] === 3) {
        const f = Math.floor(i / FS), r = i % FS, x = r % W, y = Math.floor(r / W);
        // Overhead water sprinklers along walls deluge adjacent rooms within 3.5 cells
        let nearWall = false;
        for (let dx = -3; dx <= 3; dx++) {
          for (let dy = -3; dy <= 3; dy++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < W && ny < H) {
              if (this.g[f * FS + ny * W + nx] === 1) { nearWall = true; break; }
            }
          }
          if (nearWall) break;
        }

        if (nearWall) {
          // Water spray knocks down fire and cools cell
          if (Math.random() < 0.25 * (dt / 0.1)) {
            this.g[i] = 0;
            suppressedAny = true;
          }
          if (this.smoke) this.smoke[i] = Math.max(0, this.smoke[i] - 0.75 * dt);
          if (this.heat) this.heat[i] = Math.max(0, this.heat[i] - 1.8 * dt);
        }
      }
    }

    if (suppressedAny) {
      this.dirty = true;
      if (this.log && (!this.lastSprinklerLog || this.t - this.lastSprinklerLog > 3)) {
        this.lastSprinklerLog = this.t;
        this.log('💦 Localized Overhead Sprinklers discharging over active fire zone! Pressurized water dousing flames.');
      }
    }
  }

  dispatchResponder(name, entryIdx = 0) {
    const groundExits = this.ex.filter(e => !e.refuge && e.y !== undefined);
    const chosenExit = groundExits[entryIdx % Math.max(1, groundExits.length)] || { x: 0, y: 12 };
    const id = 'R-' + (this.responders.length + 1);
    const responder = {
      id,
      name: name || `Squad ${String.fromCharCode(65 + this.responders.length)}`,
      f: 0,
      x: chosenExit.x,
      y: chosenExit.y,
      st: 'inbound', // 'inbound', 'rescuing', 'escorting', 'idle'
      targetAgent: null,
      path: [],
      pr: 0,
      health: 100,
      air: 100,
      rescuedCount: 0,
      j: [0, 0]
    };
    this.responders.push(responder);
    if (this.log) this.log(`🚒 ${responder.name} deployed from Ground Exit (${chosenExit.x},${chosenExit.y}) with SCBA.`);
    return responder;
  }

  recallResponders() {
    this.responders = [];
    if (this.log) this.log('🚒 First responder squads recalled from active zones.');
  }

  findTacticalPath(startNode, endNode) {
    if (startNode === endNode) return [startNode];
    const parent = new Map();
    const h = [[0, startNode]];
    const dist = new Float32Array(F * FS).fill(Infinity);
    dist[startNode] = 0;

    while (h.length) {
      const [dc, c] = popHeap(h);
      if (c === endNode) break;
      if (dc > dist[c]) continue;

      for (const n of this.nbrs(c)) {
        const cellType = this.g[n];
        if (cellType === 1 || cellType === 3 || cellType === 5) continue;
        const stepCost = cellType === 4 ? 3.0 : 1.0;
        const nd = dc + stepCost;
        if (nd < dist[n]) {
          dist[n] = nd;
          parent.set(n, c);
          pushHeap(h, [nd, n]);
        }
      }
    }

    if (!parent.has(endNode)) return [];
    const path = [];
    let curr = endNode;
    while (curr !== undefined) {
      path.unshift(curr);
      curr = parent.get(curr);
    }
    return path;
  }

  stepResponders(dt) {
    if (!this.responders || !this.responders.length) return;

    for (const r of this.responders) {
      r.air = Math.max(0, r.air - 0.15 * dt);

      if (r.targetAgent && (r.targetAgent.st === 'out' || r.targetAgent.rescued)) {
        r.targetAgent = null;
        if (r.st !== 'escorting') r.st = 'idle';
      }

      if (r.st === 'idle' || !r.targetAgent) {
        let bestA = null, maxUrg = -1;
        for (const a of this.ag) {
          if (a.st === 'out' || a.rescued || a.rescuedBy) continue;
          const isCutOff = this.d[a.ex] && this.d[a.ex][this.nd(a)] === Infinity;
          const sm = this.smoke ? this.smoke[this.nd(a)] : 0;
          if (a.incapacitated || a.st === 'waiting' || isCutOff || sm > 0.3) {
            const urg = (a.incapacitated ? 160 : 0) + (100 - a.health) * 1.5 + sm * 80 - Math.abs(a.f - r.f) * 12;
            if (urg > maxUrg) {
              maxUrg = urg;
              bestA = a;
            }
          }
        }
        if (bestA) {
          r.targetAgent = bestA;
          r.st = 'inbound';
          r.path = [];
          if (this.log) this.log(`🎯 ${r.name} acquired triage target: ${bestA.name} on ${FN[bestA.f]}`);
        }
      }

      const currentPos = r.f * FS + r.y * W + r.x;
      let targetNode = -1;

      if (r.st === 'inbound' && r.targetAgent) {
        targetNode = this.nd(r.targetAgent);
      } else if (r.st === 'escorting') {
        let minD = Infinity, bestEx = null;
        for (const e of this.ex) {
          if (e.refuge) continue;
          const exNode = e.n;
          const d = Math.hypot(r.x - e.x, r.y - e.y) + r.f * 15;
          if (d < minD && !this.blocked(exNode)) { minD = d; bestEx = exNode; }
        }
        targetNode = bestEx !== null ? bestEx : 0 * FS + 12 * W + 0;
      }

      if (targetNode >= 0 && (!r.path || !r.path.length || r.path[r.path.length - 1] !== targetNode)) {
        r.path = this.findTacticalPath(currentPos, targetNode);
      }

      if (r.path && r.path.length > 1) {
        r.pr += 1.8 * dt;
        if (r.pr >= 1) {
          r.pr = 0;
          r.path.shift();
          const next = r.path[0];
          r.f = Math.floor(next / FS);
          r.x = (next % FS) % W;
          r.y = Math.floor((next % FS) / W);

          if (r.st === 'escorting' && r.targetAgent) {
            r.targetAgent.f = r.f;
            r.targetAgent.x = r.x;
            r.targetAgent.y = r.y;
            r.targetAgent.st = 'moving';
          }
        }
      }

      if (r.st === 'inbound' && r.targetAgent) {
        if (r.f === r.targetAgent.f && Math.hypot(r.x - r.targetAgent.x, r.y - r.targetAgent.y) <= 1.0) {
          r.targetAgent.health = Math.max(r.targetAgent.health, 70);
          r.targetAgent.incapacitated = false;
          r.targetAgent.rescuedBy = r.id;
          r.targetAgent.inEscort = true;
          r.targetAgent.st = 'moving';
          r.st = 'escorting';
          r.path = [];
          if (this.log) this.log(`🚒 ${r.name} reached ${r.targetAgent.name} on ${FN[r.f]}! Oxygen attached. Escorting to exit.`);
        }
      } else if (r.st === 'escorting' && r.targetAgent) {
        if (r.f === 0 && this.g[r.y * W + r.x] === 2) {
          r.targetAgent.st = 'out';
          r.targetAgent.rescued = true;
          r.targetAgent.inEscort = false;
          r.targetAgent.rescuedBy = null;
          this.done++;
          this.rescuedCount++;
          r.rescuedCount++;
          if (this.log) this.log(`🎉 SUCCESS: ${r.targetAgent.name} safely extracted to Ground Exit by ${r.name}!`);
          r.targetAgent = null;
          r.st = 'idle';
          r.path = [];
        }
      }
    }
  }

  doFlood(dt) {
    if (!this.seeded && this.t >= 5) {
      this.seeded = true;
      this.ex.forEach(e => {
        if (!e.refuge && this.g[e.n] !== 1) this.g[e.n] = 7;
      });
      this.dirty = true;
      this.evt = { t: this.t, r: this.rer, x: 0, y: 0, f: 0, id: ++this.eid };
      this.pend = false;
      if (this.log) this.log('Flood water is entering through the ground floor exits');
    }
    this.sp += dt;
    if (this.sp < 1.5) return;
    this.sp = 0;
    const nw = [], SI = new Set(this.st.map(q => q.y * W + q.x));
    for (let i = 0; i < F * FS; i++) {
      if (this.g[i] === 7) {
        const r = i % FS, x = r % W, y = Math.floor(r / W);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || Math.random() > 0.4) continue;
          const j = i + dy * W + dx, v = this.g[j];
          if (v !== 1 && v !== 5 && v !== 6 && v !== 7) nw.push(j);
        }
        if (SI.has(r) && i + FS < F * FS && this.g[i + FS] === 4 && Math.random() < 0.12) {
          nw.push(i + FS);
        }
      }
    }
    if (nw.length) {
      nw.forEach(j => this.g[j] = 7);
      this.dirty = true;
    }
  }

  step(dt) {
    this.t += dt;
    if (this.flood) this.doFlood(dt);
    else if (this.spread) this.doSpread(dt);

    // Run smoke dispersion, extinguisher suppression, overhead water sprinklers & tactical rescue logic
    this.doSmokeSpread(dt);
    this.doExtinguisherSuppression(dt);
    this.doSprinklerSuppression(dt);
    this.stepResponders(dt);

    if (this.dirty || this.t - this.ft >= this.ci) this.compute();
    else this.recount();

    const occ = this.occ;
    this.ex.forEach(e => e.tok = Math.min(e.tok + e.cap * dt * 2.0, e.cap + 2));
    this.st.forEach(s => s.tok = Math.min(s.tok + s.cap * dt * 2.5, s.cap * 2 + 2));

    for (let i = 0; i < occ.length; i++) this.heat[i] += occ[i] * dt;

    for (const a of this.ag) {
      if (a.st === 'out') continue;
      const c = this.nd(a), e = this.ex.find(q => q.n === c && a.f === 0);

      // Smoke exposure and health penalties
      const sm = this.smoke ? this.smoke[c] : 0;
      if (sm > 0.25) {
        a.smokeExposure += sm * dt;
      }
      if (sm > 0.65 && !a.inEscort) {
        a.health = Math.max(0, a.health - sm * 1.5 * dt);
        if (a.health <= 0 && !a.incapacitated) {
          a.incapacitated = true;
          a.st = 'waiting';
          if (this.log && Math.random() < 0.2) {
            this.log(`⚠️ CRITICAL: ${a.name} on ${FN[a.f]} collapsed from toxic smoke inhalation! Dispatch rescue team.`);
          }
        }
      }

      if (a.incapacitated) {
        a.st = 'waiting';
        continue;
      }
      if (a.inEscort) {
        continue;
      }

      if (this.flood && a.f >= this.nf - 1 && this.g[c] !== 7) {
        a.st = 'out';
        this.done++;
        if (this.ref) this.ref.used++;
        occ[c]--;
        continue;
      }
      if (e) {
        if (e.tok >= 1) {
          e.tok--;
          e.used++;
          a.st = 'out';
          this.done++;
          occ[c]--;
        } else a.st = 'waiting';
        continue;
      }
      if (a.nx >= 0 && (this.blocked(a.nx) || (this.isNearFire(a.nx, 1) && !this.isNearFire(c, 1)))) {
        a.nx = -1;
        a.pr = 0;
        this.mark(a);
      }

      let ei = this.choose(a);
      if (ei < 0) {
        // Fallback: pick closest open exit
        let minD = Infinity, bestE = -1;
        this.ex.forEach((ex, idx) => {
          if (!this.blocked(ex.n) && this.d[idx] && this.d[idx][c] < minD) {
            minD = this.d[idx][c];
            bestE = idx;
          }
        });
        ei = bestE >= 0 ? bestE : 0;
      }
      const d = (ei >= 0 && this.d[ei]) ? this.d[ei] : null;
      let nb = -1, bd = (d && d[c] < Infinity) ? d[c] : Infinity;
      if (d && d[c] < Infinity) {
        for (const n of this.nbrs(c)) {
          const v = this.g[n];
          if (v === 1 || v === 3 || v === 5 || v === 6 || v === 7) continue;
          // STRICT EXCLUSION: Never step into a cell adjacent to fire if currently safe
          if (this.isNearFire(n, 1) && !this.isNearFire(c, 1)) continue;
          if (d[n] < bd) {
            bd = d[n];
            nb = n;
          }
        }
      } else if (d) {
        // Agent is currently on a cell with infinite distance (e.g. fire cell or cut-off zone).
        // Try to step to any neighboring cell that has an open path to an exit!
        for (const n of this.nbrs(c)) {
          const v = this.g[n];
          if (v === 1 || v === 3 || v === 5 || v === 6 || v === 7) continue;
          if (this.isNearFire(n, 1) && !this.isNearFire(c, 1)) continue;
          if (d[n] < bd) {
            bd = d[n];
            nb = n;
          }
        }
        // If still trapped, but currently standing in fire (v === 3), flee to ANY safe unblocked cell
        if (nb < 0 && this.g[c] === 3) {
          for (const n of this.nbrs(c)) {
            const v = this.g[n];
            if (v !== 1 && v !== 3 && v !== 5 && v !== 6 && v !== 7) {
              nb = n;
              break;
            }
          }
        }
      }

      if (nb < 0) {
        a.st = 'waiting';
        continue;
      }

      // Check if neighbor represents a dynamic reroute (direction change away from previous path)
      if (a.nx >= 0 && a.nx !== nb) {
        this.mark(a);
        a.pr = 0; // smoothly pivot towards new safe direction
      }
      a.nx = nb;

      const vert = Math.floor(nb / FS) !== a.f;
      const onSt = this.g[c] === 4 || this.g[nb] === 4;
      const smokeSpeedFactor = sm > 0.25 ? Math.max(0.4, 1.0 - sm * 0.5) : 1.0;
      const crowdSlow = Math.max(0.25, 1 - occ[nb] / (MAXC * 2));
      a.pr += SP * (onSt ? 0.7 : 1) * smokeSpeedFactor * crowdSlow * dt;
      if (a.pr < 1) {
        a.st = 'moving';
        continue;
      }

      const stair = vert ? this.st.find(s => s.x === a.x && s.y === a.y) : null;
      if (vert && (!stair || stair.tok < 0.2)) {
        a.pr = 0.95;
        a.st = 'moving';
        continue;
      }

      if (vert && stair) { stair.tok = Math.max(0, stair.tok - 0.25); stair.used++; }
      occ[c]--;
      occ[nb]++;
      a.f = Math.floor(nb / FS);
      a.x = (nb % FS) % W;
      a.y = Math.floor((nb % FS) / W);
      a.pr = 0;
      a.st = 'moving';
    }

    this.fcount();
    for (let f = 0; f < F; f++) {
      if (this.fd[f] === null && this.fc[f] === 0) this.fd[f] = this.t;
    }
    if (this.t >= this.ht) {
      this.hist.push([this.t, this.n - this.done, ...this.fc]);
      this.ht += 1;
    }
    if (this.pend && this.t - this.evt.t >= 1.5 && this.log) {
      this.pend = false;
      this.log(`Blockage at ${FN[this.evt.f]} (${this.evt.x},${this.evt.y}) → routes recomputed, ${this.rer - this.evt.r} agents re-routed`);
    }
  }

  finished() {
    if (this.n === 0 || this.t < 2.0) return false;
    if (this.done >= this.n) return true;
    const activeOccupants = this.ag.filter(a => a.st !== 'out' && !a.incapacitated);
    if (activeOccupants.length === 0 && this.t > 10.0) return true;
    if (this.t > 240) return true;
    return false;
  }
}

export default function App() {
  const canvasRef = useRef(null);
  const chartCanvasRef = useRef(null);
  const compareChartCanvasRef = useRef(null);
  const routeCanvasRef = useRef(null);

  // Core base grid data
  const baseRef = useRef({
    g: new Uint8Array(F * FS),
    ex: [],
    st: [],
    pos: [],
    nf: 4
  });

  const simRef = useRef(null);

  // Component UI State
  const [activeFloor, setActiveFloor] = useState(0); // 0..3 or -1 for All Floors 3D
  const [selectedTool, setSelectedTool] = useState('wall');
  const [capacityInput, setCapacityInput] = useState('2');
  const [simRunning, setSimRunning] = useState(false);
  const simRunningRef = useRef(false);
  simRunningRef.current = simRunning;
  const initialRestoredRef = useRef(false);
  const [activePage, setActivePage] = useState('simulator'); // 'simulator' | 'routemap'
  const [routeFloor, setRouteFloor] = useState(0); // 0..3 for Route Map page
  const [calculatedRoute, setCalculatedRoute] = useState(null); // { path, distMeters, estSec, exitLetter, steps, targetExit }
  const [selectedRouteAgent, setSelectedRouteAgent] = useState(null); // 'You are here' pin for route map
  const [customPin, setCustomPin] = useState(null); // { f, x, y }
  const [simStarted, setSimStarted] = useState(false);
  const [simSpeed, setSimSpeed] = useState(4);
  const [hazardMode, setHazardMode] = useState('fire');
  const [currentPreset, setCurrentPreset] = useState('office');
  const [activeDeckTab, setActiveDeckTab] = useState('ai'); // 'ai' | 'analytics' | 'compare' | 'manifest' | 'logs'
  const [showDocModal, setShowDocModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showQuizModal, setShowQuizModal] = useState(() => {
    if (typeof window === 'undefined') return false;
    const search = window.location.search || '';
    const path = window.location.pathname || '';
    const hash = window.location.hash || '';
    return search.includes('view=quiz') || path === '/quiz' || hash === '#quiz';
  });
  const [copiedMapUrl, setCopiedMapUrl] = useState(false);
  const [isMapOnlyMode, setIsMapOnlyMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    const search = window.location.search || '';
    const path = window.location.pathname || '';
    const hash = window.location.hash || '';
    // If user explicitly requested desktop view
    if (search.includes('view=desktop') || hash === '#desktop') return false;
    // If user explicitly requested map view
    if (search.includes('view=map') || path === '/map' || hash === '#map') return true;
    // Auto-detect mobile devices (iPhone, iPad, Android phone) or mobile screen width
    const isMobileUA = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
    const isMobileWidth = window.innerWidth <= 768;
    return isMobileUA || isMobileWidth;
  });

  useEffect(() => {
    const handleUrlChange = () => {
      const search = window.location.search || '';
      const path = window.location.pathname || '';
      const hash = window.location.hash || '';
      if (search.includes('view=desktop') || hash === '#desktop') {
        setIsMapOnlyMode(false);
      } else if (search.includes('view=map') || path === '/map' || hash === '#map') {
        setIsMapOnlyMode(true);
      } else {
        const isMobileUA = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
        const isMobileWidth = window.innerWidth <= 768;
        setIsMapOnlyMode(isMobileUA || isMobileWidth);
      }
      if (search.includes('view=quiz') || path === '/quiz' || hash === '#quiz') {
        setShowQuizModal(true);
      }
    };
    window.addEventListener('popstate', handleUrlChange);
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, []);

  const [phoneAlertStatus, setPhoneAlertStatus] = useState('');
  const [phoneAlertUrl, setPhoneAlertUrl] = useState('');
  const [phoneAlertMsg, setPhoneAlertMsg] = useState('');

  // Toggles
  const [tHeat, setTHeat] = useState(true);
  const [tNames, setTNames] = useState(true);
  const [tRoutes, setTRoutes] = useState(true);
  const [tSpread, setTSpread] = useState(false);
  const [tVoice, setTVoice] = useState(true);
  const [tSmoke, setTSmoke] = useState(true);
  const [tacticalMode, setTacticalMode] = useState(false);

  // Tactical Responders & Health Metrics
  const [respondersList, setRespondersList] = useState([]);
  const [triageQueue, setTriageQueue] = useState([]);
  const [rescuedCount, setRescuedCount] = useState(0);
  const [incapacitatedCount, setIncapacitatedCount] = useState(0);
  const [peakSmokePpm, setPeakSmokePpm] = useState(0);

  // People inputs per floor
  const [c0, setC0] = useState(30);
  const [c1, setC1] = useState(30);
  const [c2, setC2] = useState(30);
  const [c3, setC3] = useState(30);
  const [totalInput, setTotalInput] = useState(120);

  // Live Metrics & Output Panels
  const [simTime, setSimTime] = useState(0.0);
  const [estClearance, setEstClearance] = useState('–');
  const [remTotal, setRemTotal] = useState(0);
  const [movingCount, setMovingCount] = useState(0);
  const [waitingCount, setWaitingCount] = useState(0);
  const [evacuatedCount, setEvacuatedCount] = useState(0);
  const [trappedCount, setTrappedCount] = useState(0);
  const [reroutesCount, setReroutesCount] = useState(0);
  const [announcementText, setAnnouncementText] = useState('📢 Announcements will appear here (and be spoken if Voice is on).');
  const [saveMessage, setSaveMessage] = useState('');

  // Fire Alarm & Siren System
  const [fireAlarmActive, setFireAlarmActive] = useState(false);
  const [fireAlarmMuted, setFireAlarmMuted] = useState(false);
  const alarmCtxRef = useRef(null);
  const alarmIntervalRef = useRef(null);

  // Tables & Agents Output
  const [floorStats, setFloorStats] = useState([]);
  const [exitStats, setExitStats] = useState([]);
  const [stairStats, setStairStats] = useState([]);
  const [hotspotsList, setHotspotsList] = useState([]);
  const [peopleList, setPeopleList] = useState([]);
  const [missingAgentReport, setMissingAgentReport] = useState(null);
  const [safeZoneReport, setSafeZoneReport] = useState(null);
  const [possibleRoutes, setPossibleRoutes] = useState([]);
  const [eventLogs, setEventLogs] = useState([]);
  const [annLogs, setAnnLogs] = useState([]);
  const [comparisonResult, setComparisonResult] = useState(null);
  const [isComparing, setIsComparing] = useState(false);

  // Voice Queue
  const annQueueRef = useRef([]);
  const lastBestRef = useRef({});
  const lastBlkRef = useRef({});
  const lastAdvTimeRef = useRef(0);
  const animFrameRef = useRef(null);
  const lastTickTimeRef = useRef(0);
  const frameCountRef = useRef(0);

  const addLog = useCallback((msg) => {
    setEventLogs(prev => [msg, ...prev.slice(0, 49)]);
  }, []);

  const speakAnnouncement = useCallback((msg, urgent = false) => {
    setAnnouncementText('📢 ' + msg);
    setAnnLogs(prev => [`[${simRef.current ? simRef.current.t.toFixed(0) : 0}s] ${msg}`, ...prev.slice(0, 30)]);
    if (!tVoice || !('speechSynthesis' in window)) return;
    if (urgent) {
      annQueueRef.current = [];
      try { window.speechSynthesis.cancel(); } catch (e) {}
      annQueueRef.current.push(msg);
    } else {
      annQueueRef.current.push(msg);
      if (annQueueRef.current.length > 3) annQueueRef.current.splice(0, annQueueRef.current.length - 3);
    }
  }, [tVoice]);

  const pumpVoice = useCallback(() => {
    if ('speechSynthesis' in window && !window.speechSynthesis.speaking && annQueueRef.current.length) {
      try {
        const text = annQueueRef.current.shift();
        if (!text) return;
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.05;
        u.onend = () => {};
        u.onerror = () => { try { window.speechSynthesis.cancel(); } catch (e) {} };
        window.speechSynthesis.speak(u);
      } catch (e) {
        annQueueRef.current = [];
      }
    }
  }, []);

  const handleSendPhoneAlert = useCallback(async (type = 'fire', customFloor = null, auto = false) => {
    try {
      const targetFloorName = customFloor !== null ? (typeof customFloor === 'number' ? FN[customFloor] : customFloor) : (activeFloor < 0 ? 'Ground' : FN[activeFloor]);
      setPhoneAlertStatus(`Automatically dispatching emergency SMS to +91 ${EMERGENCY_PHONE}...`);
      const resp = await fetch('/api/evacuation/send-sms/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: EMERGENCY_PHONE,
          hazard_type: type,
          floor: targetFloorName,
          message: `🚨 AEGIS EMERGENCY EVACUATION NOTICE 🚨\nIncident: ${type.toUpperCase()} active on ${targetFloorName}.\nElevators disabled. Proceed to nearest stairwells S1-S3.\nSafe Exit: Ground Floor.\nLive Mobile Link: ${getMobileAppUrl()}`
        })
      });
      const data = await resp.json();
      if (data.status === 'success') {
        const smsUri = data.sms_uri || `sms:+91${EMERGENCY_PHONE}?body=${encodeURIComponent(data.message)}`;
        setPhoneAlertStatus(`Emergency SMS Dispatched to ${data.phone} (${data.sms_id || 'Carrier Relay'}) ✓`);
        setPhoneAlertUrl(smsUri);
        setPhoneAlertMsg(data.message || '');
        addLog(`✉️ Emergency SMS auto-dispatched to ${data.phone} [${data.sms_id || 'GSM'}] (${type.toUpperCase()})`);
      } else {
        setPhoneAlertStatus(`SMS Error: ${data.message || 'Unknown'}`);
      }
    } catch (err) {
      setPhoneAlertStatus('Failed to send SMS: ' + err.message);
    }
  }, [activeFloor, addLog]);

  // Audio siren synthesizer via Web Audio API (industrial dual-tone 960Hz - 780Hz)
  const playAlarmSirenTone = useCallback(() => {
    if (fireAlarmMuted) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!alarmCtxRef.current) {
        alarmCtxRef.current = new AudioCtx();
      }
      const ctx = alarmCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';

      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(960, now);
      osc.frequency.linearRampToValueAtTime(780, now + 0.18);
      osc.frequency.linearRampToValueAtTime(960, now + 0.36);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.38);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.4);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }, [fireAlarmMuted]);

  useEffect(() => {
    if (fireAlarmActive && !fireAlarmMuted) {
      playAlarmSirenTone();
      const interval = setInterval(playAlarmSirenTone, 450);
      alarmIntervalRef.current = interval;
      return () => clearInterval(interval);
    } else {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
    }
  }, [fireAlarmActive, fireAlarmMuted, playAlarmSirenTone]);

  const triggerFireAlarm = useCallback((floor = 0, x = 0, y = 0) => {
    setFireAlarmActive(true);
    addLog(`🚨 EMERGENCY FIRE ALARM ACTIVATED on ${FN[floor]} (${x},${y})! Dual-tone siren sounding.`);
    speakAnnouncement(`Warning! Emergency fire alarm activated on ${FN[floor]}. Evacuate immediately using emergency exits. Lifts are grounded.`);
    handleSendPhoneAlert('fire', floor, true);
  }, [addLog, speakAnnouncement, handleSendPhoneAlert]);

  const setCell = (f, x, y, v) => { baseRef.current.g[f * FS + y * W + x] = v; };
  const hLine = (f, y, a, b) => { for (let x = a; x <= b; x++) setCell(f, x, y, 1); };
  const vLine = (f, x, a, b) => { for (let y = a; y <= b; y++) setCell(f, x, y, 1); };

  const addExit = (x, y, cap) => {
    setCell(0, x, y, 2);
    baseRef.current.ex = baseRef.current.ex.filter(e => !(e.x === x && e.y === y));
    baseRef.current.ex.push({ x, y, cap, n: y * W + x });
  };

  const addStair = (x, y, cap) => {
    for (let f = 0; f < baseRef.current.nf; f++) setCell(f, x, y, 4);
    baseRef.current.st = baseRef.current.st.filter(s => !(s.x === x && s.y === y));
    baseRef.current.st.push({ x, y, cap });
  };

  const addLift = (x, y) => {
    for (let f = 0; f < baseRef.current.nf; f++) setCell(f, x, y, 5);
  };

  const applyPreset = useCallback((presetKey) => {
    const nf = presetKey === 'office' ? 4 : 3;
    baseRef.current.nf = nf;
    baseRef.current.g.fill(1);
    baseRef.current.ex = [];
    baseRef.current.st = [];
    baseRef.current.pos = [];

    for (let f = 0; f < nf; f++) {
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) setCell(f, x, y, 0);
      }
      if (presetKey === 'office') {
        hLine(f, 10, 0, W - 1);
        hLine(f, 14, 0, W - 1);
        for (const x of [8, 16, 24, 32]) { vLine(f, x, 1, 9); vLine(f, x, 15, 23); }
        for (const x of [4, 12, 20, 28, 36]) { setCell(f, x, 10, 0); setCell(f, x, 14, 0); }
        // Exactly 2 Fire Extinguishers per floor in central hallway/corridor (not inside rooms)
        setCell(f, 10, 12, 8);
        setCell(f, 30, 12, 8);
      } else {
        hLine(f, 7, 0, W - 1);
        hLine(f, 17, 0, W - 1);
        for (const x of [6, 12, 18, 24, 30, 36]) { vLine(f, x, 1, 6); vLine(f, x, 18, 23); }
        for (const x of [3, 9, 15, 21, 27, 33, 38]) { setCell(f, x, 7, 0); setCell(f, x, 17, 0); }
        for (let y = 10; y <= 14; y++) for (let x = 10; x <= 29; x++) setCell(f, x, y, 1);
        // Exactly 2 Fire Extinguishers per floor in central hallway
        setCell(f, 8, 8, 8);
        setCell(f, 32, 8, 8);
      }
    }

    if (presetKey === 'office') {
      addStair(3, 11, 2); addStair(36, 11, 2); addStair(20, 13, 1.5);
      addLift(14, 11); addLift(26, 13);
      addExit(0, 12, 2.5); addExit(W - 1, 12, 2.5); addExit(20, H - 1, 1.5); addExit(20, 0, 1.5);
      setC0(30); setC1(35); setC2(35); setC3(30);
    } else {
      addStair(5, 12, 2); addStair(34, 12, 2); addStair(20, 16, 1.5);
      addLift(20, 8); addLift(2, 9);
      addExit(0, 12, 3); addExit(W - 1, 12, 3); addExit(21, 0, 2); addExit(21, H - 1, 2);
      setC0(45); setC1(45); setC2(40); setC3(0);
    }
  }, []);

  const randomizePeople = useCallback((customCounts = null) => {
    baseRef.current.pos = [];
    const counts = customCounts || [c0, c1, c2, c3];
    for (let f = 0; f < baseRef.current.nf; f++) {
      const cells = [];
      for (let i = 0; i < FS; i++) {
        if (baseRef.current.g[f * FS + i] === 0) cells.push(i);
      }
      const n = Math.min(200, counts[f] || 0);
      for (let k = 0; k < n && cells.length; k++) {
        const c = cells[Math.floor(Math.random() * cells.length)];
        baseRef.current.pos.push([f, c % W, Math.floor(c / W), rname()]);
      }
    }
    resetSim();
    try {
      const payload = {
        name: 'Primary Building Layout',
        layout: {
          nf: baseRef.current.nf,
          g: Array.from(baseRef.current.g),
          ex: baseRef.current.ex,
          st: baseRef.current.st,
        },
        occupants: {
          pos: baseRef.current.pos,
          c: counts
        }
      };
      localStorage.setItem('evac_layout_v2', JSON.stringify(payload));
    } catch (e) {}
  }, [c0, c1, c2, c3]);

  const generateRandomBuilding = useCallback(() => {
    const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const pick = a => a[Math.floor(Math.random() * a.length)];
    baseRef.current.nf = 4;
    baseRef.current.g.fill(1);
    baseRef.current.ex = [];
    baseRef.current.st = [];
    baseRef.current.pos = [];
    setActiveFloor(0);

    const yc = R(10, 14), yt = yc - 2, yb = yc + 2, rooms0 = [];
    for (let f = 0; f < 4; f++) {
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) setCell(f, x, y, 0);
      }
      hLine(f, yt, 0, W - 1);
      hLine(f, yb, 0, W - 1);

      for (const [y0, y1, wy] of [[1, yt - 1, yt], [yb + 1, H - 2, yb]]) {
        const cols = [];
        let x = 1;
        for (;;) {
          x += R(5, 9);
          if (x >= W - 5) break;
          cols.push(x);
        }
        cols.forEach(cx => vLine(f, cx, y0, y1));
        const ed = [0, ...cols, W - 1];
        for (let i = 0; i < ed.length - 1; i++) {
          const a = ed[i] + 1, b = ed[i + 1] - 1;
          if (b < a) continue;
          const dx = R(a, b);
          setCell(f, dx, wy, 0);
          if (b - a >= 6 && Math.random() < 0.6) setCell(f, R(a, b), wy, 0);
          if (i < ed.length - 2 && Math.random() < 0.6) setCell(f, ed[i + 1], R(y0, y1), 0);
          if (f === 0) rooms0.push({ x: dx, top: wy === yt });
        }
      }

      for (let k = 0; k < 30; k++) {
        const s = R(0, 3);
        const x = s < 2 ? R(2, W - 3) : s === 2 ? 0 : W - 1;
        const y = s >= 2 ? R(2, H - 3) : s === 0 ? 0 : H - 1;
        const ix = s < 2 ? x : s === 2 ? 1 : W - 2;
        const iy = s >= 2 ? y : s === 0 ? 1 : H - 2;
        if (baseRef.current.g[f * FS + y * W + x] === 1 && baseRef.current.g[f * FS + iy * W + ix] === 0) {
          setCell(f, x, y, 6);
        }
      }
    }

    [R(2, 8), R(17, 23), R(31, 37)].forEach(x => addStair(x, yc + R(-1, 1), pick([1.5, 2, 2.5])));
    [R(11, 15), R(26, 30)].forEach(x => addLift(x, yc + R(-1, 1)));
    addExit(0, yc, pick([2, 2.5, 3]));
    addExit(W - 1, yc, pick([2, 2.5, 3]));

    const topRoom = rooms0.filter(r => r.top);
    const botRoom = rooms0.filter(r => !r.top);
    if (topRoom.length) addExit(pick(topRoom).x, 0, pick([1.5, 2]));
    if (botRoom.length) addExit(pick(botRoom).x, H - 1, pick([1.5, 2]));

    // Place exactly 2 corridor extinguishers per floor
    for (let f = 0; f < 4; f++) {
      setCell(f, 10, yc, 8);
      setCell(f, 30, yc, 8);
    }

    setC0(R(20, 35)); setC1(R(25, 40)); setC2(R(25, 40)); setC3(R(20, 35));
    randomizePeople();
    addLog('🎲 Procedural building generated with multi-floor links.');
  }, [randomizePeople, addLog]);

  const initSim = useCallback(() => {
    if (!baseRef.current.pos || baseRef.current.pos.length === 0) {
      baseRef.current.pos = [];
      const counts = [c0 || 30, c1 || 35, c2 || 35, c3 || 30];
      for (let f = 0; f < baseRef.current.nf; f++) {
        const cells = [];
        for (let i = 0; i < FS; i++) {
          if (baseRef.current.g[f * FS + i] === 0) cells.push(i);
        }
        const n = Math.min(100, counts[f] || 25);
        for (let k = 0; k < n && cells.length; k++) {
          const c = cells[Math.floor(Math.random() * cells.length)];
          baseRef.current.pos.push([f, c % W, Math.floor(c / W), rname()]);
        }
      }
    }
    const s = new SimEngine(
      baseRef.current.g,
      baseRef.current.ex,
      baseRef.current.st,
      baseRef.current.pos,
      baseRef.current.nf,
      tSpread,
      0.5,
      hazardMode
    );
    s.tSmoke = tSmoke;
    s.log = (m) => {
      addLog(m);
      if (simRunningRef.current) speakAnnouncement(m.replace(/\(\d+,\d+\)/, '').replace('→', '.'));
    };
    s.compute();
    s.assign();
    s.compute();
    simRef.current = s;
  }, [c0, c1, c2, c3, tSpread, tSmoke, hazardMode, addLog, speakAnnouncement]);

  const resetSim = useCallback(() => {
    setSimRunning(false);
    setSimStarted(false);
    setFireAlarmActive(false);
    annQueueRef.current = [];
    try { window.speechSynthesis.cancel(); } catch (e) {}
    lastBestRef.current = {};
    lastBlkRef.current = {};
    fetch('/api/evacuation/clear-alert/', { method: 'POST' }).catch(() => {});
    initSim();
    updateUI(true);
  }, [initSim]);

  const handleToggleSimulation = useCallback(() => {
    if (!simRef.current || simRef.current.ag.length === 0 || simRef.current.finished()) {
      initSim();
    }
    const nextRunning = !simRunning;
    setSimStarted(true);
    setSimRunning(nextRunning);
    simRunningRef.current = nextRunning;
    if (nextRunning) {
      lastTickTimeRef.current = performance.now();
      speakAnnouncement(
        (hazardMode === 'flood' ? 'Flood alert! Proceed immediately to upper floor refuge.' : 'Evacuation initiated. Lifts disabled, use staircases.') + ' Guided routes engaged.',
        true
      );
      setTimeout(() => {
        handleSendPhoneAlert(hazardMode, activeFloor < 0 ? 0 : activeFloor, true);
      }, 50);
    }
  }, [simRunning, hazardMode, activeFloor, handleSendPhoneAlert, speakAnnouncement, initSim]);

  useEffect(() => {
    if (initialRestoredRef.current) return;
    initialRestoredRef.current = true;

    // Synchronous baseline layout & occupants initialization so canvas is never blank on frame 0
    applyPreset('office');
    randomizePeople([30, 35, 35, 30]);

    // Purge deprecated v1 cache
    try { localStorage.removeItem('evac_layout_v1'); } catch (e) {}

    let layoutRestored = false;
    try {
      const localStr = localStorage.getItem('evac_layout_v2');
      if (localStr) {
        const parsed = JSON.parse(localStr);
        // Ensure grid is complete 4-floor 4000-cell array
        if (parsed && parsed.layout && Array.isArray(parsed.layout.g) && parsed.layout.g.length === 4000) {
          const isCorruptedTest = parsed.occupants?.c && parsed.occupants.c.every(x => x === 10);
          // Check for inverted walls bug: wall at x=10 but open at y=10
          const isInverted = parsed.layout.g[10] === 1 && parsed.layout.g[10 * W + 1] === 0;
          if (!isCorruptedTest && !isInverted) {
            baseRef.current.g.set(parsed.layout.g);
            baseRef.current.nf = parsed.layout.nf || 4;
            baseRef.current.ex = parsed.layout.ex || [];
            baseRef.current.st = parsed.layout.st || [];
            baseRef.current.pos = parsed.occupants?.pos || [];
            if (parsed.occupants?.c) {
              setC0(parsed.occupants.c[0] ?? 30);
              setC1(parsed.occupants.c[1] ?? 35);
              setC2(parsed.occupants.c[2] ?? 35);
              setC3(parsed.occupants.c[3] ?? 30);
            }
            layoutRestored = true;
            resetSim();
            addLog('Restored saved building layout structure from storage.');
          } else {
            localStorage.removeItem('evac_layout_v2');
          }
        }
      }
    } catch (e) {}

    // Check backend Django database if localStorage wasn't found or to sync latest
    fetch('/api/evacuation/load/')
      .then(r => r.json())
      .then(res => {
        if (res.status === 'success' && res.layout && Array.isArray(res.layout.g) && res.layout.g.length === 4000) {
          const isCorruptedTest = res.occupants?.c && res.occupants.c.every(x => x === 10);
          const isInverted = res.layout.g[10] === 1 && res.layout.g[10 * W + 1] === 0;
          if (!isCorruptedTest && !isInverted) {
            baseRef.current.g.set(res.layout.g);
            baseRef.current.nf = res.layout.nf || 4;
            baseRef.current.ex = res.layout.ex || [];
            baseRef.current.st = res.layout.st || [];
            baseRef.current.pos = res.occupants?.pos || [];
            if (res.occupants?.c) {
              setC0(res.occupants.c[0] ?? 30);
              setC1(res.occupants.c[1] ?? 35);
              setC2(res.occupants.c[2] ?? 35);
              setC3(res.occupants.c[3] ?? 30);
            }
            // Ensure 2 extinguishers per floor in corridor if not present
            let hasExt = false;
            for (let idx = 0; idx < 4000; idx++) {
              if (baseRef.current.g[idx] === 8) { hasExt = true; break; }
            }
            if (!hasExt) {
              for (let f = 0; f < baseRef.current.nf; f++) {
                baseRef.current.g[f * FS + 12 * W + 10] = 8;
                baseRef.current.g[f * FS + 12 * W + 30] = 8;
              }
            }
            resetSim();
            addLog('Loaded saved blueprint from Django database.');
            return;
          }
        }
        if (!layoutRestored) {
          applyPreset('office');
          randomizePeople([30, 35, 35, 30]);
          addLog('System initialized: 4-Floor Mission Architecture loaded.');
        }
      })
      .catch(() => {
        if (!layoutRestored) {
          applyPreset('office');
          randomizePeople([30, 35, 35, 30]);
          addLog('System initialized: 4-Floor Mission Architecture loaded.');
        }
      });
  }, [applyPreset, randomizePeople, addLog, resetSim]);

  const handleSaveLayout = async () => {
    try {
      const payload = {
        name: 'Primary Building Layout',
        layout: {
          nf: baseRef.current.nf,
          g: Array.from(baseRef.current.g),
          ex: baseRef.current.ex,
          st: baseRef.current.st,
        },
        occupants: {
          pos: baseRef.current.pos,
          c: [c0, c1, c2, c3]
        }
      };

      localStorage.setItem('evac_layout_v2', JSON.stringify(payload));
      await fetch('/api/evacuation/save/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const msg = `Floor Structure Saved ✓ (${baseRef.current.nf} floors · ${baseRef.current.st.length} stairs · ${baseRef.current.ex.length} exits)`;
      setSaveMessage(msg);
      addLog(msg);
      setTimeout(() => setSaveMessage(''), 5000);
    } catch (err) {
      setSaveMessage('Save failed: ' + err.message);
    }
  };

  const handleLoadSavedLayout = async () => {
    try {
      let data = null;
      try {
        const resp = await fetch('/api/evacuation/load/');
        if (resp.ok) {
          const res = await resp.json();
          if (res.status === 'success' && res.layout && Array.isArray(res.layout.g) && res.layout.g.length === 4000) {
            data = { layout: res.layout, occupants: res.occupants };
          }
        }
      } catch (e) {}

      if (!data) data = JSON.parse(localStorage.getItem('evac_layout_v2') || 'null');
      if (!data || !data.layout || !Array.isArray(data.layout.g) || data.layout.g.length !== 4000) {
        setSaveMessage('No valid saved layout found.');
        return;
      }

      baseRef.current.g.set(data.layout.g);
      baseRef.current.nf = data.layout.nf;
      baseRef.current.ex = data.layout.ex;
      baseRef.current.st = data.layout.st;
      baseRef.current.pos = data.occupants.pos || [];

      if (data.occupants.c) {
        setC0(data.occupants.c[0] || 30);
        setC1(data.occupants.c[1] || 30);
        setC2(data.occupants.c[2] || 30);
        setC3(data.occupants.c[3] || 30);
      }

      setActiveFloor(0);
      resetSim();
      setSaveMessage('Saved blueprint loaded from Django DB ✓');
      addLog('Loaded saved blueprint from Django database.');
      setTimeout(() => setSaveMessage(''), 5000);
    } catch (err) {
      setSaveMessage('Load failed: ' + err.message);
    }
  };

  const handleFloorCountChange = (floorIdx, rawVal) => {
    const val = Math.max(0, Math.min(200, parseInt(rawVal, 10) || 0));
    const counts = [c0, c1, c2, c3];
    counts[floorIdx] = val;
    if (floorIdx === 0) setC0(val);
    else if (floorIdx === 1) setC1(val);
    else if (floorIdx === 2) setC2(val);
    else if (floorIdx === 3) setC3(val);
    randomizePeople(counts);
  };

  const handleSplitTotal = (total) => {
    const n = baseRef.current.nf || 4;
    const each = Math.floor(total / n);
    const rem = total % n;
    const counts = [
      each + (rem > 0 ? 1 : 0),
      each + (rem > 1 ? 1 : 0),
      each + (rem > 2 ? 1 : 0),
      n === 4 ? each : 0
    ];
    setC0(counts[0]);
    setC1(counts[1]);
    setC2(counts[2]);
    setC3(counts[3]);
    randomizePeople(counts);
  };

  const handleRandomizePeople = () => {
    randomizePeople([c0, c1, c2, c3]);
  };

  const handleClearPeople = () => {
    baseRef.current.pos = [];
    setC0(0);
    setC1(0);
    setC2(0);
    setC3(0);
    resetSim();
    try {
      const payload = {
        name: 'Primary Building Layout',
        layout: {
          nf: baseRef.current.nf,
          g: Array.from(baseRef.current.g),
          ex: baseRef.current.ex,
          st: baseRef.current.st,
        },
        occupants: {
          pos: [],
          c: [0, 0, 0, 0]
        }
      };
      localStorage.setItem('evac_layout_v2', JSON.stringify(payload));
    } catch (e) {}
  };

  const runAIAgents = (s, announce) => {
    const now = s.t;
    const rem = s.ag.filter(a => a.st !== 'out');

    const tagged = [];
    for (const a of rem) {
      if (a.st === 'waiting') {
        if (a.ws === undefined) a.ws = now;
      } else a.ws = undefined;

      const c = s.nd(a);
      const reach = s.d.some(d => d[c] < Infinity);
      const w = a.ws === undefined ? 0 : now - a.ws;

      let nearHazard = -1;
      for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
          const nx = a.x + dx, ny = a.y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const v = s.g[a.f * FS + ny * W + nx];
          if (v === 3 || v === 7) {
            const dist = Math.max(Math.abs(dx), Math.abs(dy));
            if (nearHazard < 0 || dist < nearHazard) nearHazard = dist;
          }
        }
      }

      let risk = 0, why = 'in transit';
      if (!reach) { risk = 3; why = 'no route to exit (trapped)'; }
      else if (nearHazard >= 0 && nearHazard <= 2) { risk = 3; why = nearHazard ? `hazard ${nearHazard} cells away` : 'standing in hazard'; }
      else if (w >= 20) { risk = 2; why = `stalled ${w.toFixed(0)}s`; }
      else if (nearHazard >= 0) { risk = 1; why = 'near hazard'; }

      tagged.push({ a, risk, why, w });
    }

    tagged.sort((p, q) => q.risk - p.risk || q.w - p.w);
    const hi = tagged.filter(r => r.risk >= 3);
    const med = tagged.filter(r => r.risk === 2).length;

    setMissingAgentReport({
      total: s.n,
      done: s.done,
      remaining: rem.length,
      highRisk: hi.length,
      stalled: med,
      flagged: tagged.filter(r => r.risk > 0).slice(0, 6)
    });

    if (announce && hi.length > 0 && Math.random() < 0.15) {
      speakAnnouncement(`Missing person alert. ${hi.length} people may be trapped on Floor ${hi[0].a.f}. Rescue priority assigned.`);
    }

    const zones = [];
    s.ex.forEach((e, i) => {
      let name, st = 0;
      const notes = [];
      const reachN = rem.filter(a => s.d[i] && s.d[i][s.nd(a)] < Infinity).length;

      if (e.refuge) {
        const top = (s.nf - 1) * FS;
        let dry = 0, tot = 0, haz = 0;
        for (let r = 0; r < FS; r++) {
          const v = s.g[top + r];
          if (v === 1 || v === 5 || v === 6) continue;
          tot++;
          if (v === 3 || v === 7) haz++;
          else dry++;
        }
        const cap = dry * 2;
        name = `Refuge · ${FN[s.nf - 1]}`;
        if (!dry || dry < tot * 0.5) { st = 2; notes.push(`only ${dry}/${tot} cells dry`); }
        else if (haz) { st = 1; notes.push(`${haz} flooded/burning cells`); }
        else notes.push('fully dry');
        if (e.used > cap * 0.8) { st = Math.max(st, 1); notes.push(`crowded ${e.used}/${cap}`); }
        else notes.push(`${e.used} sheltering (cap ~${cap})`);
      } else {
        name = `Exit ${String.fromCharCode(65 + i)}`;
        const q = e.load / e.cap;
        const isExitCompromised = s.blocked(e.n) || s.isNearFire(e.n, 3) || (s.d[i] && s.d[i][e.n] >= 500);
        if (isExitCompromised) { st = 2; notes.push('blocked / path compromised by fire'); }
        else {
          if (q > 60) { st = Math.max(st, 1); notes.push(`queue ~${q.toFixed(0)}s`); }
          if (!notes.length) notes.push('clear flow');
        }
      }

      if (rem.length && !reachN) { st = 2; notes.push('unreachable'); }
      else if (rem.length) notes.push(`${reachN}/${rem.length} can reach`);

      zones.push({ name, st, notes });
    });

    const recommended = zones.find(z => z.st === 0) || zones.find(z => z.st === 1);
    setSafeZoneReport({
      zones,
      recommendation: recommended ? 'Guide evacuees to ' + recommended.name : 'No verified safe zone — shelter in place and await extraction'
    });
  };

  const computePossibleRoutes = (s, announce) => {
    const rows = [];
    const msgs = [];
    const newBlk = [];

    const bfsHops = (f, x, y) => {
      const h = new Float32Array(FS).fill(Infinity);
      const o = f * FS, q = [y * W + x];
      if (s.blocked(o + q[0])) return h;
      h[q[0]] = 0;
      for (let i = 0; i < q.length; i++) {
        const c = q[i], cx = c % W;
        for (const n of [cx > 0 ? c - 1 : -1, cx < W - 1 ? c + 1 : -1, c >= W ? c - W : -1, c < FS - W ? c + W : -1]) {
          if (n < 0 || h[n] < Infinity || s.blocked(o + n)) continue;
          h[n] = h[c] + 1;
          q.push(n);
        }
      }
      return h;
    };

    for (let f = 0; f < baseRef.current.nf; f++) {
      const ag = s.ag.filter(a => a.st !== 'out' && a.f === f);
      const ways = [];

      if (f === 0 && !s.flood) {
        s.ex.forEach((e, i) => {
          let sum = 0, k = 0, n = 0;
          for (const a of ag) {
            const v = s.d[i] ? s.d[i][s.nd(a)] : Infinity;
            if (v < Infinity) { sum += v; k++; }
            if (a.ex === i) n++;
          }
          const bl = s.blocked(e.n) || (ag.length > 0 && k === 0);
          ways.push({
            id: 'E' + i,
            name: 'Exit ' + String.fromCharCode(65 + i),
            eta: k ? sum / k / SP : bl ? null : 0,
            n,
            blocked: bl
          });
        });
      } else {
        const via = s.st.map(q => {
          const nd = f * FS + q.y * W + q.x;
          let m = Infinity;
          s.d.forEach(d => { if (d[nd] < m) m = d[nd]; });
          return m;
        });
        const hops = ag.length ? s.st.map(q => bfsHops(f, q.x, q.y)) : [];
        const acc = s.st.map(() => ({ sum: 0, k: 0, n: 0 }));

        for (const a of ag) {
          const r = a.y * W + a.x;
          let bi = -1, bv = Infinity;
          s.st.forEach((q, i) => {
            const v = hops[i][r] + via[i];
            if (v < Infinity) {
              acc[i].sum += v;
              acc[i].k++;
              if (v < bv) { bv = v; bi = i; }
            }
          });
          if (bi >= 0) acc[bi].n++;
        }

        s.st.forEach((q, i) => {
          const bl = via[i] === Infinity || (ag.length > 0 && acc[i].k === 0);
          ways.push({
            id: 'S' + i,
            name: `Stair S${i + 1}`,
            eta: acc[i].k ? acc[i].sum / acc[i].k / SP : bl ? null : via[i] / SP,
            n: acc[i].n,
            blocked: bl
          });
        });
      }

      ways.sort((a, b) => a.blocked - b.blocked || ((a.eta ?? 1e9) - (b.eta ?? 1e9)));
      rows.push({ f, ways, rem: ag.length });

      for (const w of ways) {
        const k = f + w.id;
        if (announce && lastBlkRef.current[k] === false && w.blocked && ag.length) newBlk.push(w.name);
        lastBlkRef.current[k] = w.blocked;
      }

      if (ag.length) {
        const top = ways.find(w => !w.blocked);
        let key = top ? top.id : 'none';
        const prev = ways.find(w => w.id === lastBestRef.current[f]);
        if (prev && !prev.blocked && top && prev.eta !== null && top.eta !== null && prev.eta - top.eta < 8) {
          key = prev.id;
        }
        if (announce && lastBestRef.current[f] !== undefined && lastBestRef.current[f] !== key) {
          const kw = ways.find(w => w.id === key);
          msgs.push(kw ? `${FN[f]}: re-routing, use ${kw.name.replace('Stair', 'staircase')}. Follow alternative evacuation paths.` : `${FN[f]}: no safe route. Stay calm and wait for rescue.`);
        }
        lastBestRef.current[f] = key;
      }
    }

    if (newBlk.length) msgs.unshift(`Warning. ${[...new Set(newBlk)].join(' and ')} blocked.`);
    if (msgs.length) speakAnnouncement(msgs.join(' '), true);

    setPossibleRoutes(rows);
  };

  const updateUI = useCallback((force = false) => {
    const s = simRef.current;
    if (!s) return;

    let mv = 0, wt = 0;
    for (const a of s.ag) {
      if (a.st === 'moving') mv++;
      else if (a.st === 'waiting') wt++;
    }

    setSimTime(s.t);
    setEstClearance(s.trapped && s.n - s.done === s.trapped ? '∞ (trapped)' : (s.t + s.est).toFixed(1) + ' s');
    setRemTotal(s.n - s.done);
    setMovingCount(mv);
    setWaitingCount(wt);
    setEvacuatedCount(s.done);
    setTrappedCount(s.trapped);
    setReroutesCount(s.rer);
    setRespondersList(s.responders ? [...s.responders] : []);
    setRescuedCount(s.rescuedCount || 0);

    let inc = 0;
    for (const a of s.ag) if (a.incapacitated) inc++;
    setIncapacitatedCount(inc);

    let mxSmoke = 0;
    if (s.smoke) {
      for (let i = 0; i < s.smoke.length; i++) {
        if (s.smoke[i] > mxSmoke) mxSmoke = s.smoke[i];
      }
    }
    setPeakSmokePpm(Math.round(mxSmoke * 800));

    if (force || frameCountRef.current % 10 === 0) {
      // Build Triage Queue
      const triage = s.ag
        .filter(a => a.st !== 'out' && (a.incapacitated || a.st === 'waiting' || (s.smoke && s.smoke[s.nd(a)] > 0.25) || (s.d[a.ex] && s.d[a.ex][s.nd(a)] === Infinity)))
        .map(a => {
          const sm = s.smoke ? s.smoke[s.nd(a)] : 0;
          const urg = Math.round((a.incapacitated ? 140 : 0) + (100 - (a.health || 100)) * 1.5 + sm * 60 + a.f * 10);
          return {
            id: a.name,
            name: a.name,
            floor: FN[a.f],
            f: a.f,
            x: a.x,
            y: a.y,
            health: Math.round(a.health || 100),
            smokePct: Math.round(sm * 100),
            status: a.incapacitated ? 'Incapacitated (Toxic Smoke)' : (a.rescuedBy ? `Escorted by ${a.rescuedBy}` : (a.st === 'waiting' ? 'Cut Off / Trapped' : 'At Risk')),
            urgency: urg,
            rescuedBy: a.rescuedBy
          };
        })
        .sort((a, b) => b.urgency - a.urgency);
      setTriageQueue(triage.slice(0, 15));

      const T = Math.max(s.t, 1);
      const all = [];
      for (let i = 0; i < F * FS; i++) if (s.heat[i] > 0) all.push([s.heat[i], i]);
      all.sort((a, b) => b[0] - a[0]);

      const hot = [];
      const addH = (q, label) => {
        if (!q) return;
        const i = q[1], r = i % FS;
        hot.push({ f: Math.floor(i / FS), x: r % W, y: Math.floor(r / W), h: q[0], label });
      };

      addH(all.find(q => s.g[q[1]] === 4), 'stairwell');
      addH(all.find(q => s.g[q[1]] === 2), 'exit');
      for (const q of all) {
        if (s.g[q[1]] === 4 || s.g[q[1]] === 2) continue;
        const f = Math.floor(q[1] / FS), r = q[1] % FS, x = r % W, y = Math.floor(r / W);
        if (hot.every(o => o.f !== f || Math.hypot(o.x - x, o.y - y) > 4)) addH(q, 'corridor/room');
        if (hot.length >= 5) break;
      }
      setHotspotsList(hot.map(o => ({ ...o, avg: (o.h / T).toFixed(2) })));

      setExitStats(s.ex.map((e, i) => ({
        name: e.refuge ? 'Refuge: ' + FN[s.nf - 1] + ' (safe)' : String.fromCharCode(65 + i) + ' (' + e.x + ',' + e.y + ')' + (s.g[e.n] === 3 ? ' 🔥' : ''),
        cap: e.refuge ? '–' : e.cap + '/s',
        used: e.used,
        queue: e.load
      })));

      const on = s.st.map(() => 0);
      for (const a of s.ag) {
        if (a.st !== 'out' && s.g[s.nd(a)] === 4) {
          const k = s.st.findIndex(q => q.x === a.x && q.y === a.y);
          if (k >= 0) on[k]++;
        }
      }
      setStairStats(s.st.map((q, i) => {
        const bl = s.g[q.y * W + q.x] === 3 || [1, 2, 3].some(f => s.g[f * FS + q.y * W + q.x] === 3);
        return {
          name: `S${i + 1} (${q.x},${q.y})${bl ? ' 🔥' : ''}`,
          cap: q.cap + '/s',
          used: q.used,
          onNow: on[i]
        };
      }));

      const fRows = [];
      for (let f = 0; f < baseRef.current.nf; f++) {
        fRows.push({
          name: FN[f],
          color: FC[f],
          start: s.n0[f],
          left: s.fc[f],
          clearance: s.fd[f] !== null ? (s.fd[f] ? s.fd[f].toFixed(0) + 's ✓' : '–') : '~' + (s.t + s.fe[f]).toFixed(0) + 's'
        });
      }
      setFloorStats(fRows);

      const pRows = s.ag.filter(a => a.st !== 'out');
      pRows.sort((a, b) => (a.st === 'waiting' ? 0 : 1) - (b.st === 'waiting' ? 0 : 1) || a.f - b.f);
      setPeopleList(pRows.slice(0, 30));

    }

    renderChart();
  }, [computePossibleRoutes, runAIAgents]);

  const drawCanvas = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const s = simRef.current;
    if (!s) return;

    if (activeFloor < 0) {
      // 3D Isometric View
      const COL = { 1: '#1e293b', 2: '#16a34a', 3: '#ef4444', 4: '#3b82f6', 5: '#94a3b8', 6: '#7dd3fc', 7: '#0ea5e9', 8: '#dc2626' };
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);

      let mx = 0;
      for (const h of s.heat) if (h > mx) mx = h;
      const heat = tHeat && mx > 0;

      for (let f = 0; f < baseRef.current.nf; f++) {
        ctx.setTransform(P3.sx, 0, P3.kx, P3.sy, P3.ex, fy3(f, baseRef.current.nf));
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, W, H);

        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = f * FS + y * W + x, v = s.g[i];
            if (v === 3) {
              ctx.fillStyle = '#dc2626'; // Vibrant Red Fire
              ctx.fillRect(x, y, 1, 1);
            } else if (v) {
              ctx.fillStyle = COL[v];
              ctx.fillRect(x, y, 1, 1);
            } else {
              ctx.fillStyle = '#1e293b';
              ctx.fillRect(x, y, 1, 1);
            }
            if (heat && s.heat[i] / mx > 0.04) {
              ctx.fillStyle = `rgba(239,68,68,${Math.min(0.75, (s.heat[i] / mx) * 0.9)})`;
              ctx.fillRect(x, y, 1, 1);
            }
            if (v !== 3 && tSmoke && s.smoke && s.smoke[i] > 0.05) {
              ctx.fillStyle = `rgba(15, 23, 42, ${Math.min(0.85, s.smoke[i] * 0.85)})`;
              ctx.fillRect(x, y, 1, 1);
            }
          }
        }
        ctx.lineWidth = 0.2;
        ctx.strokeStyle = '#38bdf8';
        ctx.strokeRect(0, 0, W, H);
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.textAlign = 'left';
      ctx.font = 'bold 12px system-ui';
      ctx.fillStyle = '#94a3b8';
      for (let f = 0; f < baseRef.current.nf; f++) {
        ctx.fillText(`${FN[f]} · ${s.fc[f]} left`, 6, fy3(f, baseRef.current.nf) + 34);
      }

      // Vertical stair shafts
      s.st.forEach((q, i) => {
        for (let f = 0; f < baseRef.current.nf - 1; f++) {
          const a = f * FS + q.y * W + q.x, ga = s.g[a], gb = s.g[a + FS], bad = ga === 3 || gb === 3;
          if ((ga === 4 || ga === 3) && (gb === 4 || gb === 3)) {
            const A = p3(f, q.x + 0.5, q.y + 0.5, baseRef.current.nf);
            const B = p3(f + 1, q.x + 0.5, q.y + 0.5, baseRef.current.nf);
            ctx.strokeStyle = bad ? '#ef4444' : '#38bdf8';
            ctx.lineWidth = 3;
            ctx.setLineDash(bad ? [4, 3] : []);
            ctx.beginPath();
            ctx.moveTo(A[0], A[1]);
            ctx.lineTo(B[0], B[1]);
            ctx.stroke();
          }
        }
        const T = p3(baseRef.current.nf - 1, q.x + 0.5, q.y + 0.5, baseRef.current.nf);
        ctx.setLineDash([]);
        ctx.fillStyle = '#60a5fa';
        ctx.font = 'bold 10px system-ui';
        ctx.fillText('S' + (i + 1) + ' ' + q.cap + '/s', T[0] + 5, T[1] - 3);
      });

      // Lifts
      for (let r = 0; r < FS; r++) {
        if (s.g[r] === 5) {
          const x = r % W, y = Math.floor(r / W);
          const A = p3(0, x + 0.5, y + 0.5, baseRef.current.nf);
          const B = p3(baseRef.current.nf - 1, x + 0.5, y + 0.5, baseRef.current.nf);
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(A[0], A[1]);
          ctx.lineTo(B[0], B[1]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#ef4444';
          ctx.font = 'bold 11px system-ui';
          for (let f = 0; f < baseRef.current.nf; f++) {
            const P = p3(f, x + 0.5, y + 0.5, baseRef.current.nf);
            ctx.fillText('✕', P[0] - 4, P[1] + 4);
          }
        }
      }

      // Exits
      s.ex.forEach((e, i) => {
        if (e.refuge) return;
        const P = p3(0, e.x + 0.5, e.y + 0.5, baseRef.current.nf);
        ctx.fillStyle = '#34d399';
        ctx.font = 'bold 10px system-ui';
        ctx.fillText(`${String.fromCharCode(65 + i)} ${e.cap}/s`, P[0] - 14, P[1] - 8);
      });

      // Extinguishers in 3D
      for (let f = 0; f < baseRef.current.nf; f++) {
        for (let r = 0; r < FS; r++) {
          if (s.g[f * FS + r] === 8) {
            const ex = r % W, ey = Math.floor(r / W);
            const P = p3(f, ex + 0.5, ey + 0.5, baseRef.current.nf);
            ctx.fillStyle = '#ef4444';
            ctx.font = '10px system-ui';
            ctx.fillText('🧯', P[0] - 6, P[1] - 4);
          }
        }
      }

      // Automatic Overhead Water Sprinklers in 3D (Strictly localized over active fire cells)
      for (let f = 0; f < baseRef.current.nf; f++) {
        for (let r = 0; r < FS; r++) {
          if (s.g[f * FS + r] === 3) {
            const fx = r % W, fy = Math.floor(r / W);
            // Localized water streams deluging fire cell and immediate vicinity
            for (let d = 0; d < 3; d++) {
              const ox = fx + (Math.sin(s.t * 12 + d * 2) * 0.8);
              const oy = fy + (Math.cos(s.t * 12 + d * 2) * 0.8);
              const P = p3(f, ox + 0.5, oy + 0.5, baseRef.current.nf);
              ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(P[0], P[1] - 16);
              ctx.lineTo(P[0], P[1]);
              ctx.stroke();

              // Splash ripple on the floor directly on the fire
              ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
              ctx.lineWidth = 1.0;
              ctx.beginPath();
              ctx.arc(P[0], P[1], 3 + (d * 2), 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }
      }

      // Occupants in 3D
      for (const a of s.ag) {
        if (a.st === 'out') continue;
        const P = p3(a.f, a.x + 0.5 + a.j[0] * 0.5, a.y + 0.5 + a.j[1] * 0.5, baseRef.current.nf);
        if (a.incapacitated) {
          ctx.fillStyle = '#dc2626';
          ctx.beginPath();
          ctx.arc(P[0], P[1], 4.2, 0, Math.PI * 2);
          ctx.fill();
        } else if (a.rescuedBy) {
          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.arc(P[0], P[1], 3.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = a.st === 'waiting' ? '#f59e0b' : '#38bdf8';
          ctx.beginPath();
          ctx.arc(P[0], P[1], 2.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Tactical First Responders in 3D
      if (s.responders && s.responders.length) {
        for (const r of s.responders) {
          const P = p3(r.f, r.x + 0.5, r.y + 0.5, baseRef.current.nf);
          // Glowing halo
          ctx.fillStyle = 'rgba(234, 179, 8, 0.45)';
          ctx.beginPath();
          ctx.arc(P[0], P[1], 7.5, 0, Math.PI * 2);
          ctx.fill();

          // Squad body
          ctx.fillStyle = '#eab308';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(P[0], P[1], 4.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#fef08a';
          ctx.font = 'bold 8px system-ui';
          ctx.fillText(r.id, P[0] - 6, P[1] - 6);

          // Inbound guide laser line to victim
          if (r.targetAgent && r.targetAgent.st !== 'out') {
            const tP = p3(r.targetAgent.f, r.targetAgent.x + 0.5, r.targetAgent.y + 0.5, baseRef.current.nf);
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 1.6;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(P[0], P[1]);
            ctx.lineTo(tP[0], tP[1]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
      return;
    }

    // 2D Single Floor
    const o = activeFloor * FS;
    const COL = { 1: '#0f172a', 2: '#16a34a', 3: '#ef4444', 4: '#2563eb', 5: '#475569', 6: '#7dd3fc', 7: '#0ea5e9', 8: '#dc2626' };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = s.g[o + y * W + x];
        if (v) {
          ctx.fillStyle = COL[v];
          ctx.fillRect(x * CS, y * CS, CS, CS);
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x * CS, y * CS, CS, CS);
          ctx.strokeStyle = 'rgba(100,116,139,.12)';
          ctx.strokeRect(x * CS + 0.5, y * CS + 0.5, CS, CS);
        }
        if (v === 1) {
          // Overhead Water Sprinkler Piping along Wall Tops
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(x * CS + 1, y * CS + 2);
          ctx.lineTo(x * CS + CS - 1, y * CS + 2);
          ctx.stroke();

          // Brass nozzle heads placed periodically along walls
          if ((x % 3 === 0 && y % 2 === 0) || (x % 4 === 0 && y % 3 === 0)) {
            const nx = x * CS + 10;
            const ny = y * CS + 4;
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(nx, ny, 2.2, 0, Math.PI * 2);
            ctx.fill();

            // Localized thermal activation: ONLY spray if fire is in this immediate room / zone (within 3.5 cells)
            let isNearFire = false;
            for (let dx = -3; dx <= 3; dx++) {
              for (let dy = -3; dy <= 3; dy++) {
                const fx = x + dx, fy = y + dy;
                if (fx >= 0 && fx < W && fy >= 0 && fy < H) {
                  if (s.g[o + fy * W + fx] === 3) {
                    isNearFire = true;
                    break;
                  }
                }
              }
              if (isNearFire) break;
            }

            // Only heads near fire discharge water
            if (isNearFire) {
              const grad = ctx.createRadialGradient(nx, ny, 2, nx, ny, 24);
              grad.addColorStop(0, 'rgba(56, 189, 248, 0.7)');
              grad.addColorStop(0.5, 'rgba(14, 165, 233, 0.35)');
              grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
              ctx.fillStyle = grad;
              ctx.beginPath();
              ctx.arc(nx, ny, 22 + Math.sin(s.t * 8 + x) * 3, 0, Math.PI * 2);
              ctx.fill();

              ctx.fillStyle = '#38bdf8';
              for (let p = 0; p < 4; p++) {
                const ang = ((s.t * 6 + p * 1.57 + x) % (Math.PI * 2));
                const dist = 5 + ((s.t * 18 + p * 5 + y) % 18);
                ctx.fillRect(nx + Math.cos(ang) * dist - 1, ny + Math.sin(ang) * dist - 1, 2, 2);
              }

              const rippleR = ((s.t * 12 + x * 3 + y * 5) % 18) + 3;
              ctx.strokeStyle = `rgba(56, 189, 248, ${Math.max(0, 0.55 - rippleR / 22)})`;
              ctx.lineWidth = 1.0;
              ctx.beginPath();
              ctx.arc(nx, ny + 8, rippleR, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }
        if (v === 3) {
          // Radiant Red Fire Cell
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(x * CS, y * CS, CS, CS);
          const pulse = Math.sin(s.t * 8 + x * 2 + y * 3) * 0.15;
          ctx.fillStyle = `rgba(239, 68, 68, ${0.85 + pulse})`;
          ctx.fillRect(x * CS + 1, y * CS + 1, CS - 2, CS - 2);
          ctx.strokeStyle = '#f87171';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x * CS + 1, y * CS + 1, CS - 2, CS - 2);
          ctx.font = 'bold 11px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText('🔥', x * CS + 10, y * CS + 14);
        }
        if (v === 8) {
          ctx.fillStyle = '#fee2e2';
          ctx.fillRect(x * CS + 1, y * CS + 1, CS - 2, CS - 2);
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x * CS + 2, y * CS + 2, CS - 4, CS - 4);
          ctx.font = '12px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText('🧯', x * CS + 10, y * CS + 15);
          ctx.lineWidth = 1;
        }
        if (v === 5) {
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x * CS + 4, y * CS + 4);
          ctx.lineTo(x * CS + 16, y * CS + 16);
          ctx.moveTo(x * CS + 16, y * CS + 4);
          ctx.lineTo(x * CS + 4, y * CS + 16);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
      }
    }

    if (tHeat) {
      let mx = 0;
      for (const h of s.heat) if (h > mx) mx = h;
      if (mx > 0) {
        for (let i = 0; i < FS; i++) {
          const a = s.heat[o + i] / mx;
          if (a > 0.04) {
            ctx.fillStyle = `rgba(239,68,68,${Math.min(0.75, a * 0.9)})`;
            ctx.fillRect((i % W) * CS, Math.floor(i / W) * CS, CS, CS);
          }
        }
      }
    }

    // 2D Volumetric Smoke Fog
    if (tSmoke && s.smoke) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const idx = o + y * W + x;
          // Do NOT paint black smoke over active fire cells - keep them glowing red!
          if (s.g[idx] === 3) continue;
          const sm = s.smoke[idx];
          if (sm > 0.05) {
            ctx.fillStyle = `rgba(15, 23, 42, ${Math.min(0.85, sm * 0.85)})`;
            ctx.fillRect(x * CS, y * CS, CS, CS);
          }
        }
      }
    }

    // High-Visibility Active Fire Hazard Area (Glows vibrant red on top of smoke)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = o + y * W + x;
        if (s.g[idx] === 3) {
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

    if (tRoutes) {
      ctx.strokeStyle = 'rgba(37,99,235,.35)';
      ctx.fillStyle = 'rgba(37,99,235,.75)';
      ctx.lineWidth = 1.2;
      s.ag.forEach((a, k) => {
        if (k % 3 || a.st === 'out' || a.ex < 0 || a.f !== activeFloor || !s.d[a.ex]) return;
        const d = s.d[a.ex];
        let c = s.nd(a);
        ctx.beginPath();
        ctx.moveTo(a.x * CS + 10, a.y * CS + 10);
        const visitedPath = new Set([c]);
        for (let n = 0; n < 80 && d[c] > 0 && d[c] < Infinity; n++) {
          let bd = d[c], b = -1;
          for (const q of s.nbrs(c)) {
            if (d[q] < bd && !visitedPath.has(q)) { bd = d[q]; b = q; }
          }
          if (b < 0) break;
          visitedPath.add(b);
          if (Math.floor(b / FS) !== activeFloor) {
            ctx.stroke();
            ctx.fillStyle = '#2563eb';
            ctx.beginPath();
            ctx.arc((b % W) * CS + 10, (Math.floor((b % FS) / W)) * CS + 10, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(37,99,235,.75)';
            ctx.beginPath();
            break;
          }
          c = b;
          ctx.lineTo((c % W) * CS + 10, (Math.floor((c % FS) / W)) * CS + 10);
        }
        ctx.stroke();
      });
      ctx.lineWidth = 1;
    }

    // Occupants in 2D
    for (const a of s.ag) {
      if (a.st === 'out' || a.f !== activeFloor) continue;
      let curX = a.x, curY = a.y;
      if (a.st === 'moving' && a.nx >= 0 && Math.floor(a.nx / FS) === a.f) {
        const nxX = (a.nx % FS) % W, nxY = Math.floor((a.nx % FS) / W);
        const p = Math.max(0, Math.min(1, a.pr || 0));
        curX = a.x + (nxX - a.x) * p;
        curY = a.y + (nxY - a.y) * p;
      }
      const ax = curX * CS + 10 + a.j[0] * 3, ay = curY * CS + 10 + a.j[1] * 3;
      if (a.incapacitated) {
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(ax, ay, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('+', ax, ay + 3);
      } else if (a.rescuedBy) {
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(ax, ay, 4.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = a.st === 'waiting' ? '#f59e0b' : '#2563eb';
        ctx.beginPath();
        ctx.arc(ax, ay, 3.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Tactical First Responders in 2D
    if (s.responders && s.responders.length) {
      for (const r of s.responders) {
        if (r.f !== activeFloor) continue;
        const rx = r.x * CS + 10, ry = r.y * CS + 10;

        // Laser line to target occupant if on same floor
        if (r.targetAgent && r.targetAgent.st !== 'out' && r.targetAgent.f === activeFloor) {
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2.2;
          ctx.setLineDash([5, 3]);
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(r.targetAgent.x * CS + 10, r.targetAgent.y * CS + 10);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Beacon glow
        ctx.fillStyle = 'rgba(234, 179, 8, 0.4)';
        ctx.beginPath();
        ctx.arc(rx, ry, 11, 0, Math.PI * 2);
        ctx.fill();

        // Squad Core
        ctx.fillStyle = '#eab308';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(rx, ry, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Squad ID
        ctx.fillStyle = '#000';
        ctx.font = 'bold 8px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(r.id, rx, ry + 3);
      }
    }

    if (tNames) {
      ctx.font = '9px system-ui';
      ctx.textAlign = 'center';
      for (const a of s.ag) {
        if (a.st === 'out' || a.f !== activeFloor) continue;
        let curX = a.x, curY = a.y;
        if (a.st === 'moving' && a.nx >= 0 && Math.floor(a.nx / FS) === a.f) {
          const nxX = (a.nx % FS) % W, nxY = Math.floor((a.nx % FS) / W);
          const p = Math.max(0, Math.min(1, a.pr || 0));
          curX = a.x + (nxX - a.x) * p;
          curY = a.y + (nxY - a.y) * p;
        }
        const nx = curX * CS + 10 + a.j[0] * 3, ny = curY * CS + 10 + a.j[1] * 3 - 6;
        const t = a.name.split(' ')[0];
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.strokeText(t, nx, ny);
        ctx.fillStyle = '#0f172a';
        ctx.fillText(t, nx, ny);
      }
      ctx.lineWidth = 1;
      ctx.font = 'bold 11px system-ui';
    }

    const tag = (x, y, t, col) => {
      const lx = Math.min(Math.max(x * CS + 10, 28), cv.width - 28);
      const ly = Math.min(Math.max(y * CS - 6, 12), cv.height - 6);
      ctx.fillStyle = '#fff';
      ctx.fillRect(lx - 26, ly - 10, 52, 14);
      ctx.strokeStyle = col;
      ctx.strokeRect(lx - 26, ly - 10, 52, 14);
      ctx.fillStyle = col;
      ctx.fillText(t, lx, ly + 1);
    };

    if (activeFloor === 0 && s.ex) {
      s.ex.forEach((e, i) => {
        if (e.refuge) return;
        const isBlocked = typeof s.blocked === 'function' ? s.blocked(e.n) : (s.g && (s.g[e.n] === 3 || s.g[e.n] === 1 || s.g[e.n] === 5));
        const exitLetter = String.fromCharCode(65 + i);
        const ey = e.y === 0 ? 3 : e.y;
        const lx = Math.min(Math.max(e.x * CS + 10, 42), cv.width - 42);
        const ly = Math.min(Math.max(ey * CS - 8, 14), cv.height - 8);

        // Emergency glowing halo when fire alarm is active
        if (fireAlarmActive && !isBlocked) {
          ctx.save();
          ctx.shadowColor = '#22c55e';
          ctx.shadowBlur = 12;
          ctx.fillStyle = 'rgba(34, 197, 94, 0.28)';
          ctx.fillRect(lx - 40, ly - 11, 80, 18);
          ctx.restore();
        }

        ctx.fillStyle = isBlocked ? '#fef2f2' : (fireAlarmActive ? '#15803d' : '#ffffff');
        ctx.fillRect(lx - 40, ly - 11, 80, 18);
        ctx.strokeStyle = isBlocked ? '#ef4444' : '#16a34a';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(lx - 40, ly - 11, 80, 18);

        ctx.fillStyle = isBlocked ? '#dc2626' : (fireAlarmActive ? '#ffffff' : '#15803d');
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        const label = isBlocked ? `⛔ EXIT ${exitLetter} BLK` : `🏃 EXIT ${exitLetter} ${e.cap}/s`;
        ctx.fillText(label, lx, ly + 2);
        ctx.lineWidth = 1;
      });
    }

    // Extinguisher station tags on active floor
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (s.g[o + y * W + x] === 8) {
          tag(x, y, '🧯 FE-2kg', '#dc2626');
        }
      }
    }

    s.st.forEach((q, i) => {
      if (s.g[o + q.y * W + q.x] !== 5) tag(q.x, q.y, `S${i + 1} ${q.cap}/s`, '#2563eb');
    });
  }, [activeFloor, tHeat, tRoutes, tNames, tSmoke, fireAlarmActive]);

  const renderChart = () => {
    const cv = chartCanvasRef.current;
    if (!cv) return;
    const x = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    const s = simRef.current;
    if (!s) return;

    x.clearRect(0, 0, w, h);
    const live = s.hist.concat([[s.t, s.n - s.done, ...s.fc]]);
    const series = [[live.map(r => [r[0], r[1]]), '#38bdf8', 2.2]];
    for (let f = 0; f < baseRef.current.nf; f++) {
      series.push([live.map(r => [r[0], r[2 + f]]), FC[f], 1]);
    }
    if (comparisonResult && Array.isArray(comparisonResult.A) && comparisonResult.A.length > 0) {
      series.push([comparisonResult.A.map(r => [r[0], r[1]]), '#10b981', 1.8]);
    }
    if (comparisonResult && Array.isArray(comparisonResult.B) && comparisonResult.B.length > 0) {
      series.push([comparisonResult.B.map(r => [r[0], r[1]]), '#ef4444', 1.8]);
    }

    const validSeries = series.filter(q => q[0] && q[0].length > 0);
    const tm = Math.max(10, ...validSeries.map(q => q[0][q[0].length - 1][0] || 0));
    const n = Math.max(1, s.n);
    const p = 22;

    x.strokeStyle = '#334155';
    x.fillStyle = '#94a3b8';
    x.font = '10px system-ui';
    x.beginPath();
    x.moveTo(p, 4);
    x.lineTo(p, h - p);
    x.lineTo(w - 4, h - p);
    x.stroke();

    x.fillText(String(n), 2, 12);
    x.fillText('0', 10, h - p + 2);
    x.fillText(tm.toFixed(0) + 's', w - 30, h - 8);

    for (const [d, col, lw] of series) {
      x.strokeStyle = col;
      x.lineWidth = lw;
      x.beginPath();
      d.forEach(([t, r], i) => {
        const px = p + (t / tm) * (w - p - 4);
        const py = h - p - (r / n) * (h - p - 6);
        if (i) x.lineTo(px, py);
        else x.moveTo(px, py);
      });
      x.stroke();
    }
  };

  const renderCompareChart = useCallback(() => {
    const cv = compareChartCanvasRef.current;
    if (!cv || !comparisonResult) return;
    const x = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    x.clearRect(0, 0, w, h);

    const seriesA = comparisonResult.A || [];
    const seriesB = comparisonResult.B || [];
    if (!seriesA.length && !seriesB.length) return;

    const maxT = Math.max(15, ...seriesA.map(p => p[0]), ...seriesB.map(p => p[0]));
    const maxN = Math.max(1, ...seriesA.map(p => p[1]), ...seriesB.map(p => p[1]));
    const p = 24;

    // Grid & Axis
    x.strokeStyle = '#273549';
    x.fillStyle = '#94a3b8';
    x.font = '10px system-ui';
    x.beginPath();
    x.moveTo(p, 6);
    x.lineTo(p, h - p);
    x.lineTo(w - 6, h - p);
    x.stroke();

    x.fillText(String(maxN), 2, 14);
    x.fillText('0', 10, h - p + 3);
    x.fillText(maxT.toFixed(0) + 's', w - 32, h - 8);

    // Draw Blockage marker at t=8s
    if (maxT >= 8) {
      const bx = p + (8 / maxT) * (w - p - 6);
      x.strokeStyle = 'rgba(239, 68, 68, 0.45)';
      x.lineWidth = 1.2;
      x.setLineDash([4, 4]);
      x.beginPath();
      x.moveTo(bx, 6);
      x.lineTo(bx, h - p);
      x.stroke();
      x.setLineDash([]);
      x.fillStyle = '#f87171';
      x.font = '9px system-ui';
      x.fillText('Block @8s', Math.max(p + 2, bx - 22), 16);
    }

    // Draw Curve A (Baseline - Green #10b981)
    if (seriesA.length) {
      x.strokeStyle = '#10b981';
      x.lineWidth = 2.2;
      x.beginPath();
      seriesA.forEach(([t, r], i) => {
        const px = p + (t / maxT) * (w - p - 6);
        const py = h - p - (r / maxN) * (h - p - 8);
        if (i === 0) x.moveTo(px, py);
        else x.lineTo(px, py);
      });
      x.stroke();
    }

    // Draw Curve B (Blockage @8s - Red #ef4444)
    if (seriesB.length) {
      x.strokeStyle = '#ef4444';
      x.lineWidth = 2.2;
      x.beginPath();
      seriesB.forEach(([t, r], i) => {
        const px = p + (t / maxT) * (w - p - 6);
        const py = h - p - (r / maxN) * (h - p - 8);
        if (i === 0) x.moveTo(px, py);
        else x.lineTo(px, py);
      });
      x.stroke();
    }
  }, [comparisonResult]);

  const drawRouteMapCanvas = useCallback(() => {
    const cv = routeCanvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const s = simRef.current;
    const base = baseRef.current;
    if (!base) return;

    const floor = Math.max(0, Math.min(base.nf - 1, routeFloor));
    const o = floor * FS;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);

    // Architectural dark blueprint background
    ctx.fillStyle = '#070d19';
    ctx.fillRect(0, 0, cv.width, cv.height);

    // Subtle grid lines
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

    // Draw floor architectural cells
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = s ? s.g[o + y * W + x] : base.g[o + y * W + x];
        const px = x * CS, py = y * CS;

        if (v === 1) {
          // Wall - High contrast architectural style
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(px, py, CS, CS);
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, CS - 1, CS - 1);

          // Overhead Sprinkler Piping Network along Wall Tops
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(px, py + 2);
          ctx.lineTo(px + CS, py + 2);
          ctx.stroke();

          // Brass Nozzle Heads
          if ((x % 3 === 0 && y % 2 === 0) || (x % 4 === 0 && y % 3 === 0)) {
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(px + 10, py + 4, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (v === 3) {
          // Fire Hazard Cell in vibrant bright red
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(px, py, CS, CS);
          ctx.strokeStyle = '#f87171';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 1, py + 1, CS - 2, CS - 2);
          ctx.font = 'bold 12px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText('🔥', px + 10, py + 14);
        } else if (v === 4) {
          // Stairwell
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
          // Lift (Disabled)
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
          // Extinguisher Station
          ctx.fillStyle = '#311018';
          ctx.fillRect(px, py, CS, CS);
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(px + 1, py + 1, CS - 2, CS - 2);
          ctx.font = '11px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText('🧯', px + 10, py + 14);
        } else {
          // Walkable Room / Corridor floor
          ctx.fillStyle = '#0b1322';
          ctx.fillRect(px, py, CS, CS);
          ctx.strokeStyle = 'rgba(51, 65, 85, 0.2)';
          ctx.strokeRect(px + 0.5, py + 0.5, CS, CS);
        }
      }
    }

    // Draw Exits if Ground Floor
    if (floor === 0) {
      base.ex.forEach((e, i) => {
        if (e.refuge) return;
        const exLetter = String.fromCharCode(65 + i);
        const exX = e.x * CS, exY = (e.y === 0 ? 2 : e.y) * CS;
        const isBlocked = s ? s.blocked(e.n) : false;

        // Glowing Exit Banner
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

    // Draw Stairwell Banners on current floor
    base.st.forEach((stair, i) => {
      const sx = stair.x * CS, sy = stair.y * CS;
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(sx - 20, sy - 14, 40, 16);
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(sx - 20, sy - 14, 40, 16);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`🪜 S${i + 1}`, sx, sy - 2);
    });

    // Draw Directional Chevrons along Corridors (animated)
    const animT = (Date.now() / 250) % 1;
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.45)';
    ctx.lineWidth = 1.5;
    for (let y = 3; y < H - 3; y += 3) {
      for (let x = 3; x < W - 3; x += 3) {
        const idx = o + y * W + x;
        const v = s ? s.g[idx] : base.g[idx];
        if (v === 0) {
          let dirX = 0, dirY = 0;
          if (floor === 0) {
            dirX = x < 20 ? -1 : 1;
          } else {
            let minD = Infinity, bestSt = base.st[0];
            for (const st of base.st) {
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

    // Draw Custom Pin ("YOU ARE HERE") & Targeted Dijkstra Escape Route
    if (customPin && customPin.f === floor) {
      const pinX = customPin.x * CS + 10;
      const pinY = customPin.y * CS + 10;

      // Pulsing radar ripple
      const pulseR = 8 + (Math.sin(Date.now() / 150) + 1) * 6;
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pinX, pinY, pulseR, 0, Math.PI * 2);
      ctx.stroke();

      // Pin Marker
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(pinX, pinY, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Pin Label Badge
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(pinX - 45, pinY - 26, 90, 18);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(pinX - 45, pinY - 26, 90, 18);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 9px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('📍 YOU ARE HERE', pinX, pinY - 13);

      // Draw Calculated Escape Route Trail
      if (calculatedRoute && calculatedRoute.path && calculatedRoute.path.length > 1) {
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
          if (nf !== floor) continue;
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
  }, [routeFloor, customPin, calculatedRoute]);

  const handleRouteCanvasClick = (e) => {
    const cv = routeCanvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * cv.width;
    const py = ((e.clientY - rect.top) / rect.height) * cv.height;

    const cellX = Math.floor(px / CS);
    const cellY = Math.floor(py / CS);
    if (cellX < 0 || cellX >= W || cellY < 0 || cellY >= H) return;

    const floor = routeFloor;
    const s = simRef.current;
    const base = baseRef.current;
    const v = s ? s.g[floor * FS + cellY * W + cellX] : base.g[floor * FS + cellY * W + cellX];

    if (v === 1) {
      addLog('⚠️ Wall selected. Click a room or corridor cell to set your evacuation position.');
      return;
    }

    setCustomPin({ f: floor, x: cellX, y: cellY });

    if (s) {
      const startNode = floor * FS + cellY * W + cellX;
      let bestExit = null, minScore = Infinity, bestExitIdx = -1;

      s.ex.forEach((ex, idx) => {
        if (ex.refuge) return;
        if (s.blocked(ex.n)) return;
        if (s.d && s.d[idx] && s.d[idx][startNode] < minScore) {
          minScore = s.d[idx][startNode];
          bestExit = ex;
          bestExitIdx = idx;
        }
      });

      if (bestExit && minScore < Infinity) {
        const path = s.findTacticalPath(startNode, bestExit.n);
        const distMeters = (path.length * 1.5).toFixed(1);
        const estSec = (distMeters / 1.3).toFixed(1);
        const exitLetter = String.fromCharCode(65 + bestExitIdx);

        const steps = [];
        if (floor > 0) {
          const stairStep = path.find(n => s.g[n] === 4);
          const stairIdx = stairStep !== undefined ? s.st.findIndex(st => st.x === ((stairStep % FS) % W) && st.y === Math.floor((stairStep % FS) / W)) : 0;
          steps.push(`Exit current room and follow glowing green markers towards Stairwell S${stairIdx + 1}.`);
          steps.push(`Descend safely using Stairwell S${stairIdx + 1} down to Ground Level.`);
          steps.push(`Discharge through Emergency Exit ${exitLetter} to designated Assembly Area.`);
        } else {
          steps.push(`Proceed immediately along corridor following green directional chevrons.`);
          steps.push(`Head directly towards Ground Emergency Exit ${exitLetter}.`);
          steps.push(`Pass through Exit ${exitLetter} and report to exterior muster point.`);
        }

        setCalculatedRoute({
          path,
          distMeters,
          estSec,
          exitLetter,
          steps,
          targetExit: bestExit
        });
        speakAnnouncement(`Escape route calculated to Exit ${exitLetter}. Proceed immediately.`);
        addLog(`📍 Location set at ${FN[floor]} (${cellX},${cellY}). Shortest safe path: Exit ${exitLetter} (${distMeters}m, ~${estSec}s).`);
      } else {
        setCalculatedRoute({
          path: [],
          distMeters: '–',
          estSec: '–',
          exitLetter: 'BLOCKED',
          steps: ['⚠️ No direct unblocked exit found! Active fire blocks the corridor.', 'Seek designated upper floor refuge or wait for tactical first responders.'],
          targetExit: null
        });
        addLog(`⚠️ Location at ${FN[floor]} (${cellX},${cellY}) is cut off by hazards!`);
      }
    }
  };

  useEffect(() => {
    if (activeDeckTab === 'compare' && comparisonResult) {
      const timer = setTimeout(() => {
        renderCompareChart();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [activeDeckTab, comparisonResult, renderCompareChart]);

  useEffect(() => {
    const loop = (ts) => {
      frameCountRef.current++;
      const s = simRef.current;

      if (simRunning && s) {
        let acc = Math.min(0.25, (ts - lastTickTimeRef.current) / 1000) * simSpeed;
        lastTickTimeRef.current = ts;
        while (acc > 1e-6) {
          const d = Math.min(0.1, acc);
          s.step(d);
          acc -= d;
        }

        // Fire Alarm Detection: as soon as fire breaks out, sound the alarm
        if (s.hazard === 'fire' && !fireAlarmActive) {
          for (let idx = 0; idx < F * FS; idx++) {
            if (s.g[idx] === 3) {
              const fl = Math.floor(idx / FS);
              const r = idx % FS;
              triggerFireAlarm(fl, r % W, Math.floor(r / W));
              break;
            }
          }
        }

        if (s.finished()) {
          setSimRunning(false);
          speakAnnouncement(
            'Evacuation complete. ' + s.done + ' of ' + s.n +
            (s.flood ? ' reached safe floors.' : ' evacuated to exits.') +
            (s.trapped ? ' ' + s.trapped + ' people are trapped.' : ''),
            true
          );
          s.hist.push([s.t, s.n - s.done, ...s.fc]);
          addLog(`✅ Evacuation complete at ${s.t.toFixed(1)}s: ${s.done}/${s.n} evacuated.`);
          updateUI(true);
        } else {
          updateUI(false);
        }
      } else {
        lastTickTimeRef.current = ts;
      }

      if (ts - lastAdvTimeRef.current > 500) {
        lastAdvTimeRef.current = ts;
        if (s) {
          computePossibleRoutes(s, simRunning);
          runAIAgents(s, simRunning);
        }
      }

      pumpVoice();
      drawCanvas();
      if (activePage === 'routemap') {
        drawRouteMapCanvas();
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [activePage, simRunning, simSpeed, updateUI, computePossibleRoutes, runAIAgents, pumpVoice, drawCanvas, drawRouteMapCanvas, speakAnnouncement, addLog, fireAlarmActive, triggerFireAlarm]);

  const handlePointerDown = (e) => {
    const cv = canvasRef.current;
    if (!cv || !simRef.current) return;
    const rect = cv.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width * cv.width;
    const py = (e.clientY - rect.top) / rect.height * cv.height;

    let targetF = activeFloor;
    let targetX = -1, targetY = -1;

    if (activeFloor < 0) {
      const p = pick3D(px, py, baseRef.current.nf);
      if (!p) return;
      targetF = p[0];
      targetX = p[1];
      targetY = p[2];
    } else {
      targetX = Math.floor(px / CS);
      targetY = Math.floor(py / CS);
    }

    if (targetX < 0 || targetY < 0 || targetX >= W || targetY >= H) return;

    if (tacticalMode && simStarted) {
      const s = simRef.current;
      const clickedAgent = s.ag.find(a => a.st !== 'out' && a.f === targetF && Math.hypot(a.x - targetX, a.y - targetY) <= 1.8);
      if (clickedAgent) {
        addLog(`🎯 Tactical Target Locked: ${clickedAgent.name} on ${FN[targetF]} (${clickedAgent.x},${clickedAgent.y})`);
        speakAnnouncement(`Tactical squad dispatched to extract ${clickedAgent.name} on ${FN[targetF]}.`);
        let r = s.responders.find(res => res.st === 'idle') || s.dispatchResponder(`Squad ${String.fromCharCode(65 + s.responders.length)}`);
        r.targetAgent = clickedAgent;
        r.st = 'inbound';
        r.path = [];
      } else {
        let r = s.responders.find(res => res.st === 'idle') || s.dispatchResponder(`Squad ${String.fromCharCode(65 + s.responders.length)}`);
        addLog(`🚒 Tactical Squad dispatched to scout ${FN[targetF]} (${targetX},${targetY})`);
        r.targetAgent = { f: targetF, x: targetX, y: targetY, name: `Sector (${targetX},${targetY})`, st: 'waiting' };
        r.st = 'inbound';
        r.path = [];
      }
      updateUI(true);
      return;
    }

    if (simStarted) {
      simRef.current.addFire(targetF, targetX, targetY, 0);
      addLog(`🔥 Emergency hazard placed on ${FN[targetF]} (${targetX},${targetY}) at ${simRef.current.t.toFixed(1)}s.`);
      if (hazardMode !== 'flood') {
        triggerFireAlarm(targetF, targetX, targetY);
      }
      speakAnnouncement(
        hazardMode === 'flood'
          ? `Alert! Flooding reported on ${FN[targetF]}. Move to higher floors immediately.`
          : `Alert! Fire reported on ${FN[targetF]}. Re-routing evacuees.`,
        true
      );
      // Automatically send emergency SMS to 7200673492 when hazard alert occurs
      handleSendPhoneAlert(hazardMode === 'flood' ? 'flood' : 'fire', targetF, true);
      updateUI(true);
      return;
    }

    const r = targetY * W + targetX;
    const i = targetF * FS + r;
    const g = baseRef.current.g;
    const v = g[i];

    const rmP = (all) => {
      baseRef.current.pos = baseRef.current.pos.filter(p => !(p[1] === targetX && p[2] === targetY && (all || p[0] === targetF)));
    };

    const clearCell = () => {
      if (v === 4) {
        baseRef.current.st = baseRef.current.st.filter(s => !(s.x === targetX && s.y === targetY));
        for (let k = 0; k < F; k++) if (g[k * FS + r] === 4) g[k * FS + r] = 0;
      }
      if (v === 5) for (let k = 0; k < F; k++) if (g[k * FS + r] === 5) g[k * FS + r] = 0;
      if (v === 2) baseRef.current.ex = baseRef.current.ex.filter(e => !(e.x === targetX && e.y === targetY));
      if (v === 8) g[i] = 0;
    };

    const capVal = parseFloat(capacityInput) || 2;

    if (selectedTool === 'wall') { clearCell(); g[i] = 1; rmP(); }
    else if (selectedTool === 'erase') { clearCell(); g[i] = 0; rmP(); }
    else if (selectedTool === 'extinguisher') {
      clearCell();
      g[i] = 8;
      rmP();
      addLog(`🧯 Fire Extinguisher placed on ${FN[targetF]} (${targetX},${targetY})`);
    }
    else if (selectedTool === 'window') { if (v === 1) g[i] = 6; else if (v === 6) g[i] = 1; }
    else if (selectedTool === 'fire') {
      clearCell();
      g[i] = hazardMode === 'flood' ? 7 : 3;
      rmP();
      if (hazardMode !== 'flood') {
        triggerFireAlarm(targetF, targetX, targetY);
      }
    }
    else if (selectedTool === 'exit') {
      if (targetF !== 0) { addLog('Ground exits can only be placed on Floor 0 (Ground).'); return; }
      rmP();
      addExit(targetX, targetY, capVal);
    } else if (selectedTool === 'stair') {
      if (v === 2) return;
      addStair(targetX, targetY, capVal);
      rmP(true);
    } else if (selectedTool === 'lift') {
      if (v === 2) return;
      clearCell();
      addLift(targetX, targetY);
      rmP(true);
    } else if (selectedTool === 'person' && v === 0) {
      baseRef.current.pos.push([targetF, targetX, targetY, rname()]);
    }

    resetSim();

    // Auto-persist building layout changes so refreshing the page preserves all edits
    try {
      const payload = {
        name: 'Primary Building Layout',
        layout: {
          nf: baseRef.current.nf,
          g: Array.from(baseRef.current.g),
          ex: baseRef.current.ex,
          st: baseRef.current.st,
        },
        occupants: {
          pos: baseRef.current.pos,
          c: [c0, c1, c2, c3]
        }
      };
      localStorage.setItem('evac_layout_v2', JSON.stringify(payload));
    } catch (e) {}
  };

  const runHeadlessSimulation = (g, block, bt) => {
    const s = new SimEngine(g, baseRef.current.ex, baseRef.current.st, baseRef.current.pos, baseRef.current.nf, tSpread, 1, hazardMode);
    s.compute();
    s.assign();
    let applied = false;
    let stepCount = 0;
    while (s.t < 120 && stepCount < 500 && !(s.t > 1 && s.finished())) {
      if (block && !applied && s.t >= bt) {
        block.forEach(i => { if (s.g[i] !== 1) s.g[i] = hazardMode === 'flood' ? 7 : 3; });
        s.dirty = true;
        s.evt = { t: s.t, r: s.rer, x: 0, y: 0, f: 0, id: ++s.eid };
        applied = true;
      }
      s.step(0.25);
      stepCount++;
    }
    s.hist.push([s.t, s.n - s.done, ...s.fc]);
    return s;
  };

  const handleRunComparison = async () => {
    if (!simRef.current || !simRef.current.n) {
      addLog('Add occupants first before running comparison');
      return;
    }
    setIsComparing(true);
    addLog('Executing Dual-Scenario Comparative Benchmark (Baseline vs Blockage @8s)...');

    try {
      // Convert flat cell array into multi-floor grid matrix matching Django engine schema
      const floorGrids = [];
      for (let f = 0; f < baseRef.current.nf; f++) {
        const grid = [];
        for (let y = 0; y < H; y++) {
          const row = [];
          for (let x = 0; x < W; x++) {
            const raw = baseRef.current.g[f * FS + y * W + x];
            // Schema mapping: 0=empty, 1=wall, 2=exit, 4(stair)->3, 5(lift)->4, 3/7(fire/flood)->5
            const mapped = raw === 4 ? 3 : (raw === 5 ? 4 : (raw === 3 || raw === 7 ? 5 : raw));
            row.push(mapped);
          }
          grid.push(row);
        }
        floorGrids.push({ floor: f, grid });
      }

      const payload = {
        building: {
          width: W,
          height: H,
          num_floors: baseRef.current.nf,
          floors: floorGrids,
          exits: baseRef.current.ex.map((e, idx) => ({ id: String.fromCharCode(65 + idx), x: e.x, y: e.y, cap: e.cap || 2.5 })),
          stairs: baseRef.current.st.map((s, idx) => ({ id: `S${idx + 1}`, x: s.x, y: s.y, cap: s.cap || 2.0 }))
        },
        occupants_per_floor: [c0, c1, c2, c3]
      };

      const resp = await fetch('/api/evacuation/compare/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.status === 'success' && data.comparison) {
          const comp = data.comparison;
          const bBase = data.baseline_details;
          const bBlock = data.blocked_details;

          // Convert backend time_series to [[t, remaining], ...]
          const histA = (bBase?.time_series || []).map(p => [p.time, p.total]);
          const histB = (bBlock?.time_series || []).map(p => [p.time, p.total]);

          const compData = {
            how: 'Busiest Staircase & Central Corridor blocked at t=8.0s',
            buildingA: comp.no_blockage.building_clearance || `${bBase?.clearance_time || 14}s`,
            buildingB: comp.blockage_8s.building_clearance || `>${bBlock?.clearance_time || 22}s`,
            floors: Array.from({ length: baseRef.current.nf }, (_, f) => ({
              name: FN[f],
              valA: comp.no_blockage[f === 0 ? 'ground' : `floor_${f}`] || '~12s',
              valB: comp.blockage_8s[f === 0 ? 'ground' : `floor_${f}`] || '~18s'
            })),
            evacA: comp.no_blockage.evacuated || `${bBase?.evacuated || 120}/${bBase?.total_occupants || 120}`,
            evacB: comp.blockage_8s.evacuated || `${bBlock?.evacuated || 120}/${bBlock?.total_occupants || 120}`,
            rerA: comp.no_blockage.reroutes ?? 0,
            rerB: comp.blockage_8s.reroutes ?? 74,
            impact: comp.impact_summary || `+${((bBlock?.clearance_time || 20) - (bBase?.clearance_time || 14)).toFixed(1)}s clearance delay · routes dynamically recomputed`,
            A: histA.length ? histA : [[0, simRef.current.n], [12, 0]],
            B: histB.length ? histB : [[0, simRef.current.n], [8, Math.round(simRef.current.n * 0.6)], [18, 0]]
          };

          setComparisonResult(compData);
          setIsComparing(false);
          setActiveDeckTab('compare');
          addLog('Comparison Benchmark successfully computed via Django Engine ✓');
          updateUI(true);
          return;
        }
      }
    } catch (apiErr) {
      console.warn('Backend comparison endpoint error, switching to fast client simulation fallback:', apiErr);
    }

    // 2. Client-side Heuristic Fallback (capped to ensure 0 freezing)
    try {
      const g0 = baseRef.current.g.map(v => v === 3 || v === 7 ? 0 : v);
      const A = runHeadlessSimulation(g0, null, 0);

      let cells = [];
      let how = 'active hazard zone';
      baseRef.current.g.forEach((v, i) => { if (v === 3 || v === 7) cells.push(i); });

      if (!cells.length) {
        const s = A.st.map((q, i) => [q.used, i]).sort((a, b) => b[0] - a[0])[0];
        if (s && s[0] > 0) {
          const q = A.st[s[1]];
          how = `busiest staircase S${s[1] + 1}`;
          for (let f = 0; f < baseRef.current.nf; f++) cells.push(f * FS + q.y * W + q.x);
        } else {
          let m = -1, mi = 0;
          A.heat.forEach((h, i) => { if (h > m && A.g[i] === 0) { m = h; mi = i; } });
          cells = [mi];
          how = 'busiest corridor node';
        }
      }

      const B = runHeadlessSimulation(g0, cells, 8);
      const T = s => s.trapped ? `>${s.t.toFixed(0)}s` : s.t.toFixed(1) + 's';
      const D = (s, f) => s.fd[f] === null ? '—' : s.fd[f].toFixed(0) + 's';

      const compData = {
        how,
        buildingA: T(A),
        buildingB: T(B),
        floors: Array.from({ length: baseRef.current.nf }, (_, f) => ({
          name: FN[f],
          valA: D(A, f),
          valB: D(B, f)
        })),
        evacA: `${A.done}/${A.n}`,
        evacB: `${B.done}/${B.n}`,
        rerA: A.rer,
        rerB: B.rer,
        impact: B.trapped ? 'Some people trapped / cut off' : (B.t >= A.t ? '+' : '') + (B.t - A.t).toFixed(1) + ' s clearance delay',
        A: A.hist.map(r => [r[0], r[1]]),
        B: B.hist.map(r => [r[0], r[1]])
      };

      setComparisonResult(compData);
      setIsComparing(false);
      setActiveDeckTab('compare');
      addLog(`Comparison executed successfully. Blockage scenario: ${how}`);
      updateUI(true);
    } catch (err) {
      console.error('Comparison error:', err);
      setIsComparing(false);
      addLog('Failed to run comparison: ' + err.message);
    }
  };

  const handleSelectDeckTab = (tabId) => {
    setActiveDeckTab(tabId);
    if (tabId === 'compare' && !comparisonResult && !isComparing) {
      setTimeout(() => {
        handleRunComparison();
      }, 50);
    }
  };

  const totalOccupants = simRef.current ? simRef.current.n : 1;
  const evacPercent = Math.min(100, Math.round((evacuatedCount / Math.max(1, totalOccupants)) * 100));

  // When scanned via QR code or navigated to ?view=map, ONLY display the exact floor map (First Image)
  if (isMapOnlyMode) {
    return (
      <div className="standalone-floor-map-container" style={{ padding: '0.75rem', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Sleek Top Floor Map Navigation Bar */}
        <header className="standalone-map-header" style={{ width: '100%', maxWidth: '840px', borderRadius: '12px', marginBottom: '0.75rem' }}>
          <div className="standalone-map-header-top-row">
            <div className="standalone-map-brand">
              <div className="brand-icon-box">
                <Compass size={20} color="#38bdf8" />
              </div>
              <div>
                <h1 className="brand-title">AEGIS · Building Floor Map</h1>
                <div className="brand-subtitle">
                  <span className="live-status-dot"></span>
                  <span>LIVE EVACUATION SIMULATOR</span>
                </div>
              </div>
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
              <button
                className="btn-back-cmd"
                onClick={() => {
                  setIsMapOnlyMode(false);
                  if (window.history.pushState) {
                    window.history.pushState({}, '', '/?view=desktop');
                  } else {
                    window.location.search = '?view=desktop';
                  }
                }}
                title="Switch to Full Multi-Deck Command Center"
              >
                <ArrowLeft size={15} />
                <span>Command Center</span>
              </button>
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
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </header>

        {/* Emergency Alert Banner (Displays only if active incident) */}
        {fireAlarmActive && (
          <div className="standalone-alert-banner" style={{ width: '100%', maxWidth: '840px', borderRadius: '8px', marginBottom: '0.75rem' }}>
            <Flame size={18} color="#ef4444" className="pulse-danger-icon" />
            <div className="alert-banner-text">
              <b>🚨 ACTIVE FIRE HAZARD REPORTED</b> · Avoid fired zones & follow green emergency exit signs.
            </div>
          </div>
        )}

        {/* The Exact Canvas Viewport Card from the First Image */}
        <div className="canvas-viewport-card" style={{ width: '100%', maxWidth: '840px', margin: '0 auto', boxShadow: '0 12px 40px rgba(0,0,0,0.7)' }}>
          <div className="canvas-top-overlay">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="viewport-badge">
                <Compass size={13} />
                <span>{activeFloor < 0 ? 'PERSPECTIVE: 3D CONNECTED MULTI-FLOOR' : `LEVEL: ${FN[activeFloor].toUpperCase()}`}</span>
              </div>
              <button
                id="overlay-btn-play-toggle"
                className={`btn-ctrl-primary ${simRunning ? 'running' : ''}`}
                style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem', fontWeight: 700 }}
                onClick={handleToggleSimulation}
              >
                {simRunning ? <Pause size={13} /> : <Play size={13} />}
                <span>{simRunning ? 'Pause Engine' : 'Start Evacuation'}</span>
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span className="viewport-badge hide-mobile">SCALE: 1:50 · 40x25 CELLS</span>
              <span className="viewport-badge" style={{ color: '#34d399' }}>● 60 FPS</span>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            id="map"
            width={800}
            height={500}
            style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px', touchAction: 'manipulation' }}
            onPointerDown={handlePointerDown}
          />
        </div>

        {/* Safety Quiz Prompt Bar */}
        <div
          className="standalone-quiz-invite-bar"
          style={{ width: '100%', maxWidth: '840px', marginTop: '0.85rem' }}
          onClick={() => setShowQuizModal(true)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Award size={18} color="#fbbf24" />
            <span><b>Block 4 Safety Test:</b> Quiz on Fire Extinguishers & Exits to earn your official certificate.</span>
          </div>
          <span className="quiz-invite-action">Take Quiz & Get Certified →</span>
        </div>

        {/* Safety Quiz Modal */}
        <SafetyQuizModal isOpen={showQuizModal} onClose={() => setShowQuizModal(false)} />
      </div>
    );
  }

  return (
    <div className="aegis-container" id="aegis-command-center">
      {/* -------------------------------------------------------------------- */}
      {/* Top Global Mission Header */}
      {/* -------------------------------------------------------------------- */}
      <header className="aegis-header">
        <div className="brand-section">
          <div className="brand-logo-icon">
            <ShieldAlert size={22} />
          </div>
          <div className="brand-info">
            <div className="brand-title-row">
              <span className="brand-name">AEGIS · Evacuation Command</span>
              <span className="sdg-chip">SC-07 · SDG 11</span>
            </div>
            <span className="brand-tagline">3D-Graph Routing & Autonomous Crowd Evacuation System</span>
          </div>
        </div>

        <div className="page-nav-pill-group">
          <button
            id="nav-pill-sim"
            className={`page-nav-pill ${activePage === 'simulator' ? 'active' : ''}`}
            onClick={() => setActivePage('simulator')}
            title="Full Multi-Agent Evacuation Simulation Command Center"
          >
            <ShieldAlert size={14} />
            <span>🏢 Simulation Command</span>
          </button>
          <button
            id="nav-pill-routemap"
            className={`page-nav-pill ${activePage === 'routemap' ? 'active' : ''}`}
            onClick={() => {
              setActivePage('routemap');
              setRouteFloor(activeFloor < 0 ? 0 : activeFloor);
            }}
            title="Tactical Emergency Evacuation Route Map & Life Safety Wayfinding"
          >
            <Compass size={14} />
            <span>🗺️ Evacuation Route Map</span>
          </button>
          <button
            id="nav-pill-phonemap"
            className="page-nav-pill"
            onClick={() => {
              setIsMapOnlyMode(true);
              if (window.history.pushState) {
                window.history.pushState({}, '', '/?view=map');
              }
            }}
            title="Switch to iPhone & Android Mobile Floor Map View"
          >
            <Smartphone size={14} />
            <span>📱 Phone View</span>
          </button>
        </div>

        <div className="header-center-pill">
          <span className="pulse-dot"></span>
          <span>SYSTEM ACTIVE · DJANGO ENGINE ONLINE</span>
        </div>

        <div className="header-action-group">
          <button
            id="header-btn-play-toggle"
            className={`btn-ctrl-primary ${simRunning ? 'running' : ''}`}
            style={{ padding: '0.45rem 1rem', fontSize: '0.85rem', fontWeight: 700, boxShadow: simRunning ? '0 0 12px rgba(239, 68, 68, 0.5)' : '0 0 12px rgba(37, 99, 235, 0.4)' }}
            onClick={handleToggleSimulation}
          >
            {simRunning ? <Pause size={15} /> : <Play size={15} />}
            <span>{simRunning ? 'Pause Engine' : 'Start Evacuation'}</span>
          </button>
          <button id="header-btn-reset" className="btn-ctrl-secondary" onClick={resetSim} title="Reset Simulation">
            <RotateCcw size={15} /> Reset
          </button>
          {saveMessage && <span style={{ fontSize: '0.8rem', color: '#34d399', fontWeight: 600 }}>{saveMessage}</span>}
          <button id="top-btn-save" className="btn-ctrl-secondary" onClick={handleSaveLayout} title="Save to Django SQLite database">
            <Save size={15} /> Save Layout
          </button>
          <button id="top-btn-load" className="btn-ctrl-secondary" onClick={handleLoadSavedLayout} title="Restore from Django SQLite database">
            <Download size={15} /> Load Saved
          </button>
          <button
            id="top-btn-phone"
            className="btn-ctrl-secondary"
            style={{ borderColor: 'rgba(34, 197, 94, 0.45)', color: '#4ade80', gap: '0.4rem' }}
            onClick={() => setShowPhoneModal(true)}
            title={`Connect Phone (${EMERGENCY_PHONE}) via Wi-Fi`}
          >
            <Smartphone size={15} />
            <span>Phone: {EMERGENCY_PHONE}</span>
            <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80' }}></span>
          </button>
          <button
            id="top-btn-floormap-qr"
            className="btn-ctrl-primary"
            style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              borderColor: '#38bdf8',
              color: '#ffffff',
              gap: '0.45rem',
              fontWeight: 700,
              boxShadow: '0 0 10px rgba(2, 132, 199, 0.4)'
            }}
            onClick={() => setShowQrModal(true)}
            title="Scan QR Code to view Floor Map Only on mobile browser"
          >
            <QrCode size={15} />
            <span>Floor Map QR</span>
          </button>
          <button
            id="top-btn-safety-quiz"
            className="btn-ctrl-secondary"
            style={{
              borderColor: 'rgba(245, 158, 11, 0.5)',
              color: '#fbbf24',
              background: 'rgba(245, 158, 11, 0.12)',
              gap: '0.45rem',
              fontWeight: 700,
              boxShadow: '0 0 10px rgba(245, 158, 11, 0.2)'
            }}
            onClick={() => setShowQuizModal(true)}
            title="Take Fire Safety & Exit Quiz to earn Official Building Safety Certificate"
          >
            <Award size={15} />
            <span>Safety Quiz & Certificate</span>
          </button>
          <button id="top-btn-docs" className="btn-ctrl-secondary" onClick={() => setShowDocModal(true)} title="View Architecture Specs">
            <HelpCircle size={15} /> Architecture
          </button>
        </div>
      </header>

      {/* -------------------------------------------------------------------- */}
      {/* Simulator View: KPI Ribbon + 3-Column Mission Workspace */}
      {/* -------------------------------------------------------------------- */}
      {activePage === 'simulator' && (
        <>
          <section className="kpi-ribbon">
        <div className="kpi-card" id="kpi-clearance">
          <div className="kpi-card-header">
            <span className="kpi-title">Est. Clearance Time</span>
            <div className="kpi-icon-wrap" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}><Clock size={16} /></div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{estClearance}</span>
          </div>
          <div className="kpi-subtext">
            <span>Sim: {simTime.toFixed(1)}s</span>
            <span>Speed: {simSpeed}x</span>
          </div>
        </div>

        <div className="kpi-card" id="kpi-evacuated">
          <div className="kpi-card-header">
            <span className="kpi-title">Evacuation Progress</span>
            <div className="kpi-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}><Users size={16} /></div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{evacuatedCount}</span>
            <span className="kpi-unit">/ {totalOccupants} cleared</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${evacPercent}%` }}></div>
          </div>
        </div>

        <div className="kpi-card" id="kpi-dynamics">
          <div className="kpi-card-header">
            <span className="kpi-title">Crowd Movement</span>
            <div className="kpi-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}><Activity size={16} /></div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{movingCount}</span>
            <span className="kpi-unit">moving</span>
          </div>
          <div className="kpi-subtext">
            <span>{waitingCount} stalled in queue</span>
            <span>{remTotal} inside</span>
          </div>
        </div>

        <div className="kpi-card" id="kpi-reroutes">
          <div className="kpi-card-header">
            <span className="kpi-title">Dynamic Re-Routes</span>
            <div className="kpi-icon-wrap" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}><Compass size={16} /></div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{reroutesCount}</span>
            <span className="kpi-unit">paths recalculated</span>
          </div>
          <div className="kpi-subtext">
            <span>Adaptive 3D Routing</span>
            <span style={{ color: '#f87171' }}>{trappedCount} cut off</span>
          </div>
        </div>

        <div className="kpi-card" id="kpi-hazard">
          <div className="kpi-card-header">
            <span className="kpi-title">Active Hazard Mode</span>
            <div className="kpi-icon-wrap" style={{ background: hazardMode === 'fire' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(6, 182, 212, 0.15)', color: hazardMode === 'fire' ? '#f87171' : '#22d3ee' }}>
              {hazardMode === 'fire' ? <Flame size={16} /> : <Waves size={16} />}
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value" style={{ textTransform: 'uppercase', fontSize: '1.35rem' }}>{hazardMode}</span>
          </div>
          <div className="kpi-subtext">
            <span>{hazardMode === 'fire' ? 'Ground exit escape' : 'Top floor vertical refuge'}</span>
          </div>
        </div>

        <div className="kpi-card" id="kpi-tactical">
          <div className="kpi-card-header">
            <span className="kpi-title">Tactical & Smoke</span>
            <div className="kpi-icon-wrap" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#eab308' }}><ShieldAlert size={16} /></div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value" style={{ color: '#facc15' }}>{respondersList.length}</span>
            <span className="kpi-unit">squads ({rescuedCount} rescued)</span>
          </div>
          <div className="kpi-subtext">
            <span style={{ color: incapacitatedCount > 0 ? '#f87171' : '#34d399' }}>
              {incapacitatedCount} incapacitated
            </span>
            <span style={{ color: peakSmokePpm > 300 ? '#f87171' : '#94a3b8' }}>
              {peakSmokePpm} ppm CO
            </span>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* Main 3-Column Mission Workspace */}
      {/* -------------------------------------------------------------------- */}
      <div className="mission-workspace">
        {/* ================================================================== */}
        {/* Column 1: Control & Blueprint Dock (Left) */}
        {/* ================================================================== */}
        <aside className="control-dock">
          {/* Floor Level Selector */}
          <div className="dock-card" id="dock-floor-levels">
            <div className="dock-section-title"><Layers size={14} /> Structural Floor Levels</div>
            <div className="floor-nav-stack">
              {Array.from({ length: baseRef.current.nf }, (_, f) => (
                <button
                  key={f}
                  id={`floor-btn-${f}`}
                  className={`floor-btn-modern ${activeFloor === f ? 'active' : ''}`}
                  onClick={() => setActiveFloor(f)}
                >
                  <span>{FN[f]}</span>
                  <span className="floor-count-pill">{simRef.current?.fc[f] ?? 0} occupants</span>
                </button>
              ))}
              <button
                id="floor-btn-3d"
                className={`floor-btn-modern ${activeFloor < 0 ? 'active' : ''}`}
                onClick={() => setActiveFloor(-1)}
              >
                <span>🏢 3D Connected View</span>
                <span className="floor-count-pill" style={{ background: 'rgba(59, 130, 246, 0.4)', color: '#fff' }}>Isometric</span>
              </button>
            </div>
          </div>

          {/* Blueprint Drawing Tool Palette */}
          <div className="dock-card" id="dock-tool-palette">
            <div className="dock-section-title"><Building2 size={14} /> Blueprint Editor Palette</div>
            <div className="tool-palette-grid">
              {[
                { id: 'wall', label: 'Wall' },
                { id: 'erase', label: 'Erase' },
                { id: 'extinguisher', label: '🧯 Extinguisher', isExtinguisher: true },
                { id: 'exit', label: '🚨 Emergency Exit' },
                { id: 'stair', label: 'Stairwell' },
                { id: 'lift', label: 'Lift (Disabled)' },
                { id: 'window', label: 'Window' },
                { id: 'person', label: 'Occupant' },
                { id: 'fire', label: hazardMode === 'flood' ? 'Flood Water' : 'Fire Hazard', isHazard: true },
              ].map(t => (
                <button
                  key={t.id}
                  id={`tool-${t.id}`}
                  className={`palette-btn ${selectedTool === t.id ? 'active' : ''} ${t.isHazard ? 'fire-hazard' : ''} ${t.isExtinguisher ? 'extinguisher-tool' : ''}`}
                  onClick={() => setSelectedTool(t.id)}
                >
                  {t.id === 'fire' ? (hazardMode === 'flood' ? <Waves size={14} /> : <Flame size={14} />) : null}
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--fg-muted)' }}>
              <span>Flow Cap (ppl/s):</span>
              <input
                id="capacity-input"
                type="number"
                min="0.5"
                max="10"
                step="0.5"
                value={capacityInput}
                onChange={e => setCapacityInput(e.target.value)}
                className="input-num-ui"
                style={{ width: '60px' }}
              />
            </div>
          </div>

          {/* Architecture Presets & Hazards */}
          <div className="dock-card" id="dock-presets-hazards">
            <div className="dock-section-title"><Sparkles size={14} /> Blueprints & Hazards</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <select
                  id="preset-selector"
                  className="select-ui"
                  style={{ flex: 1 }}
                  value={currentPreset}
                  onChange={(e) => {
                    setCurrentPreset(e.target.value);
                    applyPreset(e.target.value);
                    randomizePeople();
                  }}
                >
                  <option value="office">Office Building (4 Floors)</option>
                  <option value="college">College Block (3 Floors)</option>
                </select>
                <button className="btn-ui" onClick={() => { applyPreset(currentPreset); randomizePeople(); }}>Load</button>
              </div>

              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <select
                  id="hazard-selector"
                  className="select-ui"
                  style={{ flex: 1 }}
                  value={hazardMode}
                  onChange={(e) => {
                    setHazardMode(e.target.value);
                    resetSim();
                    addLog(e.target.value === 'flood' ? '🌊 Flood hazard active: vertical evacuation to Floor 3 refuge' : '🔥 Fire hazard active: ground exit evacuation');
                  }}
                >
                  <option value="fire">🔥 Hazard: Fire</option>
                  <option value="flood">🌊 Hazard: Flood</option>
                </select>
              </div>

              <button id="btn-random-gen" className="btn-ui" style={{ justifyContent: 'center' }} onClick={generateRandomBuilding}>
                🎲 Generate Procedural Building
              </button>
            </div>
          </div>

          {/* Crowd Distribution Panel */}
          <div className="dock-card" id="dock-crowd-controls">
            <div className="dock-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Users size={14} /> Crowd Distribution
              </span>
              <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 600 }}>Total: {c0 + c1 + c2 + c3}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem', marginBottom: '0.6rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>Ground</span>
                <input
                  type="number"
                  min="0"
                  max="200"
                  value={c0}
                  onChange={e => handleFloorCountChange(0, e.target.value)}
                  className="input-num-ui"
                  title="Ground Floor occupants"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>Floor 1</span>
                <input
                  type="number"
                  min="0"
                  max="200"
                  value={c1}
                  onChange={e => handleFloorCountChange(1, e.target.value)}
                  className="input-num-ui"
                  title="Floor 1 occupants"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>Floor 2</span>
                <input
                  type="number"
                  min="0"
                  max="200"
                  value={c2}
                  onChange={e => handleFloorCountChange(2, e.target.value)}
                  className="input-num-ui"
                  title="Floor 2 occupants"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>Floor 3</span>
                <input
                  type="number"
                  min="0"
                  max="200"
                  value={c3}
                  onChange={e => handleFloorCountChange(3, e.target.value)}
                  className="input-num-ui"
                  title="Floor 3 occupants"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button
                className="btn-ui"
                style={{ flex: 1, fontSize: '0.75rem', justifyContent: 'center' }}
                onClick={() => handleSplitTotal(120)}
                title="Split 120 occupants equally across floors"
              >
                Split 120
              </button>
              <button
                className="btn-ui"
                style={{ flex: 1, fontSize: '0.75rem', justifyContent: 'center' }}
                onClick={handleRandomizePeople}
                title="Randomize occupant spawn points"
              >
                Randomize
              </button>
              <button
                className="btn-ui"
                style={{ flex: 1, fontSize: '0.75rem', justifyContent: 'center' }}
                onClick={handleClearPeople}
                title="Clear all occupants"
              >
                Clear
              </button>
            </div>
          </div>
        </aside>

        {/* ================================================================== */}
        {/* Column 2: Mission Canvas Theater (Center) */}
        {/* ================================================================== */}
        <section className="canvas-theater">
          {/* Live Alert HUD Strip */}
          <div className="alert-hud-strip">
            <div className="alert-hud-left" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', overflow: 'hidden' }}>
              <Radio size={16} className="pulse-dot" style={{ minWidth: 16, color: '#ef4444' }} />
              <span style={{ fontWeight: 600 }}>{announcementText}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
              <button
                className="btn-ctrl-secondary"
                style={{ padding: '3px 8px', fontSize: '0.72rem', gap: '4px' }}
                onClick={() => speakAnnouncement(announcementText, true)}
                title="Play Audio Speech Alert"
              >
                <Volume2 size={13} /> Speak
              </button>
              <button
                className="btn-ctrl-secondary"
                style={{ padding: '3px 8px', fontSize: '0.72rem', gap: '4px', color: '#4ade80', borderColor: 'rgba(34, 197, 94, 0.4)' }}
                onClick={() => setShowPhoneModal(true)}
                title="Mobile Phone Connection"
              >
                <Smartphone size={13} /> 7200673492
              </button>
              <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 700, letterSpacing: '0.04em' }}>LIVE BROADCAST</span>
            </div>
          </div>

          {/* Blueprint Canvas Viewport */}
          <div className="canvas-viewport-card">
            {fireAlarmActive && (
              <div className="fire-alarm-banner">
                <div className="fire-alarm-banner-left">
                  <span className="alarm-strobe-icon">🚨</span>
                  <div>
                    <div className="alarm-title">EMERGENCY FIRE ALARM ACTIVATED</div>
                    <div className="alarm-subtitle">Audio Siren Active · Lifts Grounded · Follow Green Emergency Exit Signs</div>
                  </div>
                  {(simRef.current?.sprinklersActive || fireAlarmActive) && (
                    <div className="sprinkler-badge-active">
                      💦 Localized Overhead Sprinklers: ACTIVE (Targeting Fire Zone)
                    </div>
                  )}
                </div>
                <div className="fire-alarm-actions">
                  <button
                    className={`alarm-silence-btn ${fireAlarmMuted ? 'muted' : ''}`}
                    onClick={() => setFireAlarmMuted(m => !m)}
                    title={fireAlarmMuted ? 'Unmute siren' : 'Silence alarm siren'}
                  >
                    {fireAlarmMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    <span>{fireAlarmMuted ? 'Siren Muted' : 'Silence Siren'}</span>
                  </button>
                  <button
                    className="alarm-silence-btn"
                    onClick={() => {
                      setFireAlarmActive(false);
                      addLog('🔕 Fire alarm manually reset.');
                    }}
                  >
                    Reset Alarm
                  </button>
                </div>
              </div>
            )}
            <div className="canvas-top-overlay">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div className="viewport-badge">
                  <Compass size={13} />
                  <span>{activeFloor < 0 ? 'PERSPECTIVE: 3D CONNECTED MULTI-FLOOR' : `LEVEL: ${FN[activeFloor].toUpperCase()}`}</span>
                </div>
                <button
                  id="overlay-btn-play-toggle"
                  className={`btn-ctrl-primary ${simRunning ? 'running' : ''}`}
                  style={{ padding: '0.2rem 0.65rem', fontSize: '0.78rem', height: '26px' }}
                  onClick={handleToggleSimulation}
                >
                  {simRunning ? <Pause size={12} /> : <Play size={12} />}
                  <span>{simRunning ? 'Pause Engine' : 'Start Evacuation'}</span>
                </button>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className="viewport-badge">SCALE: 1:50 · 40x25 CELLS</span>
                <span className="viewport-badge" style={{ color: '#34d399' }}>● 60 FPS</span>
              </div>
            </div>

            <canvas
              ref={canvasRef}
              id="map"
              width="800"
              height="500"
              onPointerDown={handlePointerDown}
            />
          </div>

          {/* Mission Playback Controls Strip */}
          <div className="playback-controls-bar">
            <div className="playback-btn-group">
              <button
                id="btn-play-toggle"
                className={`btn-ctrl-primary ${simRunning ? 'running' : ''}`}
                onClick={handleToggleSimulation}
              >
                {simRunning ? <Pause size={15} /> : <Play size={15} />}
                <span>{simRunning ? 'Pause Engine' : 'Start Evacuation'}</span>
              </button>

              <button id="btn-reset-engine" className="btn-ctrl-secondary" onClick={resetSim}>
                <RotateCcw size={15} /> Reset
              </button>

              <button
                id="btn-quick-benchmark"
                className="btn-ctrl-secondary"
                style={{ borderColor: 'rgba(167, 139, 250, 0.4)', color: '#c4b5fd' }}
                onClick={() => handleSelectDeckTab('compare')}
                title="Run Dual-Scenario Evacuation Benchmark"
              >
                <GitCompare size={15} className={isComparing ? 'spin-icon' : ''} />
                <span>{isComparing ? 'Benchmarking...' : 'Benchmark'}</span>
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--fg-muted)' }}>
                <span>Speed:</span>
                <input
                  id="speed-range"
                  type="range"
                  min="1"
                  max="12"
                  value={simSpeed}
                  onChange={e => setSimSpeed(parseInt(e.target.value))}
                  style={{ width: '80px' }}
                />
                <span style={{ fontFamily: 'var(--font-mono)', minWidth: '22px' }}>{simSpeed}x</span>
              </div>
            </div>

            <div className="toggles-cluster">
              <label className="toggle-item">
                <input type="checkbox" checked={tHeat} onChange={e => setTHeat(e.target.checked)} />
                Heatmap
              </label>
              <label className="toggle-item">
                <input type="checkbox" checked={tRoutes} onChange={e => setTRoutes(e.target.checked)} />
                Routes
              </label>
              <label className="toggle-item">
                <input
                  type="checkbox"
                  checked={tSmoke}
                  onChange={e => {
                    setTSmoke(e.target.checked);
                    if (simRef.current) simRef.current.tSmoke = e.target.checked;
                  }}
                />
                Smoke
              </label>
              <label className="toggle-item">
                <input type="checkbox" checked={tNames} onChange={e => setTNames(e.target.checked)} />
                Names
              </label>
              <label className="toggle-item">
                <input type="checkbox" checked={tSpread} onChange={e => setTSpread(e.target.checked)} />
                Spread
              </label>
              <label className="toggle-item">
                <input type="checkbox" checked={tVoice} onChange={e => setTVoice(e.target.checked)} />
                {tVoice ? <Volume2 size={14} /> : <VolumeX size={14} />} Voice
              </label>
              <button
                className="btn-ctrl-secondary"
                style={{
                  padding: '2px 8px',
                  fontSize: '0.72rem',
                  gap: '4px',
                  background: tacticalMode ? 'rgba(234, 179, 8, 0.25)' : 'transparent',
                  borderColor: tacticalMode ? '#eab308' : 'var(--border-medium)',
                  color: tacticalMode ? '#fef08a' : 'var(--fg-main)'
                }}
                onClick={() => {
                  setTacticalMode(m => !m);
                  if (!tacticalMode) {
                    setActiveDeckTab('tactical');
                    addLog('🚒 Tactical Command Mode ENGAGED: First-responder ingress routing active.');
                  }
                }}
                title="Toggle First-Responder Tactical Command Mode"
              >
                <ShieldAlert size={12} /> {tacticalMode ? 'Tactical ON' : 'Tactical Mode'}
              </button>
            </div>
          </div>

          {/* Floating Legend Footer */}
          <div className="legend-dock">
            <div className="legend-chips">
              <span><i className="dot-indicator" style={{ background: '#2563eb' }}></i> Moving</span>
              <span><i className="dot-indicator" style={{ background: '#f59e0b' }}></i> Queued / Stalled</span>
              <span><i className="dot-indicator" style={{ background: '#16a34a' }}></i> Evacuated</span>
              <span><i className="dot-indicator" style={{ background: '#eab308' }}></i> Squad (SCBA)</span>
              <span><i className="dot-indicator" style={{ background: '#dc2626' }}></i> Incapacitated (+)</span>
              <span><i className="dot-indicator" style={{ background: '#10b981' }}></i> Rescued (In Escort)</span>
              <span><i className="dot-indicator" style={{ background: '#3b82f6' }}></i> Stair Shaft</span>
              <span><i className="dot-indicator" style={{ background: '#94a3b8' }}></i> Lift ✕ (Disabled)</span>
              <span><i className="dot-indicator" style={{ background: '#0ea5e9' }}></i> Flood</span>
              <span><i className="dot-indicator" style={{ background: '#ef4444' }}></i> Fire Hazard</span>
            </div>
            <span style={{ color: 'var(--fg-dim)' }}>Tip: Click any floor while running to add fire. In Tactical Mode, click occupants to direct rescue squad!</span>
          </div>
        </section>

        {/* ================================================================== */}
        {/* Column 3: Intelligence & Analytics Deck (Right) */}
        {/* ================================================================== */}
        <aside className="intelligence-deck">
          {/* Deck Navigation Tabs */}
          <div className="deck-tabs-header">
            {[
              { id: 'tactical', label: 'Tactical', icon: ShieldAlert },
              { id: 'ai', label: 'AI Agents', icon: Sparkles },
              { id: 'analytics', label: 'Analytics', icon: TrendingUp },
              { id: 'compare', label: 'Comparison', icon: GitCompare },
              { id: 'manifest', label: 'Manifest', icon: Users },
              { id: 'logs', label: 'Logs', icon: FileText },
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  id={`tab-btn-${tab.id}`}
                  className={`deck-tab-btn ${activeDeckTab === tab.id ? 'active' : ''}`}
                  onClick={() => handleSelectDeckTab(tab.id)}
                >
                  <Icon size={14} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content Panels */}
          <div className="deck-scroll-body">
            {/* TAB: TACTICAL COMMAND & FIRST RESPONDERS */}
            {activeDeckTab === 'tactical' && (
              <>
                {/* Squad Dispatch & Control Card */}
                <div className="intel-card" id="card-tactical-dispatch">
                  <div className="intel-card-header">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#fef08a' }}>
                      <ShieldAlert size={15} /> First-Responder Command
                    </span>
                    <span className="status-pill-subtle safe" style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#fef08a' }}>
                      {respondersList.length} UNITS DEPLOYED
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem' }}>
                    <p style={{ color: 'var(--fg-muted)', margin: 0, fontSize: '0.76rem' }}>
                      Deploy SCBA-equipped tactical rescue units to penetrate dense smoke corridors, revive incapacitated civilians, and escort victims to safe ground exits.
                    </p>

                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        className="btn-ui"
                        style={{ flex: 1, background: '#ca8a04', color: '#fff', borderColor: '#eab308', justifyContent: 'center', fontSize: '0.74rem' }}
                        onClick={() => {
                          if (simRef.current) {
                            simRef.current.dispatchResponder(`Squad Alpha`, 0);
                            updateUI(true);
                          }
                        }}
                      >
                        🚒 Deploy Squad Alpha
                      </button>
                      <button
                        className="btn-ui"
                        style={{ flex: 1, background: '#0284c7', color: '#fff', borderColor: '#38bdf8', justifyContent: 'center', fontSize: '0.74rem' }}
                        onClick={() => {
                          if (simRef.current) {
                            simRef.current.dispatchResponder(`Squad Bravo`, 1);
                            updateUI(true);
                          }
                        }}
                      >
                        🚒 Deploy Squad Bravo
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        className="btn-ui"
                        style={{ flex: 1, justifyContent: 'center', fontSize: '0.72rem', color: '#fca5a5' }}
                        onClick={() => {
                          if (simRef.current) {
                            simRef.current.recallResponders();
                            updateUI(true);
                          }
                        }}
                      >
                        Recall All Squads
                      </button>
                      <button
                        className="btn-ui"
                        style={{ flex: 1, justifyContent: 'center', fontSize: '0.72rem', color: '#93c5fd' }}
                        onClick={async () => {
                          try {
                            const resp = await fetch('/api/evacuation/tactical-rescue/', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                trapped_occupants: triageQueue.map(t => ({
                                  floor: t.f,
                                  x: t.x,
                                  y: t.y,
                                  name: t.name,
                                  health: t.health,
                                  smoke: t.smokePct / 100
                                }))
                              })
                            });
                            const data = await resp.json();
                            if (data.status === 'success') {
                              addLog(`📋 Server Tactical Rescue Plan generated: ${data.reachable_count}/${data.total_trapped} reachable.`);
                              speakAnnouncement(`Tactical analysis complete. ${data.reachable_count} at-risk victims reachable for rescue.`);
                            }
                          } catch (e) {
                            console.error('Tactical route calc error:', e);
                          }
                        }}
                      >
                        ⚡ Server Triage Plan
                      </button>
                    </div>
                  </div>
                </div>

                {/* Active Responders Status */}
                <div className="intel-card" id="card-responders-status">
                  <div className="intel-card-header">
                    <span>Active Tactical Units Status</span>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>SCBA &amp; Target</span>
                  </div>

                  {respondersList.length === 0 ? (
                    <div style={{ fontSize: '0.76rem', color: 'var(--fg-dim)', padding: '0.5rem 0', textAlign: 'center' }}>
                      No rescue squads currently deployed. Click buttons above to deploy first responders.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {respondersList.map((r, idx) => (
                        <div key={idx} style={{ padding: '0.45rem 0.6rem', background: 'rgba(0,0,0,0.35)', borderRadius: '5px', borderLeft: '3px solid #eab308' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <b style={{ color: '#fef08a', fontSize: '0.8rem' }}>{r.name} ({r.id})</b>
                            <span style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: r.st === 'inbound' ? '#38bdf8' : (r.st === 'escorting' ? '#34d399' : '#fbbf24')
                            }}>
                              {r.st === 'inbound' ? '➔ INBOUND SEARCH' : (r.st === 'escorting' ? '✓ ESCORTING VICTIM' : '○ IDLE / SCANNING')}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--fg-muted)', marginTop: '3px' }}>
                            <span>Position: {FN[r.f]} ({r.x}, {r.y})</span>
                            <span>Target: <b style={{ color: '#fff' }}>{r.targetAgent ? r.targetAgent.name : 'None'}</b></span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--fg-dim)', marginTop: '2px' }}>
                            <span>SCBA Tank: <span style={{ color: r.air < 30 ? '#ef4444' : '#34d399' }}>{Math.round(r.air)}%</span></span>
                            <span>Total Rescued: <b style={{ color: '#34d399' }}>{r.rescuedCount}</b></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Priority Rescue Triage Queue */}
                <div className="intel-card" id="card-triage-queue">
                  <div className="intel-card-header">
                    <span>Priority Rescue Triage Queue</span>
                    <span className="status-pill-subtle danger">{triageQueue.length} AT-RISK</span>
                  </div>

                  {triageQueue.length === 0 ? (
                    <div style={{ fontSize: '0.76rem', color: '#34d399', padding: '0.4rem 0', textAlign: 'center' }}>
                      ✓ No occupants currently trapped or incapacitated by toxic smoke.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '240px', overflowY: 'auto' }}>
                      {triageQueue.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '0.4rem 0.55rem',
                            background: item.status.includes('Incapacitated') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(0,0,0,0.25)',
                            borderRadius: '4px',
                            borderLeft: `3px solid ${item.status.includes('Incapacitated') ? '#ef4444' : '#f59e0b'}`,
                            fontSize: '0.75rem'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <b style={{ color: '#fff' }}>#{idx + 1} {item.name}</b>
                            <span style={{ color: item.health < 40 ? '#f87171' : '#fbbf24', fontWeight: 700 }}>
                              HP: {item.health}%
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fg-muted)', fontSize: '0.71rem', marginTop: '2px' }}>
                            <span>{item.floor} ({item.x}, {item.y})</span>
                            <span style={{ color: '#fca5a5' }}>Smoke: {item.smokePct}%</span>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: item.rescuedBy ? '#34d399' : (item.status.includes('Incapacitated') ? '#ef4444' : '#f59e0b'), marginTop: '2px' }}>
                            Status: {item.status}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* TAB 1: AI AGENTS */}
            {activeDeckTab === 'ai' && (
              <>
                {/* 🤖 Missing-Person Agent */}
                <div className="intel-card" id="card-missing-person">
                  <div className="intel-card-header">
                    <span>🤖 Missing-Person Tracker Agent</span>
                    <span className={`status-pill-subtle ${missingAgentReport?.highRisk ? 'danger' : 'safe'}`}>
                      {missingAgentReport?.highRisk ? `${missingAgentReport.highRisk} HIGH RISK` : 'ALL CLEAR'}
                    </span>
                  </div>
                  {missingAgentReport ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--fg-muted)', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Accounted Safe:</span>
                        <b style={{ color: '#34d399' }}>{missingAgentReport.done} / {missingAgentReport.total}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Occupants Inside:</span>
                        <b style={{ color: '#fff' }}>{missingAgentReport.remaining}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Stalled (&gt;20s):</span>
                        <b style={{ color: '#fbbf24' }}>{missingAgentReport.stalled}</b>
                      </div>

                      {missingAgentReport.flagged.length > 0 && (
                        <div style={{ marginTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.4rem' }}>
                          <span style={{ fontSize: '0.74rem', color: '#f87171', fontWeight: 700 }}>RESCUE PRIORITY TARGETS:</span>
                          {missingAgentReport.flagged.map((r, i) => (
                            <div key={i} style={{ padding: '2px 0', color: r.risk >= 3 ? '#fca5a5' : '#fde68a', fontSize: '0.75rem' }}>
                              • {r.a.name} ({FN[r.a.f]} @ {r.a.x},{r.a.y}) — {r.why}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : <div>Initializing tracker...</div>}
                </div>

                {/* 🤖 Safe-Zone Verification Agent */}
                <div className="intel-card" id="card-safe-zone">
                  <div className="intel-card-header">
                    <span>🤖 Safe-Zone Verification Agent</span>
                    <span className="status-pill-subtle safe">AUTOMATED AUDIT</span>
                  </div>
                  {safeZoneReport ? (
                    <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {safeZoneReport.zones.map((z, idx) => (
                        <div key={idx} style={{ padding: '0.35rem 0.5rem', background: 'rgba(0,0,0,0.25)', borderRadius: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <b style={{ color: '#fff' }}>{z.name}</b>
                            <span className={z.st === 0 ? 'ai-item-ok' : z.st === 1 ? 'ai-item-warn' : 'ai-item-bad'} style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                              {z.st === 0 ? '✓ VERIFIED SAFE' : z.st === 1 ? '⚠ CAUTION' : '✕ UNSAFE'}
                            </span>
                          </div>
                          <div style={{ color: 'var(--fg-dim)', fontSize: '0.72rem', marginTop: '2px' }}>{z.notes.join(' · ')}</div>
                        </div>
                      ))}
                      <div style={{ padding: '0.45rem', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '4px', borderLeft: '3px solid #3b82f6', marginTop: '0.2rem' }}>
                        <b style={{ color: '#93c5fd', fontSize: '0.75rem' }}>Tactical Recommendation:</b>
                        <div style={{ color: 'var(--fg-muted)', fontSize: '0.75rem' }}>{safeZoneReport.recommendation}</div>
                      </div>
                    </div>
                  ) : <div>Evaluating exits...</div>}
                </div>

                {/* Possible Routes per floor */}
                <div className="intel-card" id="card-routes-advisor">
                  <div className="intel-card-header">
                    <span>🧭 Multi-Floor Routes Advisor</span>
                    <span style={{ fontSize: '0.7rem', color: '#60a5fa' }}>★ BEST / ↳ FALLBACK</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.78rem' }}>
                    {possibleRoutes.map(r => (
                      <div key={r.f} style={{ padding: '0.4rem', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: '2px' }}>
                          <span style={{ color: FC[r.f] }}>{FN[r.f]}</span>
                          <span style={{ color: r.rem ? 'var(--fg-muted)' : '#34d399' }}>{r.rem ? `${r.rem} inside` : '✓ Cleared'}</span>
                        </div>
                        {r.ways.map(w => (
                          <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', color: w.blocked ? '#f87171' : w.name.includes('★') || w === r.ways[0] ? '#34d399' : 'var(--fg-muted)' }}>
                            <span>{w.blocked ? `✕ ${w.name}` : `${w === r.ways[0] ? '★' : '↳'} ${w.name}`}</span>
                            <span>{w.blocked ? 'Blocked' : `~${w.eta ? w.eta.toFixed(0) : 0}s (${w.n} ppl)`}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* TAB 2: FLOW ANALYTICS */}
            {activeDeckTab === 'analytics' && (
              <>
                <div className="intel-card" id="card-remaining-chart">
                  <div className="intel-card-header">
                    <span>Occupants Remaining vs Time</span>
                    <span style={{ fontSize: '0.7rem', color: '#38bdf8' }}>REAL-TIME CURVE</span>
                  </div>
                  <canvas ref={chartCanvasRef} width="300" height="135" style={{ width: '100%', borderRadius: 4 }} />
                  <div style={{ fontSize: '0.72rem', color: 'var(--fg-dim)', marginTop: '4px', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span><i className="dot-indicator" style={{ background: '#38bdf8' }}></i> Total</span>
                    {Array.from({ length: baseRef.current.nf }, (_, f) => (
                      <span key={f}><i className="dot-indicator" style={{ background: FC[f] }}></i> {FN[f]}</span>
                    ))}
                  </div>
                </div>

                <div className="intel-card" id="card-exit-flow">
                  <div className="intel-card-header">
                    <span>Exit Utilization & Queue</span>
                    <span style={{ fontSize: '0.7rem', color: '#34d399' }}>GROUND LEVEL</span>
                  </div>
                  <table className="clean-deck-table">
                    <thead>
                      <tr><th>Exit</th><th>Flow Cap</th><th>Passed</th><th>Queue Depth</th></tr>
                    </thead>
                    <tbody>
                      {exitStats.map((e, idx) => (
                        <tr key={idx}>
                          <td>{e.name}</td>
                          <td>{e.cap}</td>
                          <td style={{ color: '#34d399', fontWeight: 600 }}>{e.used}</td>
                          <td style={{ color: e.queue > 10 ? '#f87171' : '#fff' }}>{e.queue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="intel-card" id="card-stair-flow">
                  <div className="intel-card-header">
                    <span>Stairwell Throughput</span>
                    <span style={{ fontSize: '0.7rem', color: '#60a5fa' }}>VERTICAL SHAFTS</span>
                  </div>
                  <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                    <table className="clean-deck-table">
                      <thead>
                        <tr><th>Stair</th><th>Flow Cap</th><th>Used</th><th>On Shaft</th></tr>
                      </thead>
                      <tbody>
                        {stairStats.map((s, idx) => (
                          <tr key={idx}>
                            <td>{s.name}</td>
                            <td>{s.cap}</td>
                            <td>{s.used}</td>
                            <td style={{ color: s.onNow > 5 ? '#fbbf24' : '#fff' }}>{s.onNow}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="intel-card" id="card-hotspots-panel">
                  <div className="intel-card-header">
                    <span>Bottlenecks & Hotspots</span>
                    <span className="status-pill-subtle warn">CHOKE POINTS</span>
                  </div>
                  {hotspotsList.length > 0 ? (
                    <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {hotspotsList.map((h, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <span><b>{h.label}</b> · {FN[h.f]} ({h.x},{h.y})</span>
                          <span style={{ color: '#f87171', fontWeight: 700 }}>{h.avg} ppl/cell</span>
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ fontSize: '0.75rem', color: 'var(--fg-dim)' }}>Run simulation to track choke points.</div>}
                </div>
              </>
            )}

            {/* TAB 3: SCENARIO COMPARISON */}
            {activeDeckTab === 'compare' && (
              <div className="comparison-grid">
                <div className="intel-card" id="card-scenario-comparison">
                  <div className="intel-card-header">
                    <span>Scenario Benchmark Analysis</span>
                    <span style={{ fontSize: '0.7rem', color: '#a78bfa', fontWeight: 600 }}>DUAL-RUN SIMULATION</span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--fg-muted)', marginBottom: '0.65rem', lineHeight: 1.4 }}>
                    Dual-run stress test comparing <b>Baseline (Clear Paths)</b> against an <b>Emergency Hazard Blockage at t=8s</b> on the busiest evacuation artery.
                  </p>

                  <button
                    id="btn-trigger-benchmark"
                    className="btn-ctrl-primary"
                    style={{ width: '100%', justifyContent: 'center', marginBottom: '0.85rem', opacity: isComparing ? 0.75 : 1 }}
                    onClick={handleRunComparison}
                    disabled={isComparing}
                  >
                    <GitCompare size={15} className={isComparing ? 'spin-icon' : ''} />
                    <span>{isComparing ? 'Running Benchmark Simulation...' : '⚡ Re-run Comparison Benchmark'}</span>
                  </button>

                  {comparisonResult ? (
                    <div>
                      <table className="clean-deck-table">
                        <thead>
                          <tr>
                            <th>Evacuation Metric</th>
                            <th style={{ color: '#34d399' }}>🟢 No Blockage</th>
                            <th style={{ color: '#f87171' }}>🔴 Blockage @8s</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td><b>Total Clearance</b></td>
                            <td style={{ color: '#34d399', fontWeight: 700 }}>{comparisonResult.buildingA}</td>
                            <td style={{ color: '#f87171', fontWeight: 700 }}>{comparisonResult.buildingB}</td>
                          </tr>
                          {comparisonResult.floors?.map(f => (
                            <tr key={f.name}>
                              <td>{f.name}</td>
                              <td>{f.valA}</td>
                              <td>{f.valB}</td>
                            </tr>
                          ))}
                          <tr>
                            <td>Evacuated Total</td>
                            <td>{comparisonResult.evacA}</td>
                            <td>{comparisonResult.evacB}</td>
                          </tr>
                          <tr>
                            <td>Path Re-Routes</td>
                            <td>{comparisonResult.rerA}</td>
                            <td style={{ color: '#fbbf24', fontWeight: 700 }}>{comparisonResult.rerB}</td>
                          </tr>
                        </tbody>
                      </table>

                      <div style={{ marginTop: '0.75rem', padding: '0.65rem', background: 'rgba(245, 158, 11, 0.1)', borderLeft: '3px solid #f59e0b', borderRadius: '4px', fontSize: '0.75rem', color: '#fef3c7', lineHeight: 1.5 }}>
                        <b>Blockage Event:</b> {comparisonResult.how}<br />
                        <b>Evacuation Delta:</b> <span style={{ color: '#f87171', fontWeight: 600 }}>{comparisonResult.impact}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--fg-dim)', fontSize: '0.8rem' }}>
                      {isComparing ? 'Computing multi-floor graph evacuation models...' : 'Click above to run comparative analysis.'}
                    </div>
                  )}
                </div>

                {/* Comparative Evacuation Curve Chart */}
                <div className="intel-card" id="card-comparison-curves">
                  <div className="intel-card-header">
                    <span>Evacuation Curve Comparison</span>
                    <span style={{ fontSize: '0.7rem', color: '#34d399' }}>OCCUPANTS VS TIME</span>
                  </div>
                  <canvas ref={compareChartCanvasRef} width="300" height="135" style={{ width: '100%', borderRadius: 4, background: '#090d14' }} />
                  <div style={{ fontSize: '0.72rem', color: 'var(--fg-dim)', marginTop: '6px', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <span><i className="dot-indicator" style={{ background: '#10b981' }}></i> Baseline (Clear)</span>
                    <span><i className="dot-indicator" style={{ background: '#ef4444' }}></i> Blockage @8s</span>
                    <span style={{ color: '#f87171' }}>┊ Block @8s</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: OCCUPANTS MANIFEST */}
            {activeDeckTab === 'manifest' && (
              <div className="intel-card" id="card-occupant-manifest">
                <div className="intel-card-header">
                  <span>Occupant Manifest Directory</span>
                  <span style={{ fontSize: '0.7rem', color: '#60a5fa' }}>TOTAL: {peopleList.length}</span>
                </div>
                <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                  <table className="clean-deck-table">
                    <thead>
                      <tr><th>Name</th><th>Level</th><th>Status</th><th>Target</th></tr>
                    </thead>
                    <tbody>
                      {peopleList.map(a => (
                        <tr key={a.id}>
                          <td>{a.name}</td>
                          <td>{a.f ? 'F' + a.f : 'G'}</td>
                          <td style={{ color: a.st === 'waiting' ? '#fbbf24' : '#60a5fa' }}>{a.st}</td>
                          <td>{a.ex >= 0 ? (simRef.current?.ex[a.ex]?.refuge ? 'Refuge' : 'Exit ' + String.fromCharCode(65 + a.ex)) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 5: EVENT LOGS */}
            {activeDeckTab === 'logs' && (
              <div className="intel-card" id="card-system-logs">
                <div className="intel-card-header">
                  <span>System Event Log</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--fg-dim)' }}>REAL-TIME TELEMETRY</span>
                </div>
                <div style={{ maxHeight: '380px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--fg-muted)' }}>
                  {eventLogs.map((log, i) => (
                    <div key={i} style={{ padding: '0.25rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{log}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
      </>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* Dedicated Evacuation Route Map Page View */}
      {/* -------------------------------------------------------------------- */}
      {activePage === 'routemap' && (
        <div className="route-map-page-container">
          <div className="route-map-top-bar">
            <div className="route-map-top-left">
              <div className="route-map-page-title">
                <Compass size={20} style={{ color: '#10b981' }} />
                <span>Tactical Evacuation Route Map & Floor Wayfinding</span>
              </div>
              <div className="route-floor-selector">
                {FN.map((floorName, idx) => (
                  <button
                    key={idx}
                    id={`route-floor-btn-${idx}`}
                    className={`route-floor-btn ${routeFloor === idx ? 'active' : ''}`}
                    onClick={() => setRouteFloor(idx)}
                  >
                    {floorName}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
              {customPin && (
                <button
                  className="route-floor-btn"
                  style={{ background: 'rgba(239, 68, 68, 0.2)', borderColor: '#ef4444', color: '#f87171' }}
                  onClick={() => {
                    setCustomPin(null);
                    setCalculatedRoute(null);
                  }}
                >
                  Clear Location Pin
                </button>
              )}
              <button
                className="route-floor-btn"
                style={{ background: 'rgba(59, 130, 246, 0.2)', borderColor: '#3b82f6', color: '#60a5fa' }}
                onClick={() => setActivePage('simulator')}
              >
                Return to Simulator
              </button>
            </div>
          </div>

          <div className="route-map-grid-layout">
            <div className="route-canvas-card">
              <div className="route-canvas-header">
                <div className="viewport-badge" style={{ background: '#10b981', color: '#fff', fontWeight: 700 }}>
                  <span>ACTIVE WAYFINDING: {FN[routeFloor].toUpperCase()} ESCAPE CORRIDORS</span>
                </div>
                <div className="route-canvas-hint">
                  <span>📍 Click anywhere on floor to set "YOU ARE HERE" pin and trace shortest escape path</span>
                </div>
              </div>

              <canvas
                ref={routeCanvasRef}
                width="800"
                height="500"
                onClick={handleRouteCanvasClick}
                style={{
                  borderRadius: '8px',
                  cursor: 'crosshair',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: 'inset 0 0 20px rgba(0,0,0,0.6)'
                }}
              />
            </div>

            <div className="route-sidebar">
              <div className="route-info-card">
                <div className="route-info-title">
                  <Compass size={16} />
                  <span>Interactive Wayfinding Guide</span>
                </div>

                {customPin ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.45rem', background: 'rgba(0,0,0,0.25)', borderRadius: '6px' }}>
                      <span style={{ color: '#94a3b8' }}>Selected Location:</span>
                      <b style={{ color: '#fbbf24' }}>{FN[customPin.f]} ({customPin.x}, {customPin.y})</b>
                    </div>

                    {calculatedRoute && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                          <div style={{ padding: '0.5rem', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '6px' }}>
                            <div style={{ fontSize: '0.7rem', color: '#34d399', textTransform: 'uppercase' }}>Target Exit</div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>EXIT {calculatedRoute.exitLetter}</div>
                          </div>
                          <div style={{ padding: '0.5rem', background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '6px' }}>
                            <div style={{ fontSize: '0.7rem', color: '#60a5fa', textTransform: 'uppercase' }}>Escape Time</div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>~{calculatedRoute.estSec}s <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#94a3b8' }}>({calculatedRoute.distMeters}m)</span></div>
                          </div>
                        </div>

                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, marginTop: '0.2rem' }}>
                          TURN-BY-TURN ESCAPE INSTRUCTIONS:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                          {calculatedRoute.steps.map((st, i) => (
                            <div key={i} className="route-step-item">
                              <span className="route-step-num">0{i + 1}</span>
                              <span className="route-step-text">{st}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5, padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                    👉 <b>How to navigate:</b> Click any room or corridor on the floor plan to pinpoint your exact current location. The AI pathfinder will trace your fastest safe route to an open exit.
                  </div>
                )}
              </div>

              <div className="route-info-card">
                <div className="route-info-title">
                  <ShieldAlert size={16} />
                  <span>Ground Exit Evacuation Status</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {baseRef.current.ex.filter(e => !e.refuge).map((e, idx) => {
                    const letter = String.fromCharCode(65 + idx);
                    const isBlocked = simRef.current ? simRef.current.blocked(e.n) : false;
                    return (
                      <div key={idx} className={`route-exit-card ${isBlocked ? 'blocked' : ''}`}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.82rem' }}>
                          <span>{isBlocked ? '⛔' : '🟢'}</span>
                          <span>EXIT {letter} (Ground Level)</span>
                        </div>
                        <span style={{ fontSize: '0.74rem', fontWeight: 800 }}>
                          {isBlocked ? 'BLOCKED BY FIRE' : `CLEAR · ${e.cap} ppl/s`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="route-info-card">
                <div className="route-info-title">
                  <Flame size={16} />
                  <span>Life Safety & Suppression Systems</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.76rem', color: '#cbd5e1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                    <span>💦 Localized Overhead Sprinklers:</span>
                    <b style={{ color: (simRef.current?.sprinklersActive || fireAlarmActive) ? '#38bdf8' : '#34d399' }}>
                      {(simRef.current?.sprinklersActive || fireAlarmActive) ? 'ZONE-TARGETED DISCHARGE' : 'ARMED & PRESSURIZED'}
                    </b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                    <span>🧯 Fire Extinguishers:</span>
                    <b style={{ color: '#34d399' }}>2 Stations per floor (Corridors)</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                    <span>🚨 Audio Voice Siren:</span>
                    <b style={{ color: fireAlarmActive ? '#f87171' : '#34d399' }}>{fireAlarmActive ? 'SIREN SOUNDING' : 'STANDBY'}</b>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* -------------------------------------------------------------------- */}
      {/* Technical Architecture Modal Dialog */}
      {/* -------------------------------------------------------------------- */}
      {showDocModal && (
        <div className="modal-overlay" onClick={() => setShowDocModal(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">📖 SC-07 Smart Cities Evacuation Planner Specifications</span>
              <button className="modal-close-btn" onClick={() => setShowDocModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p><b>1. 3D Multi-Floor Graph Traversal:</b> The building is represented as a directed graph $\mathcal{G} = (\mathcal{V}, \mathcal{E})$ where each node is $(f, x, y)$. Walkable orthogonal neighbors form in-floor edges, while vertical stair shafts link $(f, x, y)$ with $(f \pm 1, x, y)$.</p>
              <p><b>2. Density-Dependent Entering Cost:</b> Movement speed throttles under crowd congestion according to $C = 1 + 2 \cdot \text{density}$ (stairwells $3 + 4 \cdot \text{density}$). Fire hazards, walls, and disabled elevators enforce $\infty$ cost.</p>
              <p><b>3. Exit Capacity & Queue Queueing:</b> Ground exits and stairwells feature rate-limited flow capacities (ppl/s) modeled via a token-bucket release engine. Agents choose the optimal route balancing path cost and queue depth.</p>
              <p><b>4. Autonomous Multi-Agent AI:</b> The <i>Missing-Person Agent</i> tracks roll calls and flags cut-off occupants by rescue priority; the <i>Safe-Zone Verification Agent</i> performs automated structural audits on escape points.</p>
              <p><b>5. Django SQLite Backend:</b> Features persistent schema models for blueprint layouts and scenario benchmark reports with full REST API interoperability.</p>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* Mobile Wi-Fi & Phone Dispatch Modal Dialog */}
      {/* -------------------------------------------------------------------- */}
      {showPhoneModal && (
        <div className="modal-overlay" onClick={() => setShowPhoneModal(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Smartphone size={18} color="#4ade80" /> Mobile Wi-Fi Connection & Emergency Dispatch
              </span>
              <button className="modal-close-btn" onClick={() => setShowPhoneModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* Step 1: Wi-Fi Access details */}
              <div style={{ background: 'rgba(30, 41, 59, 0.7)', borderRadius: '8px', padding: '1rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    1. Connect Phone to Wi-Fi
                  </span>
                  <span className="status-pill-subtle safe">● WI-FI ACTIVE</span>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--fg-muted)', margin: '0 0 0.75rem 0' }}>
                  Ensure your phone is connected to the same Wi-Fi network as this computer, then open this URL in your mobile browser:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: '#090d14', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-medium)' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>1. Live Command View</span>
                      <code style={{ fontSize: '0.88rem', color: '#60a5fa', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        {getMobileAppUrl()}
                      </code>
                    </div>
                    <button
                      className="btn-ctrl-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      onClick={() => {
                        navigator.clipboard.writeText(getMobileAppUrl());
                        setPhoneAlertStatus('Live view URL copied! Open in phone browser.');
                      }}
                    >
                      <Copy size={13} /> Copy
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: '#161e2e', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #0284c7' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.7rem', color: '#38bdf8', textTransform: 'uppercase', fontWeight: 800 }}>⚡ 2. Zero-Click SMS Launch</span>
                      <code style={{ fontSize: '0.88rem', color: '#fbbf24', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        {getMobileSmsRedirectUrl()}
                      </code>
                    </div>
                    <button
                      className="btn-ctrl-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.75rem', borderColor: '#38bdf8', color: '#38bdf8' }}
                      onClick={() => {
                        navigator.clipboard.writeText(getMobileSmsRedirectUrl());
                        setPhoneAlertStatus('Direct SMS URL copied! Open on phone to jump straight into SMS app.');
                      }}
                    >
                      <Copy size={13} /> Copy
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 2: Instant QR Code Scan */}
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'rgba(30, 41, 59, 0.7)', borderRadius: '8px', padding: '1rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ background: '#fff', padding: '6px', borderRadius: '8px', flexShrink: 0 }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&margin=2&data=${encodeURIComponent(getMobileAppUrl())}`}
                    alt="Scan Wi-Fi QR Code"
                    width="130"
                    height="130"
                    style={{ display: 'block', borderRadius: '4px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f1f5f9' }}>
                    Scan with Phone Camera
                  </span>
                  <p style={{ fontSize: '0.78rem', color: 'var(--fg-muted)', margin: 0, lineHeight: 1.4 }}>
                    Point your mobile camera at this QR code to instantly launch the live AEGIS Command Center on your phone.
                  </p>
                  <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 600 }}>
                    ✓ No app installation required · Real-time 60 FPS graph sync
                  </span>
                </div>
              </div>

              {/* Step 3: Emergency SMS Cellular Dispatch to 7200673492 */}
              <div style={{ background: 'rgba(30, 41, 59, 0.7)', borderRadius: '8px', padding: '1rem', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    2. Emergency Cellular SMS Dispatch
                  </span>
                  <span style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#38bdf8' }}>
                    +91 {EMERGENCY_PHONE}
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '0 0 0.65rem 0' }}>
                  ⚡ When an evacuation alert begins or fire is placed, an emergency SMS is <b>automatically sent</b> to this phone.
                </p>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.65rem' }}>
                  <button
                    className="btn-ctrl-primary"
                    style={{ flex: 1, justifyContent: 'center', background: '#dc2626' }}
                    onClick={() => handleSendPhoneAlert('fire')}
                  >
                    <Flame size={15} /> Send Fire SMS to Phone
                  </button>
                  <button
                    className="btn-ctrl-primary"
                    style={{ flex: 1, justifyContent: 'center', background: '#2563eb' }}
                    onClick={() => handleSendPhoneAlert('flood')}
                  >
                    <Waves size={15} /> Send Flood SMS to Phone
                  </button>
                </div>

                {phoneAlertStatus && (
                  <div style={{ marginTop: '0.65rem', padding: '0.5rem', background: 'rgba(34, 197, 94, 0.1)', borderLeft: '3px solid #34d399', borderRadius: '4px', fontSize: '0.78rem', color: '#86efac' }}>
                    {phoneAlertStatus}
                  </div>
                )}

                {phoneAlertUrl && (
                  <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <a
                      href={phoneAlertUrl}
                      className="btn-ctrl-primary"
                      style={{
                        background: '#0284c7',
                        borderColor: '#38bdf8',
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        padding: '0.65rem 1rem',
                        fontWeight: 700,
                        color: '#fff'
                      }}
                    >
                      <Mail size={16} /> Open Native SMS Messages App (+91 {EMERGENCY_PHONE})
                    </a>
                    {phoneAlertMsg && (
                      <div style={{
                        background: '#090d14',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.08)',
                        fontSize: '0.76rem',
                        color: '#cbd5e1',
                        whiteSpace: 'pre-line',
                        lineHeight: 1.45,
                        fontFamily: 'var(--font-mono)'
                      }}>
                        {phoneAlertMsg}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 4: IP Address Configuration Location */}
              <div style={{ fontSize: '0.76rem', color: 'var(--fg-dim)', background: '#0b111e', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid var(--border-medium)', lineHeight: 1.5 }}>
                ℹ️ <b>Where to enter your IPv4 address:</b> Open <code>frontend/src/config.js</code> line 11: <br />
                <code style={{ color: '#fbbf24', fontWeight: 700 }}>export const WIFI_LAPTOP_IP = "{WIFI_LAPTOP_IP}";</code>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* Standalone Floor Map QR Code Modal Dialog */}
      {/* -------------------------------------------------------------------- */}
      {showQrModal && (
        <div className="modal-overlay" onClick={() => setShowQrModal(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px', textAlign: 'center' }}>
            <div className="modal-header" style={{ justifyContent: 'space-between' }}>
              <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#38bdf8' }}>
                <QrCode size={19} /> Scan for Mobile Floor Map
              </span>
              <button className="modal-close-btn" onClick={() => setShowQrModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', padding: '1.5rem 1rem' }}>
              
              {/* High Quality Crisp QR Code Image */}
              <div style={{
                background: '#ffffff',
                padding: '12px',
                borderRadius: '12px',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4), 0 0 20px rgba(2, 132, 199, 0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=2&data=${encodeURIComponent(getMobileFloorMapUrl())}`}
                  alt="Scan Floor Map QR Code"
                  width="220"
                  height="220"
                  style={{ display: 'block', borderRadius: '4px' }}
                />
              </div>

              {/* Explanatory text */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxWidth: '420px' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#f8fafc', fontWeight: 700 }}>
                  Dedicated Floor Map View
                </h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.45 }}>
                  Scan with your phone camera or tablet. That web browser page will <b>only display the interactive floor map</b>, escape paths, and live fire indicators.
                </p>
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginTop: '0.3rem', fontSize: '0.78rem', color: '#4ade80', fontWeight: 600 }}>
                  <CheckCircle2 size={14} /> Zero simulator clutter · Map view only · Touch wayfinding
                </div>
              </div>

              {/* URL and Copy Link Card */}
              <div style={{
                width: '100%',
                background: '#090d14',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                boxSizing: 'border-box'
              }}>
                <div style={{ textAlign: 'left', overflow: 'hidden' }}>
                  <span style={{ display: 'block', fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Direct Map URL</span>
                  <code style={{ fontSize: '0.82rem', color: '#38bdf8', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', display: 'block' }}>
                    {getMobileFloorMapUrl()}
                  </code>
                </div>
                <button
                  className="btn-ctrl-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.78rem', whiteSpace: 'nowrap', borderColor: copiedMapUrl ? '#22c55e' : 'var(--border-medium)', color: copiedMapUrl ? '#4ade80' : '#cbd5e1' }}
                  onClick={() => {
                    navigator.clipboard.writeText(getMobileFloorMapUrl());
                    setCopiedMapUrl(true);
                    setTimeout(() => setCopiedMapUrl(false), 2500);
                  }}
                >
                  <Copy size={13} /> {copiedMapUrl ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {/* Direct Open in New Tab or Switch View */}
              <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                <a
                  href={getMobileFloorMapUrl()}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ctrl-primary"
                  style={{
                    flex: 1,
                    textDecoration: 'none',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    color: '#ffffff',
                    padding: '0.65rem 1rem',
                    fontSize: '0.84rem',
                    fontWeight: 600
                  }}
                >
                  <ExternalLink size={15} /> Open in New Tab
                </a>
                <button
                  className="btn-ctrl-secondary"
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    padding: '0.65rem 1rem',
                    fontSize: '0.84rem',
                    fontWeight: 600
                  }}
                  onClick={() => {
                    setShowQrModal(false);
                    setIsMapOnlyMode(true);
                  }}
                >
                  Preview Map Now
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Floating Sensor Telemetry Dock */}
      <HazardAlerts />

      {/* Autonomous Mobile Emergency Alert Dispatcher */}
      <MobileEmergencyAlert />

      {/* Interactive Fire Safety & Evacuation Certification Quiz */}
      <SafetyQuizModal isOpen={showQuizModal} onClose={() => setShowQuizModal(false)} />
      
    </div>
  );
}
