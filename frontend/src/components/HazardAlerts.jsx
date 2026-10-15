import React, { useState, useEffect } from 'react';
import { AlertTriangle, Flame, Waves, CheckCircle2, X } from 'lucide-react';
import { WIFI_LAPTOP_IP, EMERGENCY_PHONE } from '../config';
import './HazardAlerts.css';

export default function HazardAlerts() {
  const [alerts, setAlerts] = useState([
    {
      id: 1,
      type: 'safe',
      title: 'Active Sensor Monitoring',
      message: 'Autonomous thermal sensors active across Floors 0-3.',
      time: 'LIVE',
      severity: 'info'
    }
  ]);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    const pollLatest = async () => {
      try {
        const resp = await fetch('/api/evacuation/latest-alert/');
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.alert && data.alert.active) {
            setAlerts(prev => {
              if (prev.some(a => a.id === 'emergency-live')) return prev;
              return [
                {
                  id: 'emergency-live',
                  type: data.alert.hazard_type || 'fire',
                  title: `🚨 ${data.alert.incident || 'FIRE on Ground'}`,
                  message: `${data.alert.elevators} ${data.alert.safe_exit} (+91 ${EMERGENCY_PHONE})`,
                  time: 'NOW',
                  severity: 'danger'
                },
                ...prev.filter(a => a.id !== 'emergency-live')
              ];
            });
          } else {
            // Remove emergency-live alert when alert is cleared / standby
            setAlerts(prev => prev.filter(a => a.id !== 'emergency-live'));
          }
        }
      } catch (e) {}
    };

    pollLatest();
    const pollInterval = setInterval(pollLatest, 3000);

    return () => {
      clearInterval(pollInterval);
    };
  }, []);

  const dismissAlert = (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  if (!alerts.length) return null;

  return (
    <div className="hazard-alerts-container" id="hazard-alerts-dock">
      <div className="hazard-alerts-header">
        <div className="hazard-alerts-title">
          <AlertTriangle size={14} className="hazard-alert-icon" />
          <span>Real-Time Sensor Telemetry</span>
        </div>
        <span className={`hazard-ws-pill ${wsConnected ? 'connected' : 'standby'}`}>
          {wsConnected ? '● LIVE WS' : '○ POLLING'}
        </span>
      </div>

      <div className="hazard-alerts-list">
        {alerts.map(alert => (
          <div key={alert.id} className={`hazard-alert-item ${alert.severity}`}>
            <div className="hazard-item-left">
              {alert.type === 'flood' ? (
                <Waves size={14} className="hazard-type-icon flood" />
              ) : alert.type === 'safe' ? (
                <CheckCircle2 size={14} className="hazard-type-icon safe" />
              ) : (
                <Flame size={14} className="hazard-type-icon fire" />
              )}
              <div className="hazard-item-text">
                <div className="hazard-item-headline">
                  <b>{alert.title}</b>
                  <span className="hazard-item-time">{alert.time}</span>
                </div>
                <div className="hazard-item-desc">{alert.message}</div>
              </div>
            </div>
            <button className="hazard-item-close" onClick={() => dismissAlert(alert.id)}>
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}