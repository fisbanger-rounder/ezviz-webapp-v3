import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Play, Video, Calendar, AlertCircle, Info, Grid, Square, PlayCircle, Menu, Download, Wifi, WifiOff, LogOut, Eye, EyeOff, User, Lock, Server, RefreshCw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Move, Minus, Plus, Volume2, VolumeX, Bell, Music, Radio, Volume1 } from 'lucide-react';
import { format } from 'date-fns';
import { EZUIKitPlayer } from 'ezuikit-js';

// Global type definition for EZUIKit
declare global {
  interface Window {
    EZUIKit: unknown;
  }
}

// ── Appwrite Function config (injected at build time via .env.local) ────────
// Set these three values in your .env.local file.
// VITE_APPWRITE_ENDPOINT   → e.g. https://cloud.appwrite.io/v1
// VITE_APPWRITE_PROJECT_ID → your Appwrite Project ID
// VITE_APPWRITE_FUNCTION_ID → the ID of the deployed ezviz-login function
const APPWRITE_ENDPOINT: string =
  import.meta.env.VITE_APPWRITE_ENDPOINT ?? 'https://cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID: string =
  import.meta.env.VITE_APPWRITE_PROJECT_ID ?? '';
const APPWRITE_FUNCTION_ID: string =
  import.meta.env.VITE_APPWRITE_FUNCTION_ID ?? '';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LoginCredentials {
  account: string;
  password: string;
  region: string;
  rememberPassword: boolean;
}

interface StoredSession {
  accessToken: string;
  tokenTimestamp: number;
  account: string;
  password: string; // stored only if rememberPassword is true
  region: string;
  rememberPassword: boolean;
}

// ── LocalStorage helpers ──────────────────────────────────────────────────────

const SESSION_KEY = 'ezviz_session';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function loadSession(): Partial<StoredSession> {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as StoredSession;
  } catch (_e) { /* ignore */ }
  return {};
}

function saveSession(session: StoredSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (_e) { /* ignore */ }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (_e) { /* ignore */ }
}

function isTokenValid(session: Partial<StoredSession>): boolean {
  return !!(
    session.accessToken &&
    session.tokenTimestamp &&
    Date.now() - session.tokenTimestamp < TOKEN_TTL_MS
  );
}

// ── Call the Appwrite Function via REST API (no SDK required) ────────────────

