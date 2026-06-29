import React, { useState, useEffect, useRef } from 'react';
import { Camera, Play, Video, Key, Calendar, AlertCircle, Info, Grid, Square, PlayCircle, Menu, Download } from 'lucide-react';
import { format } from 'date-fns';
import { EZUIKitPlayer } from 'ezuikit-js';

// Global type definition for EZUIKit
declare global {
  interface Window {
    EZUIKit: any;
  }
}

interface Device {
  deviceSerial: string;
  channelNo: number;
  cameraName?: string;
  deviceName?: string;
  name?: string;
  channelName?: string;
  status: number;
}

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
}

const CameraPlayer: React.FC<CameraPlayerProps> = ({
  device, accessToken, region, mode, recType, playbackTime, playbackEndTime, isActive, index, onStatusChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [localIsActive, setLocalIsActive] = useState(isActive);
  const playerId = `video-container-${device.deviceSerial}-${device.channelNo}`;

  useEffect(() => {
    let timeoutId: any;

    // Auto-play only if globally active AND device is online
    if (isActive) {
      if (device.status === 1) {
        timeoutId = setTimeout(() => {
          setLocalIsActive(true);
        }, index * 800);
      } else {
        setLocalIsActive(false);
      }
    } else {
      setLocalIsActive(false);
    }

    return () => clearTimeout(timeoutId);
  }, [isActive, device.status, index]);

  useEffect(() => {
    if (localIsActive) {
      startStream();
    } else {
      stopStream();
    }
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localIsActive, mode, playbackTime, playbackEndTime]); // Re-run if these change while active

  const startStream = () => {
    if (!accessToken) return;

    setIsLoading(true);
    setError(null);
    stopStream();

    const cleanSerial = device.deviceSerial.trim().toUpperCase();
    const domain = region === 'https://open.ys7.com' ? 'open.ys7.com' : 'open.ezviz.com';
    const recSuffix = recType === 'cloud' ? '.cloud.rec' : '.rec';

    // Ensure time strings are exactly 14 characters (yyyyMMddHHmmss)
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
        staticPath: '/ezuikit_static',
        ...(region !== 'https://open.ys7.com' ? { env: { domain: region } } : {}),
        handleError: (err: any) => {
          console.error(`EZUIKit Error (${device.deviceSerial}):`, err);
          setError("Device Offline");
          setIsLoading(false);
          setIsPlaying(false);
          if (device.status !== 0) {
            onStatusChange(device.deviceSerial, device.channelNo, 0);
          }
        },
        handleSuccess: () => {
          setIsPlaying(true);
          setIsLoading(false);
          setError(null);
          if (device.status !== 1) {
            onStatusChange(device.deviceSerial, device.channelNo, 1);
          }
        }
      });
    } catch (err) {
      setError("Init error");
      setIsLoading(false);
      setIsPlaying(false);
    }
  };

  const stopStream = () => {
    if (playerRef.current) {
      try {
        playerRef.current.stop();
      } catch (e) { }
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
            title={localIsActive ? "Stop Stream" : "Start Stream"}
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
      <div className="camera-footer">
        <span className="camera-meta">CH: {device.channelNo}</span>
        <span className="camera-meta">{device.deviceSerial}</span>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  // Config State
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');

  const [mode, setMode] = useState<'live' | 'rec'>('live');
  const [playbackTime, setPlaybackTime] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"));
  const [playbackEndTime, setPlaybackEndTime] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"));
  const [recType, setRecType] = useState<'local' | 'cloud'>('local');
  const [region, setRegion] = useState('https://isgpopen.ezvizlife.com');

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

  const updateDeviceStatus = (deviceSerial: string, channelNo: number, status: number) => {
    setDevices(prevDevices =>
      prevDevices.map(d =>
        (d.deviceSerial === deviceSerial && d.channelNo === channelNo)
          ? { ...d, status }
          : d
      )
    );
  };

  // Fetch token if AppKey/Secret are provided
  const fetchToken = async () => {
    if (!appKey || !appSecret) {
      setError("Please provide both AppKey and AppSecret");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${region}/api/lapp/token/get`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `appKey=${appKey}&appSecret=${appSecret}`,
      });

      const data = await response.json();

      if (data.code === '200') {
        setAccessToken(data.data.accessToken);
        setError(null);
      } else {
        setError(data.msg || "Failed to fetch token");
      }
    } catch (err) {
      setError("Network error while fetching token");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDevices = async () => {
    if (!accessToken) {
      setError("Access Token is required to fetch devices.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${region}/api/lapp/camera/list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        // We fetch up to 50 devices
        body: `accessToken=${accessToken}&pageStart=0&pageSize=50`,
      });

      const data = await response.json();

      if (data.code === '200') {
        setDevices(data.data);
        setError(null);
        setIsAllActive(true); // Autoplay all online cameras when successfully fetched
      } else {
        setError(data.msg || "Failed to fetch device list");
      }
    } catch (err) {
      setError("Network error while fetching device list");
    } finally {
      setIsLoading(false);
    }
  };

  // Background polling to update device status (Online/Offline) every 30 seconds
  useEffect(() => {
    if (!accessToken || devices.length === 0) return;

    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(`${region}/api/lapp/camera/list`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `accessToken=${accessToken}&pageStart=0&pageSize=50`,
        });

        const data = await response.json();

        if (data.code === '200' && data.data) {
          setDevices(prevDevices => {
            let hasChanges = false;
            const updatedDevices = prevDevices.map(prevDev => {
              const freshDev = data.data.find((d: any) => d.deviceSerial === prevDev.deviceSerial && d.channelNo === prevDev.channelNo);
              if (freshDev && freshDev.status !== prevDev.status) {
                hasChanges = true;
                return { ...prevDev, status: freshDev.status };
              }
              return prevDev;
            });

            return hasChanges ? updatedDevices : prevDevices;
          });
        }
      } catch (err) {
        console.error("Background polling failed", err);
      }
    }, 30000); // 30 seconds interval

    return () => clearInterval(intervalId);
  }, [accessToken, region, devices.length]);

  const toggleAllStreams = () => {
    if (devices.length === 0) {
      setError("No devices available. Please fetch devices first.");
      return;
    }
    setIsAllActive(!isAllActive);
  };

  const handleDownload = async () => {
    if (!accessToken || !selectedRecDevice) return;

    setIsDownloading(true);
    setError(null);

    try {
      const [deviceSerial, channelNo] = selectedRecDevice.split('-');

      // Convert time to milliseconds for the API
      const startMs = new Date(playbackTime).getTime();
      const endMs = new Date(playbackEndTime).getTime();

      const response = await fetch(`${region}/api/lapp/video/by/time`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `accessToken=${accessToken}&deviceSerial=${deviceSerial}&channelNo=${channelNo}&startTime=${startMs}&endTime=${endMs}&stopTime=${endMs}&type=${recType === 'cloud' ? 1 : 2}&recType=${recType === 'cloud' ? 1 : 2}`,
      });

      const data = await response.json();
      console.log("Video search API response:", data);

      if (data.code === '200') {
        if (data.data && data.data.length > 0) {
          const segment = data.data[0];
          if (segment.downloadPath) {
            window.open(segment.downloadPath, '_blank');
          } else {
            setError("No direct download link available. Note: Downloading SD Card recordings directly via Web is not supported by EZVIZ API. Please use EZVIZ Studio PC.");
          }
        } else {
          setError(`No video recordings found for the selected time range. Note: Direct download of SD Card recordings is restricted by EZVIZ API. Please use EZVIZ Studio PC.`);
        }
      } else {
        setError(data.msg || "Failed to search for video recordings");
      }
    } catch (err) {
      setError("Network error while trying to download video");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="app-container">
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => setIsSidebarVisible(!isSidebarVisible)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            title="Toggle Sidebar"
          >
            <Menu size={24} />
          </button>
          <div className="logo">PLN UP2D BANTEN CCTV-AI</div>
        </div>
        <div className="status-badge">
          <Info size={14} />
          {devices.length > 0 ? `${devices.length} Cameras Loaded` : 'SDK v5.1.18 Ready'}
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

            <div className="input-group">
              <label><Key size={14} style={{ marginBottom: -2, marginRight: 4 }} /> Access Token</label>
              <input
                type="password"
                placeholder="Paste your accessToken here"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label>Server Region</label>
              <select value={region} onChange={(e) => { setRegion(e.target.value); setDevices([]); setIsAllActive(false); setSelectedRecDevice(''); setIsSingleRecActive(false); }}>
                <option value="https://isgpopen.ezvizlife.com">Asia/Singapore</option>
                <option value="https://iusopen.ezvizlife.com">North America</option>
                <option value="https://isaopen.ezvizlife.com">South America</option>
                <option value="https://ieuopen.ezvizlife.com">Europe</option>
                <option value="https://iindiaopen.ezvizlife.com">India</option>
                <option value="https://open.ys7.com">China (ys7.com)</option>
              </select>
            </div>

            <details style={{ marginBottom: '1.5rem' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                Don't have a token? Use AppKey / Secret
              </summary>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
                <div className="input-group">
                  <input
                    type="text"
                    placeholder="AppKey"
                    value={appKey}
                    onChange={(e) => setAppKey(e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <input
                    type="password"
                    placeholder="AppSecret"
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                  />
                </div>
              </div>
              <button className="btn btn-secondary" onClick={fetchToken} style={{ marginBottom: '1rem' }} disabled={isLoading}>
                {isLoading && !accessToken ? 'Fetching...' : 'Fetch Token from API'}
              </button>
            </details>

            <button className="btn btn-primary" onClick={fetchDevices} style={{ marginBottom: '1.5rem' }} disabled={isLoading || !accessToken}>
              <Camera size={18} />
              {isLoading && accessToken ? 'Fetching Devices...' : 'Fetch Device List'}
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
                      )
                    })}
                  </select>
                </div>
              </>
            )}

            <div className="controls-grid" style={{ marginTop: '2rem' }}>
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
              <p>Enter your Access Token and click "Fetch Device List" to load your cameras.</p>
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
