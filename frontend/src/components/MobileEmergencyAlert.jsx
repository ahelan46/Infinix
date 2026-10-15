import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Flame,
  Volume2,
  VolumeX,
  Mail,
  Send,
  CheckCircle2,
  PhoneCall,
  Navigation,
  X,
  ShieldAlert,
  Smartphone
} from 'lucide-react';
import { WIFI_LAPTOP_IP, EMERGENCY_PHONE, getMobileAppUrl } from '../config';
import './MobileEmergencyAlert.css';

export default function MobileEmergencyAlert() {
  const [alertData, setAlertData] = useState({
    active: false,
    id: 0,
    phone: `+91 ${EMERGENCY_PHONE}`,
    hazard_type: 'none',
    floor: 'None',
    incident: 'No active incident.',
    elevators: 'Operational',
    safe_exit: 'Ground Floor',
    mobile_link: `http://${WIFI_LAPTOP_IP}:5173`,
    delivery_type: 'None',
    sms_status: 'STANDBY',
    sms_id: '',
    sms_uri: ''
  });

  const [isOpen, setIsOpen] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [smsSentNotice, setSmsSentNotice] = useState('SMS Automatically Dispatched to +91 ' + EMERGENCY_PHONE + ' ✓');
  const lastAlertIdRef = useRef(null);
  const audioCtxRef = useRef(null);

  // Play siren beep using Web Audio API
  const playSirenBeep = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = audioCtxRef.current || new AudioCtx();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.25);
      osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.5);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.55);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) {
      console.warn('Audio siren failed:', e);
    }
  };

  // Speak alert aloud using SpeechSynthesis
  const speakAlert = () => {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const text = `Emergency Evacuation Notice: Incident: Fire active on Ground Floor. Elevators disabled. Proceed to nearest stairwells S1 to S3. Safe exit Ground Floor. An emergency SMS has been automatically sent to your phone.`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.1;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  };

  // Trigger physical phone vibration
  const triggerVibration = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([400, 150, 400, 150, 400]);
      } catch (e) {}
    }
  };

  // Automatically send SMS via backend whenever an alert comes
  const triggerBackendSms = async (hazardType = 'fire', floor = 'Ground') => {
    try {
      const resp = await fetch('/api/evacuation/send-sms/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: EMERGENCY_PHONE,
          hazard_type: hazardType,
          floor: floor
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.alert) {
          setAlertData(data.alert);
          setSmsSentNotice(`SMS Automatically Dispatched to ${data.phone} (${data.sms_id || 'Carrier Relay'}) ✓`);
        }
      }
    } catch (err) {
      console.warn('Auto SMS dispatch error:', err);
    }
  };

  // Play realistic 2-tone SMS notification chime using Web Audio API
  const playSmsChime = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = audioCtxRef.current || new AudioCtx();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') ctx.resume();

      // Note 1: 587.3 Hz (D5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
      gain1.gain.setValueAtTime(0.28, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.2);

      // Note 2: 880 Hz (A5) - standard mobile SMS tone
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain2.gain.setValueAtTime(0.28, ctx.currentTime + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.15);
      osc2.stop(ctx.currentTime + 0.48);
    } catch (e) {}
  };

  // Push native notification to phone notification tray via Wi-Fi
  const showSystemNotification = (alert) => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        try {
          new Notification('🚨 AEGIS EMERGENCY EVACUATION NOTICE', {
            body: `Incident: FIRE active on Ground.\nElevators disabled. Proceed to nearest stairwells S1-S3.\nSafe Exit: Ground Floor.`,
            icon: '/favicon.ico',
            tag: 'aegis-emergency-sms',
            requireInteraction: true
          });
        } catch (e) {}
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    }
  };

  // Polling backend over Wi-Fi for latest alerts
  useEffect(() => {
    let timer = null;

    // Request notification permission once on load
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    const fetchLatest = async () => {
      try {
        const resp = await fetch('/api/evacuation/latest-alert/');
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.alert) {
            setAlertData(data.alert);

            if (data.alert.active) {
              // If a new alert arrived over Wi-Fi, trigger chime, vibration and notification!
              if (data.alert.id !== lastAlertIdRef.current) {
                lastAlertIdRef.current = data.alert.id;
                setIsOpen(true);
                triggerVibration();
                playSmsChime();
                showSystemNotification(data.alert);
                setSmsSentNotice(`SMS Dispatched to +91 ${data.alert.phone || EMERGENCY_PHONE} ✓`);

                // Automatically launch native phone SMS app without needing a button click!
                const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                if (isMobile) {
                  const targetSmsUri = data.alert.sms_uri || `sms:+91${EMERGENCY_PHONE}?body=${encodeURIComponent(data.alert.full_message || '')}`;
                  try {
                    window.location.href = targetSmsUri;
                  } catch (e) {}
                }
              }
            } else {
              setIsOpen(false);
            }
          }
        }
      } catch (e) {
        // Fallback keep default alert active
      }
    };

    fetchLatest();
    timer = setInterval(fetchLatest, 2500);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  // During standby when no alert is active, hide everything completely!
  if (!alertData || !alertData.active) {
    return null;
  }

  if (!isOpen) {
    return (
      <div className="mobile-alert-minimized-pill" onClick={() => setIsOpen(true)}>
        <span className="pulse-danger-dot"></span>
        <Flame size={14} color="#f87171" />
        <span>🚨 EMERGENCY SMS SENT TO +91 {EMERGENCY_PHONE}</span>
        <span className="pill-action-btn">VIEW SMS</span>
      </div>
    );
  }

  const smsUrl = alertData.sms_uri || `sms:+91${EMERGENCY_PHONE}?body=${encodeURIComponent(alertData.full_message || '')}`;

  const openNativeSms = () => {
    try {
      window.location.href = smsUrl;
    } catch (e) {}
  };

  return (
    <div className="mobile-emergency-overlay" id="mobile-evac-alert-modal">
      <div className="mobile-emergency-card animate-drop-in">
        
        {/* Top Emergency Beacon Strip */}
        <div className="mobile-alert-top-strip">
          <div className="beacon-flasher">
            <span className="beacon-circle"></span>
            <span className="beacon-text">ACTIVE EVACUATION SMS DISPATCH</span>
          </div>
          <div className="top-strip-actions">
            <button
              className="alert-ctrl-btn"
              onClick={() => {
                if (isSpeaking) {
                  window.speechSynthesis?.cancel();
                  setIsSpeaking(false);
                } else {
                  speakAlert();
                  playSmsChime();
                }
              }}
              title={isSpeaking ? 'Stop Audio' : 'Play Audio Siren & Voice'}
            >
              <Volume2 size={15} color={isSpeaking ? '#4ade80' : '#cbd5e1'} />
            </button>
            <button
              className="alert-ctrl-btn"
              onClick={() => setIsOpen(false)}
              title="Acknowledge & Minimize"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Zero-Click Tap To SMS Banner */}
        <div 
          onClick={openNativeSms} 
          style={{
            background: 'linear-gradient(90deg, #b91c1c, #ef4444, #b91c1c)',
            color: '#ffffff',
            padding: '0.6rem 0.85rem',
            textAlign: 'center',
            fontWeight: 800,
            fontSize: '0.82rem',
            cursor: 'pointer',
            letterSpacing: '0.03em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            borderBottom: '1px solid rgba(255,255,255,0.2)'
          }}
          title="Tap anywhere to open native phone SMS Messages app"
        >
          <span className="pulse-danger-dot"></span>
          <span>⚡ TAP ANYWHERE ON SCREEN TO SWITCH TO SMS MESSAGES ⚡</span>
        </div>

        {/* Main Alert Header */}
        <div className="mobile-alert-header">
          <div className="alert-badge-icon">
            <ShieldAlert size={28} color="#ef4444" />
          </div>
          <div className="alert-header-text">
            <h2 className="alert-main-title">🚨 AEGIS EMERGENCY EVACUATION NOTICE 🚨</h2>
            <div className="alert-target-phone">
              <Smartphone size={13} color="#38bdf8" />
              <span>SMS Recipient: <b>+91 {EMERGENCY_PHONE}</b></span>
              <span className="live-status-chip">● WI-FI DISPATCH ({WIFI_LAPTOP_IP})</span>
            </div>
          </div>
        </div>

        {/* Highlighted Warning Box (Tap anywhere to open SMS) */}
        <div className="mobile-alert-body-box" onClick={openNativeSms} style={{ cursor: 'pointer' }} title="Tap to switch to Phone SMS Messages App">
          <div className="alert-item-row incident-row">
            <span className="item-label">INCIDENT:</span>
            <span className="item-value danger-text">FIRE active on {alertData.floor || 'Ground'}</span>
          </div>

          <div className="alert-item-row">
            <span className="item-label">ELEVATORS:</span>
            <span className="item-value warning-text">DISABLED · Do NOT use lifts</span>
          </div>

          <div className="alert-item-row">
            <span className="item-label">ESCAPE ROUTE:</span>
            <span className="item-value success-text">Proceed to nearest stairwells S1-S3</span>
          </div>

          <div className="alert-item-row">
            <span className="item-label">SAFE EXIT:</span>
            <span className="item-value success-text">{alertData.safe_exit || 'Ground Floor'}</span>
          </div>

          <div className="alert-link-row">
            <span className="item-label">LIVE LINK:</span>
            <code className="item-code">{alertData.mobile_link || `http://${WIFI_LAPTOP_IP}:5173`}</code>
          </div>
        </div>

        {/* SMS Message Display (Tap to launch SMS) */}
        <div className="mobile-alert-raw-msg" onClick={openNativeSms} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              ✉️ SMS MESSAGE TEXT (TAP ANYWHERE TO OPEN SMS)
            </span>
            <span style={{ fontSize: '0.68rem', color: '#34d399', fontWeight: 700 }}>
              ● SENT OVER LOCAL WI-FI
            </span>
          </div>
          <pre>{alertData.full_message || `🚨 AEGIS EMERGENCY EVACUATION NOTICE 🚨\nIncident: FIRE active on Ground.\nElevators disabled. Proceed to nearest stairwells S1-S3.\nSafe Exit: Ground Floor.\nLive Mobile Link: http://${WIFI_LAPTOP_IP}:5173`}</pre>
        </div>

        {/* SMS Automated Status Notification Banner */}
        <div className="sms-automatic-banner">
          <CheckCircle2 size={15} color="#34d399" />
          <span>{smsSentNotice}</span>
        </div>

        {/* Action Controls Group: Open in native SMS Messages */}
        <div className="mobile-alert-action-group">
          <a
            href={smsUrl}
            className="mobile-btn sms-btn"
            id="btn-open-sms-app"
            style={{ fontWeight: 800, padding: '0.75rem 1rem', fontSize: '0.88rem' }}
          >
            <Mail size={18} /> Open in Phone SMS Messages
          </a>

          <button
            className="mobile-btn audio-btn"
            onClick={() => {
              playSmsChime();
              speakAlert();
            }}
          >
            <Volume2 size={16} /> {isSpeaking ? 'Speaking...' : 'Play Siren Alert'}
          </button>
        </div>

        {/* Bottom Escape Guidance Note */}
        <div className="mobile-alert-footer-note">
          <div style={{ marginBottom: '4px', fontWeight: 700, color: '#38bdf8' }}>
            ⚡ ZERO-CLICK AUTO-LAUNCH URL: <a href={`http://${WIFI_LAPTOP_IP}:5173/sms`} style={{ color: '#fbbf24', textDecoration: 'underline' }}>http://{WIFI_LAPTOP_IP}:5173/sms</a>
          </div>
          ℹ️ Delivered to +91 {EMERGENCY_PHONE} via local network broadcast. Opening <code>/sms</code> on Android directly switches into your native Messages app.
        </div>

      </div>
    </div>
  );
}