async function fetchEzvizToken(
  account: string,
  password: string,
  region: string,
): Promise<{ accessToken: string; areaDomain: string }> {
  if (!APPWRITE_PROJECT_ID || !APPWRITE_FUNCTION_ID) {
    throw new Error(
      'VITE_APPWRITE_PROJECT_ID or VITE_APPWRITE_FUNCTION_ID is not set. ' +
      'Please add them to your .env.local file.',
    );
  }

  // Execute the Appwrite Function synchronously via the REST API.
  // The function must have Execute permission set to "Any" in the Appwrite Console.
  const executionUrl = `${APPWRITE_ENDPOINT}/functions/${APPWRITE_FUNCTION_ID}/executions`;

  const resp = await fetch(executionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': APPWRITE_PROJECT_ID,
    },
    body: JSON.stringify({
      body: JSON.stringify({ account, password, region }),
      async: false,
      path: '/',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Appwrite error ${resp.status}: ${errText}`);
  }

  // Appwrite wraps the function response inside an execution object.
  // The actual function return value is in `responseBody` as a JSON string.
  const execution = await resp.json();

  // Try parsing responseBody first to extract server error messages
  let data: { accessToken?: string; areaDomain?: string; error?: string } = {};
  if (execution.responseBody) {
    try {
      data = JSON.parse(execution.responseBody);
    } catch (_e) { /* ignore */ }
  }

  if (data.error) {
    throw new Error(data.error);
  }

  if (execution.status !== 'completed') {
    const detail = execution.errors || execution.responseBody || `Status: ${execution.status} (HTTP ${execution.responseStatusCode ?? 'N/A'})`;
    throw new Error('Function execution failed: ' + detail);
  }

  if (!data.accessToken) {
    throw new Error('Login failed. Please check your credentials.');
  }

  return { accessToken: data.accessToken, areaDomain: data.areaDomain! };
}

// ─────────────────────────────────────────────────────────────────────────────

interface Device {
  deviceSerial: string;
  channelNo: number;
  cameraName?: string;
  deviceName?: string;
  name?: string;
  channelName?: string;
  status: number;
}

// ── LoginScreen Component ─────────────────────────────────────────────────────

interface LoginScreenProps {
  onLogin: (token: string, region: string, credentials: LoginCredentials) => void;
}

const DEFAULT_REGION = 'https://isgpopen.ezvizlife.com';

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const saved = loadSession();

  const [account, setAccount] = useState(saved.account ?? '');
  const [password, setPassword] = useState(saved.rememberPassword ? (saved.password ?? '') : '');
  const [region, setRegion] = useState(saved.region ?? DEFAULT_REGION);
  const [rememberPassword, setRememberPassword] = useState(saved.rememberPassword ?? false);

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!account.trim() || !password.trim()) {
      setError('Please enter your EZVIZ username and password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { accessToken, areaDomain } = await fetchEzvizToken(account, password, region);
      const creds: LoginCredentials = { account, password, region: areaDomain, rememberPassword };
      onLogin(accessToken, areaDomain, creds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        {/* Branding */}
        <div className="login-brand">
          <div className="login-logo-ring">
            <Camera size={32} strokeWidth={1.5} />
          </div>
          <h1 className="login-title">Ezviz CCTV</h1>
          <p className="login-subtitle">Sign in with your EZVIZ account</p>
        </div>

        <form className="login-form" onSubmit={handleLogin} noValidate>
          {/* Region selector */}
          <div className="login-field">
            <label htmlFor="login-region">
              <Server size={14} />
              Server Region
            </label>
            <select
              id="login-region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              disabled={isLoading}
            >
              <option value="https://isgpopen.ezvizlife.com">Asia / Singapore</option>
              <option value="https://iusopen.ezvizlife.com">North America</option>
              <option value="https://isaopen.ezvizlife.com">South America</option>
              <option value="https://ieuopen.ezvizlife.com">Europe</option>
              <option value="https://iindiaopen.ezvizlife.com">India</option>
              <option value="https://open.ys7.com">China (ys7.com)</option>
            </select>
          </div>

          {/* EZVIZ Username */}
          <div className="login-field">
            <label htmlFor="login-account">
              <User size={14} />
              EZVIZ Username / Email
            </label>
            <input
              id="login-account"
              type="text"
              placeholder="Your EZVIZ app username or email"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              autoComplete="username"
              disabled={isLoading}
              autoFocus
            />
          </div>

          {/* EZVIZ Password */}
          <div className="login-field">
            <label htmlFor="login-password">
              <Lock size={14} />
              Password
            </label>
            <div className="login-password-wrap">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Your EZVIZ app password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={isLoading}
              />
              <button
                type="button"
                className="toggle-eye"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Remember password */}
          <label className="login-checkbox">
            <input
              type="checkbox"
              checked={rememberPassword}
              onChange={(e) => setRememberPassword(e.target.checked)}
              disabled={isLoading}
            />
            <span>Remember me on this device</span>
          </label>

          {/* Error */}
          {error && (
            <div className="login-error">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="login-btn"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="login-spinner" />
                Signing in…
              </>
            ) : (
              <>
                <Camera size={18} />
                Sign In
              </>
            )}
          </button>
        </form>

        <p className="login-hint">
          Use the same username &amp; password as the{' '}
          <a href="https://www.ezviz.com/" target="_blank" rel="noreferrer">
            EZVIZ mobile app
          </a>
        </p>
      </div>
    </div>
  );
};

// ── PTZ Controls Component ─────────────────────────────────────────────────────

interface PtzControlsProps {
  deviceSerial: string;
  channelNo: number;
  accessToken: string;
  region: string;
  ptzStatus: 'checking' | 'supported' | 'unsupported';
  onPtzStatusChange: (key: string, status: 'supported' | 'unsupported') => void;
}

const PtzControls: React.FC<PtzControlsProps> = ({
  deviceSerial, channelNo, accessToken, region, ptzStatus, onPtzStatusChange,
}) => {
  const [speed, setSpeed] = useState(1);
  const [activeDir, setActiveDir] = useState<number | null>(null);
  const activeDirRef = useRef<number | null>(null);
  const ptzKey = `${deviceSerial}-${channelNo}`;

  const handlePtzStart = async (direction: number) => {
    setActiveDir(direction);
    activeDirRef.current = direction;
    try {
      const resp = await fetch(`${region}/api/lapp/device/ptz/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `accessToken=${accessToken}&deviceSerial=${deviceSerial}&channelNo=${channelNo}&direction=${direction}&speed=${speed}`,
      });
      const data = await resp.json();
      if (data.code === '200' || ['60002','60003','60004','60005','60006','60009'].includes(data.code)) {
        if (ptzStatus !== 'supported') onPtzStatusChange(ptzKey, 'supported');
      } else if (data.code === '60000' || data.code === '60001' || data.code === '60020') {
        onPtzStatusChange(ptzKey, 'unsupported');
        setActiveDir(null);
        activeDirRef.current = null;
      }
    } catch (_e) { /* ignore */ }
  };

  const handlePtzStop = async (direction: number) => {
    if (activeDirRef.current !== direction) return;
    setActiveDir(null);
    activeDirRef.current = null;
    try {
      await fetch(`${region}/api/lapp/device/ptz/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `accessToken=${accessToken}&deviceSerial=${deviceSerial}&channelNo=${channelNo}&direction=${direction}`,
      });
    } catch (_e) { /* ignore */ }
  };

  if (ptzStatus === 'unsupported') {
    return (
      <div className="ptz-unavailable">
        <AlertCircle size={11} />
        <span>PTZ Unavailable</span>
      </div>
    );
  }

  if (ptzStatus === 'checking') {
    return (
      <div className="ptz-checking">
        <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} />
        <span>Checking PTZ…</span>
      </div>
    );
  }

  const dirBtn = (dir: number, icon: React.ReactNode, label: string, className: string) => (
    <button
      className={`ptz-dpad-btn ${className} ${activeDir === dir ? 'active' : ''}`}
      onMouseDown={() => handlePtzStart(dir)}
      onMouseUp={() => handlePtzStop(dir)}
      onMouseLeave={() => { if (activeDirRef.current === dir) handlePtzStop(dir); }}
      onTouchStart={(e) => { e.preventDefault(); handlePtzStart(dir); }}
      onTouchEnd={() => handlePtzStop(dir)}
      title={label}
    >
      {icon}
    </button>
  );

  return (
    <div className="ptz-panel">
      <div className="ptz-controls">
        <div className="ptz-dpad">
          {dirBtn(0, <ChevronUp size={14} />, 'Up', 'ptz-up')}
          {dirBtn(2, <ChevronLeft size={14} />, 'Left', 'ptz-left')}
          <div className="ptz-dpad-center">
            <Move size={10} />
          </div>
          {dirBtn(3, <ChevronRight size={14} />, 'Right', 'ptz-right')}
          {dirBtn(1, <ChevronDown size={14} />, 'Down', 'ptz-down')}
        </div>
        <div className="ptz-side-controls">
          <div className="ptz-zoom">
            {dirBtn(9, <Minus size={12} />, 'Zoom Out', 'ptz-zoom-btn')}
            <span className="ptz-zoom-label">Zoom</span>
            {dirBtn(8, <Plus size={12} />, 'Zoom In', 'ptz-zoom-btn')}
          </div>
          <div className="ptz-speed">
            {[0, 1, 2].map(s => (
              <button
                key={s}
                className={`ptz-speed-btn ${speed === s ? 'active' : ''}`}
                onClick={() => setSpeed(s)}
                title={['Slow', 'Medium', 'Fast'][s]}
              >
                {['S', 'M', 'F'][s]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Alarm Sound Controls Component ────────────────────────────────────────────

interface AlarmSoundControlsProps {
  deviceSerial: string;
  accessToken: string;
  region: string;
  alarmStatus: 'checking' | 'supported' | 'unsupported';
  alarmType: number; // 0=Short, 1=Long, 2=Mute
  onAlarmStatusChange: (key: string, status: 'supported' | 'unsupported') => void;
  onAlarmTypeChange: (key: string, type: number) => void;
}

const AlarmSoundControls: React.FC<AlarmSoundControlsProps> = ({
  deviceSerial, accessToken, region, alarmStatus, alarmType, onAlarmStatusChange, onAlarmTypeChange,
}) => {
  const [isSettling, setIsSettling] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; isError?: boolean } | null>(null);

  const handleSetAlarm = async (type: number) => {
    if (isSettling) return;
    setIsSettling(true);
    setFeedback(null);
    try {
      console.log(`[Alarm Sound] Setting alarm sound for ${deviceSerial} to type ${type}...`);
      const resp = await fetch(`${region}/api/v3/device/alarmSound/enabled/set?type=${type}`, {
        method: 'POST',
        headers: { accessToken, deviceSerial },
      });
      const data = await resp.json();
      console.log('[Alarm Sound Response]', data);
      const code = data?.body?.meta?.code ?? data?.meta?.code ?? data?.code;
      const msg = data?.body?.meta?.message ?? data?.meta?.message ?? data?.msg ?? 'Success';

      if (code === 200 || code === '200') {
        onAlarmTypeChange(deviceSerial, type);
        if (alarmStatus !== 'supported') onAlarmStatusChange(deviceSerial, 'supported');
        const labels = ['Short Call', 'Long Call', 'Mute'];
        setFeedback({ msg: `✓ Set to ${labels[type]}` });
        setTimeout(() => setFeedback(null), 3000);
      } else if (code === 60020 || code === '60020') {
        onAlarmStatusChange(deviceSerial, 'unsupported');
        setFeedback({ msg: 'Not supported on this device', isError: true });
      } else {
        setFeedback({ msg: `Error ${code}: ${msg}`, isError: true });
        setTimeout(() => setFeedback(null), 4000);
      }
    } catch (e: unknown) {
      console.error('[Alarm Sound Error]', e);
      setFeedback({ msg: (e as Error).message || 'Network error', isError: true });
      setTimeout(() => setFeedback(null), 4000);
    }
    setIsSettling(false);
  };

  if (alarmStatus === 'unsupported') {
    return (
      <div className="alarm-unavailable">
        <VolumeX size={11} />
        <span>Alarm Sound Mode Unavailable</span>
      </div>
    );
  }

  if (alarmStatus === 'checking') {
    return (
      <div className="alarm-checking">
        <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} />
        <span>Checking Alarm Mode…</span>
      </div>
    );
  }

  const types = [
    { value: 0, label: 'Short', icon: <Bell size={11} /> },
    { value: 1, label: 'Long', icon: <Volume2 size={11} /> },
    { value: 2, label: 'Mute', icon: <VolumeX size={11} /> },
  ];

  return (
    <div className="alarm-panel">
      <div className="control-header-label">
        <span>Alarm Sound Mode (Event Prompt):</span>
      </div>
      <div className="alarm-controls">
        {types.map(t => (
          <button
            key={t.value}
            className={`alarm-btn ${alarmType === t.value ? 'active' : ''} ${isSettling ? 'settling' : ''}`}
            onClick={() => handleSetAlarm(t.value)}
            disabled={isSettling}
            title={`Set alarm prompt sound to ${t.label}`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      {feedback && (
        <div className={`control-feedback ${feedback.isError ? 'error' : 'success'}`}>
          {feedback.msg}
        </div>
      )}
    </div>
  );
};

// ── Play Ringtone (Audition) Controls Component ──────────────────────────────

interface RingtoneControlsProps {
  deviceSerial: string;
  accessToken: string;
  region: string;
  ringtoneStatus: 'checking' | 'supported' | 'unsupported';
  onRingtoneStatusChange: (key: string, status: 'supported' | 'unsupported') => void;
}

const RingtoneControls: React.FC<RingtoneControlsProps> = ({
  deviceSerial, accessToken, region, ringtoneStatus, onRingtoneStatusChange,
}) => {
  const [activeVoice, setActiveVoice] = useState<number | null>(null);
  const [isSettling, setIsSettling] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; isError?: boolean } | null>(null);

  const handlePlayRingtone = async (voiceIndex: number) => {
    if (isSettling) return;
    setIsSettling(true);
    setActiveVoice(voiceIndex);
    setFeedback(null);
    try {
      console.log(`[Play Ringtone] Triggering voiceIndex=${voiceIndex} on ${deviceSerial}...`);
      const resp = await fetch(`${region}/api/v3/device/audition?voiceIndex=${voiceIndex}&volume=80`, {
        method: 'POST',
        headers: { accessToken, deviceSerial },
      });
      const data = await resp.json();
      console.log('[Play Ringtone Response]', data);
      const code = data?.body?.meta?.code ?? data?.meta?.code ?? data?.code;
      const msg = data?.body?.meta?.message ?? data?.meta?.message ?? data?.msg ?? 'Success';

      if (code === 200 || code === '200') {
        if (ringtoneStatus !== 'supported') onRingtoneStatusChange(deviceSerial, 'supported');
        if (voiceIndex === 202) {
          setActiveVoice(null);
          setFeedback({ msg: '✓ Tone stopped' });
        } else {
          setFeedback({ msg: '✓ Ringing on device!' });
          setTimeout(() => setActiveVoice(null), 3000);
        }
        setTimeout(() => setFeedback(null), 3000);
      } else if (code === 60020 || code === '60020') {
        onRingtoneStatusChange(deviceSerial, 'unsupported');
        setActiveVoice(null);
        setFeedback({ msg: 'Not supported on this device', isError: true });
      } else {
        setActiveVoice(null);
        setFeedback({ msg: `Error ${code}: ${msg}`, isError: true });
        setTimeout(() => setFeedback(null), 4000);
      }
    } catch (e: unknown) {
      console.error('[Play Ringtone Error]', e);
      setActiveVoice(null);
      setFeedback({ msg: (e as Error).message || 'Network error', isError: true });
      setTimeout(() => setFeedback(null), 4000);
    }
    setIsSettling(false);
  };

  if (ringtoneStatus === 'unsupported') {
    return (
      <div className="ringtone-unavailable">
        <Music size={11} />
        <span>Instant Siren / Ringtone Unavailable</span>
      </div>
    );
  }

  if (ringtoneStatus === 'checking') {
    return (
      <div className="ringtone-checking">
        <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} />
        <span>Checking Instant Siren…</span>
      </div>
    );
  }

  const ringtones = [
    { value: 200, label: 'Alert Beep', icon: <Volume1 size={11} /> },
    { value: 201, label: 'Alarm Siren', icon: <Radio size={11} /> },
    { value: 202, label: 'Stop Tone', icon: <VolumeX size={11} /> },
  ];

  return (
    <div className="ringtone-panel">
      <div className="control-header-label">
        <span>Instant Sound Trigger (Audition):</span>
      </div>
      <div className="ringtone-controls">
        {ringtones.map(r => (
          <button
            key={r.value}
            className={`ringtone-btn ${activeVoice === r.value ? 'active' : ''} ${isSettling ? 'settling' : ''}`}
            onClick={() => handlePlayRingtone(r.value)}
            disabled={isSettling}
            title={r.label}
          >
            {r.icon}
            <span>{r.label}</span>
          </button>
        ))}
      </div>
      {feedback && (
        <div className={`control-feedback ${feedback.isError ? 'error' : 'success'}`}>
          {feedback.msg}
        </div>
      )}
    </div>
  );
};

// ── CameraPlayer Component ────────────────────────────────────────────────────

interface CameraPlayerProps {
  device: Device;
  accessToken: string;
  region: string;
  mode: 'live' | 'rec';
  recType: 'local' | 'cloud';
  playbackTime: string;
  playbackEndTime: string;
  isActive: boolean;
  index: number;
  onStatusChange: (deviceSerial: string, channelNo: number, status: number) => void;
  onStreamSettled: () => void;
  ptzStatus: 'checking' | 'supported' | 'unsupported';
  onPtzStatusChange: (key: string, status: 'supported' | 'unsupported') => void;
  alarmStatus: 'checking' | 'supported' | 'unsupported';
  alarmType: number;
  onAlarmStatusChange: (key: string, status: 'supported' | 'unsupported') => void;
  onAlarmTypeChange: (key: string, type: number) => void;
  ringtoneStatus: 'checking' | 'supported' | 'unsupported';
  onRingtoneStatusChange: (key: string, status: 'supported' | 'unsupported') => void;
}

const CameraPlayer: React.FC<CameraPlayerProps> = ({
  device, accessToken, region, mode, recType, playbackTime, playbackEndTime,
  isActive, index, onStatusChange, onStreamSettled, ptzStatus, onPtzStatusChange,
  alarmStatus, alarmType, onAlarmStatusChange, onAlarmTypeChange,
  ringtoneStatus, onRingtoneStatusChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<EZUIKitPlayer | null>(null);
  const settledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [localIsActive, setLocalIsActive] = useState(isActive);
  const playerId = `video-container-${device.deviceSerial}-${device.channelNo}`;

  const settle = useCallback(() => {
    if (!settledRef.current) {
      settledRef.current = true;
      onStreamSettled();
    }
  }, [onStreamSettled]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    if (isActive) {
      settledRef.current = false;
      if (device.status === 1) {
        timeoutId = setTimeout(() => {
          setLocalIsActive(true);
        }, index * 800);
      } else {
        setLocalIsActive(false);
        settle();
      }
    } else {
      setLocalIsActive(false);
    }

    return () => clearTimeout(timeoutId);
  }, [isActive, device.status, index, settle]);

  useEffect(() => {
    if (localIsActive) {
      startStream();
    } else {
      stopStream();
    }
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localIsActive, mode, playbackTime, playbackEndTime]);

  const startStream = () => {
    if (!accessToken) return;

    setIsLoading(true);
    setError(null);
    stopStream();

    const cleanSerial = device.deviceSerial.trim().toUpperCase();
    const domain = region === 'https://open.ys7.com' ? 'open.ys7.com' : 'open.ezviz.com';
    const recSuffix = recType === 'cloud' ? '.cloud.rec' : '.rec';

    const startFormatted = playbackTime.replace(/[-T:]/g, '').padEnd(14, '0');
    const endFormatted = playbackEndTime.replace(/[-T:]/g, '').padEnd(14, '0');

    const url = mode === 'live'
      ? `ezopen://${domain}/${cleanSerial}/${device.channelNo}.live`
      : `ezopen://${domain}/${cleanSerial}/${device.channelNo}${recSuffix}?begin=${startFormatted}&end=${endFormatted}`;

    try {
      playerRef.current = new EZUIKitPlayer({
        id: playerId,
        accessToken: accessToken,
        url: url,
        template: mode === 'live' ? 'simple' : 'pcRec',
        width: '100%',
        height: '100%',
        autoplay: true,
        staticPath: '/ezviz-webapp-v3/ezuikit_static',
        ...(region !== 'https://open.ys7.com' ? { env: { domain: region } } : {}),
        handleError: (err: unknown) => {
          console.error(`EZUIKit Error (${device.deviceSerial}):`, err);
          setError('Device Offline');
          setIsLoading(false);
          setIsPlaying(false);
          if (device.status !== 0) {
            onStatusChange(device.deviceSerial, device.channelNo, 0);
          }
          settle();
        },
        handleSuccess: () => {
          setIsPlaying(true);
          setIsLoading(false);
          setError(null);
          if (device.status !== 1) {
            onStatusChange(device.deviceSerial, device.channelNo, 1);
          }
          settle();
        }
      });
    } catch (_err) {
      setError('Init error');
      setIsLoading(false);
      setIsPlaying(false);
      settle();
    }
  };

  const stopStream = () => {
    if (playerRef.current) {
      try {
        playerRef.current.stop();
      } catch (_e) {
        // Ignore errors when stopping an already-destroyed player
      }
      playerRef.current = null;
    }
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
    setIsPlaying(false);
    setIsLoading(false);
    setError(null);
  };

  const displayName = device.channelName || device.name || device.deviceName || device.cameraName;
  const headerTitle = displayName ? `${device.deviceSerial} - ${displayName}` : device.deviceSerial;

  return (
    <div className="camera-card">
      <div className="camera-header">
        <div className="camera-title" title={headerTitle}>
          {headerTitle}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => setLocalIsActive(!localIsActive)}
            style={{
              background: 'transparent',
              border: 'none',
              color: localIsActive ? '#ef4444' : '#10b981',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: 0
            }}
            title={localIsActive ? 'Stop Stream' : 'Start Stream'}
          >
            {localIsActive ? <Square size={16} fill="currentColor" /> : <PlayCircle size={18} />}
          </button>
          <div className={`status-dot ${device.status === 1 ? 'online' : 'offline'}`} title={device.status === 1 ? 'Online' : 'Offline'}></div>
        </div>
      </div>
      <div className="camera-player-container">
        <div id={playerId} ref={containerRef} style={{ width: '100%', height: '100%' }}></div>
        {isLoading && (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <p style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>Loading...</p>
          </div>
        )}
        {!isPlaying && !isLoading && !error && (
          <div className="loading-overlay" style={{ background: '#000' }}>
            <Video size={32} color="var(--border)" />
          </div>
        )}
        {error && (
          <div className="loading-overlay" style={{ background: '#000' }}>
            <AlertCircle size={24} color="#ef4444" style={{ marginBottom: '0.5rem' }} />
            <div style={{ color: '#ef4444', fontSize: '0.75rem' }}>{error}</div>
          </div>
        )}
      </div>
      <PtzControls
        deviceSerial={device.deviceSerial}
        channelNo={device.channelNo}
        accessToken={accessToken}
        region={region}
        ptzStatus={ptzStatus}
        onPtzStatusChange={onPtzStatusChange}
      />
      <AlarmSoundControls
        deviceSerial={device.deviceSerial}
        accessToken={accessToken}
        region={region}
        alarmStatus={alarmStatus}
        alarmType={alarmType}
        onAlarmStatusChange={onAlarmStatusChange}
        onAlarmTypeChange={onAlarmTypeChange}
      />
      <RingtoneControls
        deviceSerial={device.deviceSerial}
        accessToken={accessToken}
        region={region}
        ringtoneStatus={ringtoneStatus}
        onRingtoneStatusChange={onRingtoneStatusChange}
      />
      <div className="camera-footer">
        <span className="camera-meta">CH: {device.channelNo}</span>
        <span className="camera-meta">{device.deviceSerial}</span>
      </div>
    </div>
  );
};

// ── Main App ──────────────────────────────────────────────────────────────────

const App: React.FC = () => {
  const savedSession = loadSession();

  // Auth State
  const [accessToken, setAccessToken] = useState(
    isTokenValid(savedSession) ? (savedSession.accessToken ?? '') : ''
  );
  const [loggedInAccount, setLoggedInAccount] = useState(savedSession.account ?? '');
  const [region, setRegion] = useState(savedSession.region ?? DEFAULT_REGION);
  const [isLoggedIn, setIsLoggedIn] = useState(isTokenValid(savedSession));
  const [isAutoLogging, setIsAutoLogging] = useState(false);

  const [mode, setMode] = useState<'live' | 'rec'>('live');
  const [playbackTime, setPlaybackTime] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"));
  const [playbackEndTime, setPlaybackEndTime] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"));
  const [recType, setRecType] = useState<'local' | 'cloud'>('local');

  // App State
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Single or All mode
  const [isAllActive, setIsAllActive] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);

  // Playback single mode
  const [selectedRecDevice, setSelectedRecDevice] = useState<string>('');
  const [isSingleRecActive, setIsSingleRecActive] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [ptzSupport, setPtzSupport] = useState<Record<string, 'checking' | 'supported' | 'unsupported'>>({});
  const [alarmSupport, setAlarmSupport] = useState<Record<string, 'checking' | 'supported' | 'unsupported'>>({});
  const [alarmTypes, setAlarmTypes] = useState<Record<string, number>>({});
  const [ringtoneSupport, setRingtoneSupport] = useState<Record<string, 'checking' | 'supported' | 'unsupported'>>({});

  // Loading progress tracking
  const [streamTotal, setStreamTotal] = useState(0);
  const [streamSettled, setStreamSettled] = useState(0);

  // Derived camera stats
  const onlineCount = devices.filter(d => d.status === 1).length;
  const offlineCount = devices.length - onlineCount;
  const loadProgress = streamTotal > 0 ? Math.round((streamSettled / streamTotal) * 100) : 0;
  const isStreamsLoading = isAllActive && streamTotal > 0 && streamSettled < streamTotal;

  // Auto-login: if token expired but credentials (+ password) are saved, silently refresh
  useEffect(() => {
    const session = loadSession();
    if (!isTokenValid(session) && session.account && session.password && session.rememberPassword) {
      setIsAutoLogging(true);
      (async () => {
        try {
          const { accessToken: token, areaDomain } = await fetchEzvizToken(
            session.account!,
            session.password!,
            session.region ?? DEFAULT_REGION,
          );
          handleLoginSuccess(token, areaDomain, {
            account: session.account!,
            password: session.password!,
            region: areaDomain,
            rememberPassword: true,
          });
        } catch (_e) {
          // Silent failure → show login screen with pre-filled username
        } finally {
          setIsAutoLogging(false);
        }
      })();
    }
  }, []);

  const handleLoginSuccess = (token: string, resolvedRegion: string, creds: LoginCredentials) => {
    setAccessToken(token);
    setRegion(resolvedRegion);
    setLoggedInAccount(creds.account);
    setIsLoggedIn(true);

    saveSession({
      accessToken: token,
      tokenTimestamp: Date.now(),
      account: creds.account,
      password: creds.rememberPassword ? creds.password : '',
      region: resolvedRegion,
      rememberPassword: creds.rememberPassword,
    });
  };

  const handleLogout = () => {
    clearSession();
    setAccessToken('');
    setLoggedInAccount('');
    setIsLoggedIn(false);
    setDevices([]);
    setIsAllActive(false);
    setError(null);
    setSelectedRecDevice('');
    setIsSingleRecActive(false);
    setPtzSupport({});
    setAlarmSupport({});
    setAlarmTypes({});
    setRingtoneSupport({});
  };

  const handleStreamSettled = useCallback(() => {
    setStreamSettled(prev => prev + 1);
  }, []);

  const handlePtzStatusChange = useCallback((key: string, status: 'supported' | 'unsupported') => {
    setPtzSupport(prev => ({ ...prev, [key]: status }));
  }, []);

  const handleAlarmStatusChange = useCallback((key: string, status: 'supported' | 'unsupported') => {
    setAlarmSupport(prev => ({ ...prev, [key]: status }));
  }, []);

  const handleAlarmTypeChange = useCallback((key: string, type: number) => {
    setAlarmTypes(prev => ({ ...prev, [key]: type }));
  }, []);

  const handleRingtoneStatusChange = useCallback((key: string, status: 'supported' | 'unsupported') => {
    setRingtoneSupport(prev => ({ ...prev, [key]: status }));
  }, []);

  const updateDeviceStatus = (deviceSerial: string, channelNo: number, status: number) => {
    setDevices(prevDevices =>
      prevDevices.map(d =>
        (d.deviceSerial === deviceSerial && d.channelNo === channelNo)
          ? { ...d, status }
          : d
      )
    );
  };

  const fetchDevices = async () => {
    if (!accessToken) {
      setError('Not authenticated. Please log in again.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${region}/api/lapp/camera/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `accessToken=${accessToken}&pageStart=0&pageSize=50`,
      });

      const data = await response.json();

      if (data.code === '200') {
        const fetchedDevices: Device[] = data.data;
        setDevices(fetchedDevices);
        setError(null);

        const onlineDevices = fetchedDevices.filter(d => d.status === 1).length;
        setStreamTotal(onlineDevices);
        setStreamSettled(0);
        setIsAllActive(true);

        // Probe PTZ support for each device using capacity API (non-intrusive, no motor movement)
        const ptzInitial: Record<string, 'checking' | 'supported' | 'unsupported'> = {};
        fetchedDevices.forEach((d: Device) => {
          ptzInitial[`${d.deviceSerial}-${d.channelNo}`] = d.status === 1 ? 'checking' : 'unsupported';
        });
        setPtzSupport(ptzInitial);

        const onlineList = fetchedDevices.filter((d: Device) => d.status === 1);
        (async () => {
          for (const dev of onlineList) {
            const k = `${dev.deviceSerial}-${dev.channelNo}`;
            try {
              const r = await fetch(`${region}/api/lapp/device/capacity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `accessToken=${accessToken}&deviceSerial=${dev.deviceSerial}`,
              });
              const d = await r.json();
              if (d.code === '200' && d.data) {
                // Check if device reports PTZ support in capacity set
                const hasPtz = d.data.support_ptz === '1' || d.data.support_ptz === 1 || 
                               d.data.support_cloud_ptz === '1' || d.data.support_cloud_ptz === 1 ||
                               d.data.support_ptz_top === '1' || d.data.support_ptz_top === 1;
                // If capacity explicitly returns 0 for ptz, mark unsupported; otherwise default to supported
                if (d.data.support_ptz === '0' || d.data.support_ptz === 0) {
                  setPtzSupport(prev => ({ ...prev, [k]: 'unsupported' }));
                } else if (hasPtz) {
                  setPtzSupport(prev => ({ ...prev, [k]: 'supported' }));
                } else {
                  setPtzSupport(prev => ({ ...prev, [k]: 'supported' }));
                }
              } else {
                setPtzSupport(prev => ({ ...prev, [k]: 'supported' }));
              }
            } catch (_e) {
              setPtzSupport(prev => ({ ...prev, [k]: 'supported' }));
            }
            await new Promise(resolve => setTimeout(resolve, 150));
          }
        })();

        // Probe alarm sound support for each device
        const alarmInitial: Record<string, 'checking' | 'supported' | 'unsupported'> = {};
        fetchedDevices.forEach((d: Device) => {
          alarmInitial[d.deviceSerial] = d.status === 1 ? 'checking' : 'unsupported';
        });
        setAlarmSupport(alarmInitial);

        (async () => {
          for (const dev of onlineList) {
            try {
              const r = await fetch(`${region}/api/v3/device/alarmSound/enabled/get`, {
                method: 'POST',
                headers: { accessToken, deviceSerial: dev.deviceSerial },
              });
              const d = await r.json();
              const code = d?.body?.meta?.code ?? d?.meta?.code ?? d?.code;
              if (code === 200 || code === '200') {
                setAlarmSupport(prev => ({ ...prev, [dev.deviceSerial]: 'supported' }));
                // Try to extract current alarm type from response
                const currentType = d?.body?.type ?? d?.body?.data?.type;
                if (currentType !== undefined) {
                  setAlarmTypes(prev => ({ ...prev, [dev.deviceSerial]: Number(currentType) }));
                }
              } else {
                setAlarmSupport(prev => ({ ...prev, [dev.deviceSerial]: 'unsupported' }));
              }
            } catch (_e) {
              setAlarmSupport(prev => ({ ...prev, [dev.deviceSerial]: 'unsupported' }));
            }
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        })();

        // Probe ringtone audition support for each device
        const ringtoneInitial: Record<string, 'checking' | 'supported' | 'unsupported'> = {};
        fetchedDevices.forEach((d: Device) => {
          ringtoneInitial[d.deviceSerial] = d.status === 1 ? 'checking' : 'unsupported';
        });
        setRingtoneSupport(ringtoneInitial);

        (async () => {
          for (const dev of onlineList) {
            try {
              const r = await fetch(`${region}/api/v3/device/audition?voiceIndex=202`, {
                method: 'POST',
                headers: { accessToken, deviceSerial: dev.deviceSerial },
              });
              const d = await r.json();
              const code = d?.body?.meta?.code ?? d?.meta?.code ?? d?.code;
              if (code === 200 || code === '200') {
                setRingtoneSupport(prev => ({ ...prev, [dev.deviceSerial]: 'supported' }));
              } else {
                setRingtoneSupport(prev => ({ ...prev, [dev.deviceSerial]: 'unsupported' }));
              }
            } catch (_e) {
              setRingtoneSupport(prev => ({ ...prev, [dev.deviceSerial]: 'unsupported' }));
            }
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        })();
      } else if (data.code === '10002' || data.code === '20002') {
        setError('Session expired. Please log in again.');
        handleLogout();
      } else {
        setError(data.msg || 'Failed to fetch device list');
      }
    } catch (_err) {
      setError('Network error while fetching device list');
    } finally {
      setIsLoading(false);
    }
  };

  // Background polling to update device status every 30 seconds
  useEffect(() => {
    if (!accessToken || devices.length === 0) return;

    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(`${region}/api/lapp/camera/list`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `accessToken=${accessToken}&pageStart=0&pageSize=50`,
        });

        const data = await response.json();

        if (data.code === '200' && data.data) {
          setDevices(prevDevices => {
            let hasChanges = false;
            const updatedDevices = prevDevices.map(prevDev => {
              const freshDev = data.data.find((d: Device) => d.deviceSerial === prevDev.deviceSerial && d.channelNo === prevDev.channelNo);
              if (freshDev && freshDev.status !== prevDev.status) {
                hasChanges = true;
                return { ...prevDev, status: freshDev.status };
              }
              return prevDev;
            });
            return hasChanges ? updatedDevices : prevDevices;
          });
        }
      } catch (_err) {
        console.error('Background polling failed');
      }
    }, 30000);

    return () => clearInterval(intervalId);
  }, [accessToken, region, devices.length]);

  const toggleAllStreams = () => {
    if (devices.length === 0) {
      setError('No devices available. Please fetch devices first.');
      return;
    }
    if (!isAllActive) {
      const onlineDevices = devices.filter(d => d.status === 1).length;
      setStreamTotal(onlineDevices);
      setStreamSettled(0);
    }
    setIsAllActive(!isAllActive);
  };

  const handleDownload = async () => {
    if (!accessToken || !selectedRecDevice) return;

    setIsDownloading(true);
    setError(null);

    try {
      const [deviceSerial, channelNo] = selectedRecDevice.split('-');

      const startMs = new Date(playbackTime).getTime();
      const endMs = new Date(playbackEndTime).getTime();

      const response = await fetch(`${region}/api/lapp/video/by/time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `accessToken=${accessToken}&deviceSerial=${deviceSerial}&channelNo=${channelNo}&startTime=${startMs}&endTime=${endMs}&stopTime=${endMs}&type=${recType === 'cloud' ? 1 : 2}&recType=${recType === 'cloud' ? 1 : 2}`,
      });

      const data = await response.json();
      console.log('Video search API response:', data);

      if (data.code === '200') {
        if (data.data && data.data.length > 0) {
          const segment = data.data[0];
          if (segment.downloadPath) {
            window.open(segment.downloadPath, '_blank');
          } else {
            setError('No direct download link available. Note: Downloading SD Card recordings directly via Web is not supported by EZVIZ API. Please use EZVIZ Studio PC.');
          }
        } else {
          setError('No video recordings found for the selected time range.');
        }
      } else {
        setError(data.msg || 'Failed to search for video recordings');
      }
    } catch (_err) {
      setError('Network error while trying to download video');
    } finally {
      setIsDownloading(false);
    }
  };

  // ── Auto-login spinner ────────────────────────────────────────────────────
  if (isAutoLogging) {
    return (
      <div className="login-screen">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: 'var(--text-muted)' }}>
          <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
          <p>Resuming session…</p>
        </div>
      </div>
    );
  }

  // ── Show Login Screen if not logged in ────────────────────────────────────
  if (!isLoggedIn) {
    return <LoginScreen onLogin={handleLoginSuccess} />;
  }

  // ── Main App ──────────────────────────────────────────────────────────────
  return (
    <div className="app-container">
      {/* Global stream loading progress bar */}
      {isStreamsLoading && (
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{ width: `${loadProgress}%` }}
          />
        </div>
      )}

      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => setIsSidebarVisible(!isSidebarVisible)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            title="Toggle Sidebar"
          >
            <Menu size={24} />
          </button>
          <div className="logo">Ezviz CCTV Streaming</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Camera stats */}
          {devices.length > 0 && (
            <div className="camera-stats">
              <span className="stat-badge stat-total">
                <Info size={12} />
                {devices.length} Total
              </span>
              <span className="stat-badge stat-online">
                <Wifi size={12} />
                {onlineCount} Online
              </span>
              <span className="stat-badge stat-offline">
                <WifiOff size={12} />
                {offlineCount} Offline
              </span>
              {isStreamsLoading && (
                <span className="stat-badge stat-loading">
                  <span className="pulse-dot" />
                  Loading {streamSettled}/{streamTotal}
                </span>
              )}
            </div>
          )}

          {/* Logged-in account indicator */}
          {loggedInAccount && (
            <div className="status-badge" title={`Logged in as ${loggedInAccount}`}>
              <User size={12} />
              {loggedInAccount}
            </div>
          )}
        </div>
      </header>

      <main className={isSidebarVisible ? '' : 'sidebar-hidden'}>
        {isSidebarVisible && (
          <aside className="panel">
            <div className="mode-toggle">
              <button
                className={`mode-btn ${mode === 'live' ? 'active' : ''}`}
                onClick={() => { setMode('live'); setIsAllActive(false); setIsSingleRecActive(false); setError(null); }}
              >
                <Video size={16} style={{ marginBottom: -3, marginRight: 6 }} />
                Live Stream
              </button>
              <button
                className={`mode-btn ${mode === 'rec' ? 'active' : ''}`}
                onClick={() => { setMode('rec'); setIsAllActive(false); setIsSingleRecActive(false); setError(null); }}
              >
                <Play size={16} style={{ marginBottom: -3, marginRight: 6 }} />
                Playback
              </button>
            </div>

            {/* Account info + Logout */}
            <div className="account-panel">
              <div className="account-info">
                <div className="account-avatar">
                  <User size={16} />
                </div>
                <div className="account-details">
                  <span className="account-name">{loggedInAccount || 'EZVIZ Account'}</span>
                  <span className="account-region">{region.replace('https://', '')}</span>
                </div>
              </div>
              <button
                className="btn-logout"
                onClick={handleLogout}
                title="Sign out"
              >
                <LogOut size={15} />
                Sign Out
              </button>
            </div>

            <button className="btn btn-primary" onClick={fetchDevices} style={{ marginBottom: '1.5rem' }} disabled={isLoading || !accessToken}>
              <Camera size={18} />
              {isLoading ? 'Fetching Devices...' : 'Fetch Device List'}
            </button>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', marginBottom: '1.5rem' }} />

            {mode === 'rec' && (
              <>
                <div className="input-group">
                  <label>Storage Type</label>
                  <select value={recType} onChange={(e) => setRecType(e.target.value as 'local' | 'cloud')}>
                    <option value="local">SD Card (Local)</option>
                    <option value="cloud">Cloud Storage</option>
                  </select>
                </div>
                <div className="input-group">
                  <label><Calendar size={14} style={{ marginBottom: -2, marginRight: 4 }} /> Start Time</label>
                  <input
                    type="datetime-local"
                    step="1"
                    value={playbackTime}
                    onChange={(e) => setPlaybackTime(e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <label><Calendar size={14} style={{ marginBottom: -2, marginRight: 4 }} /> End Time</label>
                  <input
                    type="datetime-local"
                    step="1"
                    value={playbackEndTime}
                    onChange={(e) => setPlaybackEndTime(e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <label>Select Camera</label>
                  <select
                    value={selectedRecDevice}
                    onChange={(e) => setSelectedRecDevice(e.target.value)}
                    disabled={devices.length === 0}
                  >
                    <option value="">-- Choose a Camera --</option>
                    {devices.map(device => {
                      const displayName = device.channelName || device.name || device.deviceName || device.cameraName;
                      const headerTitle = displayName ? `${device.deviceSerial} - ${displayName}` : device.deviceSerial;
                      return (
                        <option key={`${device.deviceSerial}-${device.channelNo}`} value={`${device.deviceSerial}-${device.channelNo}`}>
                          {headerTitle}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </>
            )}

            <div className="controls-grid" style={{ marginTop: mode === 'rec' ? 0 : '2rem' }}>
              {mode === 'live' ? (
                <button
                  className={`btn ${isAllActive ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={toggleAllStreams}
                  disabled={devices.length === 0}
                >
                  {isAllActive ? <Video size={18} /> : <Play size={18} />}
                  {isAllActive ? 'Stop All' : 'Play All'}
                </button>
              ) : (
                <>
                  <button
                    className={`btn ${isSingleRecActive ? 'btn-secondary' : 'btn-primary'}`}
                    onClick={() => setIsSingleRecActive(!isSingleRecActive)}
                    disabled={devices.length === 0 || !selectedRecDevice}
                  >
                    {isSingleRecActive ? <Square size={18} /> : <Play size={18} />}
                    {isSingleRecActive ? 'Stop Playback' : 'Start Playback'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={handleDownload}
                    disabled={devices.length === 0 || !selectedRecDevice || isDownloading}
                  >
                    <Download size={18} />
                    {isDownloading ? 'Downloading...' : 'Download'}
                  </button>
                </>
              )}
            </div>

            {error && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '0.875rem', display: 'flex', gap: '0.5rem' }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <div style={{ wordBreak: 'break-word' }}>{error}</div>
              </div>
            )}
          </aside>
        )}

        <section className="video-section">
          {devices.length === 0 ? (
            <div className="empty-state">
              <Grid size={48} color="var(--border)" style={{ marginBottom: '1rem' }} />
              <h3>No Cameras Found</h3>
              <p>Click "Fetch Device List" to load your cameras.</p>
            </div>
          ) : mode === 'rec' && !selectedRecDevice ? (
            <div className="empty-state">
              <Video size={48} color="var(--border)" style={{ marginBottom: '1rem' }} />
              <h3>Select a Camera</h3>
              <p>Please choose a camera from the sidebar to view playback.</p>
            </div>
          ) : (
            <div className={`cameras-grid ${mode === 'rec' ? 'single-camera-mode' : ''}`}>
              {devices
                .filter(device => mode === 'live' || `${device.deviceSerial}-${device.channelNo}` === selectedRecDevice)
                .sort((a, b) => b.status - a.status)
                .map((device, index) => (
                  <CameraPlayer
                    key={`${device.deviceSerial}-${device.channelNo}`}
                    index={index}
                    device={device}
                    accessToken={accessToken}
                    region={region}
                    mode={mode}
                    recType={recType}
                    playbackTime={playbackTime}
                    playbackEndTime={playbackEndTime}
                    isActive={mode === 'live' ? isAllActive : isSingleRecActive}
                    onStatusChange={updateDeviceStatus}
                    onStreamSettled={handleStreamSettled}
                    ptzStatus={ptzSupport[`${device.deviceSerial}-${device.channelNo}`] ?? 'checking'}
                    onPtzStatusChange={handlePtzStatusChange}
                    alarmStatus={alarmSupport[device.deviceSerial] ?? 'checking'}
                    alarmType={alarmTypes[device.deviceSerial] ?? 2}
                    onAlarmStatusChange={handleAlarmStatusChange}
                    onAlarmTypeChange={handleAlarmTypeChange}
                    ringtoneStatus={ringtoneSupport[device.deviceSerial] ?? 'checking'}
                    onRingtoneStatusChange={handleRingtoneStatusChange}
                  />
                ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default App;
