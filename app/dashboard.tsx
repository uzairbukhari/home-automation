'use client';
import { OfflineLink as Link } from '@/components/app-shell';
import { freshness, freshnessLabel } from '@/lib/freshness';
import { homeCondition } from '@/lib/ui-presentation';
import { ProviderStatusList } from '@/components/provider-status';
import { LoadingCards, DeleteMenu } from '@/components/presentation';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { TriangleAlert, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DevicesDashboard } from '@/components/devices-dashboard';
const SolarDashboard = lazy(() =>
  import('@/components/solar-dashboard').then((module) => ({ default: module.SolarDashboard })),
);
import { AppShell, type AppPage } from '@/components/app-shell';
import { SettingsScreen } from '@/components/settings-screen';
import { useUrlState, useUnsavedChanges } from '@/hooks/use-app-navigation';
import { readJson, foregroundPoll, scheduledPoll, recall, remember } from '@/lib/client-data';
import { nextPollDelay, toSnapshot } from '@/lib/energy-flow';
import { SolarCard, BatteryCard } from '@/components/energy-cards';
import { EnergyScene } from '@/components/energy-scene/energy-scene';

import { useFavorites } from '@/hooks/use-favorites';
import { type ChartId } from '@/lib/favorites';
import { defaults, type Settings } from '@/lib/settings';
import type { TuyaDashboardDevice } from '@/lib/providers/tuya';
import { useOffline } from '@/components/mobile-support';
import type { DessSnapshot } from '@/lib/providers/dessmonitor';
function ConnectionsPanel({ embedded = false }: { embedded?: boolean }) {
  const offline = useOffline();
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [companyKey, setCompanyKey] = useState('');
  useUnsavedChanges(Boolean(username || password || companyKey));
  const [configured, setConfigured] = useState(false),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(''),
    [editing, setEditing] = useState(false),
    [statusKnown, setStatusKnown] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/provider-credentials')
      .then(async (response) => {
        if (!response.ok) throw new Error('Connection status is unavailable.');
        return response.json();
      })
      .then((data) => {
        if (active) {
          setConfigured(Boolean((data as { configured?: boolean }).configured));
          setStatusKnown(true);
        }
      })
      .catch(() => {
        if (active) setMessage('Connection status is unavailable.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save() {
    if (offline) return;
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/provider-credentials', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password, companyKey }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to save credentials');
      setConfigured(true);
      setUsername('');
      setPassword('');
      setCompanyKey('');
      setEditing(false);
      setMessage('Credentials saved securely. Provider verification is the next step.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save credentials');
    } finally {
      setLoading(false);
    }
  }
  async function remove() {
    if (offline) throw new Error('Reconnect to remove credentials.');
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/provider-credentials', { method: 'DELETE' });
      if (!response.ok) throw new Error('Unable to remove credentials');
      setConfigured(false);
      setUsername('');
      setPassword('');
      setCompanyKey('');
      setMessage('DessMonitor credentials removed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to remove credentials');
      throw error;
    } finally {
      setLoading(false);
    }
  }
  const content = (
    <div className="settings-body">
      <ProviderStatusList />
      <p className="source-note">
        Credentials are encrypted on the server and are never returned to your browser after saving.
      </p>
      <div className="setting-section credential-section">
        <div className="setting-heading">
          <span>DessMonitor</span>
          <Badge variant="outline">
            {loading
              ? 'Checking connection…'
              : configured
                ? 'Credentials saved'
                : message
                  ? 'Status unavailable'
                  : 'Not connected'}
          </Badge>
        </div>
        {configured && (
          <div className="credential-saved">
            <ShieldCheck />
            <div>
              <strong>Encrypted credentials are stored</strong>
              <span>Your inverter connection is configured for monitoring.</span>
            </div>
          </div>
        )}
        {configured && !editing && (
          <Button variant="outline" disabled={offline || loading} onClick={() => setEditing(true)}>
            Update credentials
          </Button>
        )}
        {!loading && statusKnown && (!configured || editing) && (
          <>
            <label>
              Account username
              <Input
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="DessMonitor username"
              />
            </label>
            <label>
              Account password
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={configured ? 'Enter to replace saved password' : 'DessMonitor password'}
              />
            </label>
            <label>
              Company key
              <Input
                type="password"
                autoComplete="off"
                value={companyKey}
                onChange={(event) => setCompanyKey(event.target.value)}
                placeholder={configured ? 'Enter to replace saved company key' : 'Manufacturer-issued company key'}
              />
            </label>
            <p className="source-note">
              Saving these values only authorizes read-only monitoring. It cannot change inverter settings.
            </p>
          </>
        )}
      </div>
      {message && (
        <div className="connection-message" role="status">
          {message}
        </div>
      )}
      {statusKnown && (!configured || editing) && (
        <Button
          className="save-settings"
          onClick={save}
          disabled={offline || loading || !username || !password || !companyKey}
        >
          {loading ? 'Please wait…' : configured ? 'Replace credentials' : 'Save credentials'}
        </Button>
      )}
      {configured && (
        <div className="credential-actions">
          <span>Remove saved DessMonitor credentials</span>
          <DeleteMenu name="DessMonitor credentials" onDelete={remove} disabled={offline || loading} />
        </div>
      )}
    </div>
  );
  return embedded ? (
    content
  ) : (
    <SheetContent className="settings-sheet connections-sheet overflow-y-auto">
      <SheetHeader>
        <SheetTitle>Provider connections</SheetTitle>
        <SheetDescription>Review your solar connection.</SheetDescription>
      </SheetHeader>
      {content}
    </SheetContent>
  );
}

type DashboardPage = AppPage;
export default function Dashboard({ viewerName, page = 'overview' }: { viewerName: string; page?: DashboardPage }) {
  const offline = useOffline();
  const [connection, setConnection, closeConnection] = useUrlState('connection', '');
  const [settingsCategory] = useUrlState('category', '');
  const needsSolar = page === 'overview' || page === 'solar',
    needsTuya =
      page === 'overview' || page === 'devices' || (page === 'settings' && settingsCategory === 'notifications');
  const [syncNote, setSyncNote] = useState('');
  const [clock, setClock] = useState(0),
    [settingsLoaded, setSettingsLoaded] = useState(() => recall('settings') !== undefined);
  useEffect(() => foregroundPoll(() => setClock(Date.now()), 60000), []);
  const [settings, setSettings] = useState(() => recall<Settings>('settings') ?? defaults),
    [settingsError, setSettingsError] = useState(''),
    [live, setLive] = useState<DessSnapshot | null>(
      () => recall<DessSnapshot>(page === 'overview' ? 'solar-summary' : 'solar-latest') ?? null,
    ),
    [liveError, setLiveError] = useState(''),
    [tuyaDevices, setTuyaDevices] = useState<TuyaDashboardDevice[]>(
      () => recall<TuyaDashboardDevice[]>('devices') ?? [],
    ),
    [tuyaError, setTuyaError] = useState(''),
    [tuyaLoading, setTuyaLoading] = useState(() => recall('devices') === undefined),
    favorites = useFavorites();
  const updatedAt = useRef<string | undefined>(live?.updatedAt);
  useEffect(() => {
    if (!needsSolar) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout>,
      attempts = 0;
    async function refresh() {
      try {
        const data = await readJson<DessSnapshot & { error?: string; refreshing?: boolean }>(
          page === 'overview' ? '/api/solar/latest?summary=1' : '/api/solar/latest',
        );
        if (controller.signal.aborted) return;
        updatedAt.current = data.updatedAt;
        setLive(remember(page === 'overview' ? 'solar-summary' : 'solar-latest', data));
        setLiveError(data.error ?? '');
        clearTimeout(retry);
        if (data.refreshing && attempts++ < 3)
          retry = setTimeout(() => {
            if (!controller.signal.aborted && document.visibilityState !== 'hidden' && navigator.onLine) void refresh();
          }, 5000);
      } catch (reason) {
        if (!controller.signal.aborted)
          setLiveError(reason instanceof Error ? reason.message : 'DessMonitor unavailable');
      }
    }
    const stop = scheduledPoll(refresh, () => nextPollDelay(updatedAt.current));
    return () => {
      controller.abort();
      clearTimeout(retry);
      stop();
    };
  }, [needsSolar, page]);
  async function refreshTuya() {
    setTuyaLoading(true);
    try {
      const data = await readJson<{
        devices: TuyaDashboardDevice[];
        error?: string;
        synchronization?: { intervalMs: number; limitation: string | null };
      }>('/api/devices');
      if (!data.devices) throw new Error(data.error || 'Devices unavailable');
      setTuyaDevices(remember('devices', data.devices));
      if (data.synchronization)
        setSyncNote(
          data.synchronization.limitation ?? `Scheduled updates every ${data.synchronization.intervalMs / 60000} min.`,
        );
      setTuyaError(data.error ?? '');
    } catch (reason) {
      setTuyaError(reason instanceof Error ? reason.message : 'Tuya unavailable');
    } finally {
      setTuyaLoading(false);
    }
  }
  useEffect(() => {
    if (!needsTuya) return;
    let active = true;
    let refreshing = false;
    let opened = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        if (active) await refreshTuya();
        if (page === 'devices' && !opened && navigator.onLine) {
          opened = true;
          await fetch('/api/devices/refresh', { method: 'POST' }).catch(() => {});
          if (active) await refreshTuya();
        }
      } finally {
        refreshing = false;
      }
    };
    const stop = foregroundPoll(() => void refresh(), 300000);
    return () => {
      active = false;
      stop();
    };
  }, [needsTuya, page]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/settings', { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as Settings & { error?: string };
        if (!response.ok) throw new Error(data.error || 'Settings unavailable');
        setSettings(remember('settings', data));
        setSettingsLoaded(true);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setSettingsError(reason instanceof Error ? reason.message : 'Settings unavailable');
      });
    return () => controller.abort();
  }, []);
  const readings = new Map((live?.readings ?? []).map((r) => [r.metric, r])),
    value = (metric: string) => readings.get(metric)?.value ?? null,
    solar = value('solar_power'),
    home = value('home_power'),
    grid = value('grid_power'),
    battery = value('battery_soc'),
    solarToday = value('solar_today'),
    fresh =
      !offline &&
      Boolean(
        live &&
        !liveError &&
        !freshness(live.updatedAt, 300000, clock).stale &&
        live.readings.some((r) => r.quality === 'good'),
      );
  const snapshot = useMemo(
    () => toSnapshot(live?.readings ?? [], live?.updatedAt ?? '', fresh, live?.device.mode ?? null),
    [live, fresh],
  );
  const pinnedDevices = tuyaDevices.filter((d) => favorites.has('device', d.id)),
    pinnedCharts = favorites.favorites.filter((f) => f.kind === 'chart').map((f) => f.itemId as ChartId),
    pin = {
      has: (id: ChartId) => favorites.has('chart', id),
      toggle: (id: ChartId) => favorites.toggle('chart', id),
      busy: !favorites.loaded || Boolean(favorites.pending),
    },
    deviceFavorites = {
      has: (id: string) => favorites.has('device', id),
      toggle: (id: string) => favorites.toggle('device', id),
      busy: pin.busy,
    };
  const status = offline
    ? 'Offline · saved readings'
    : !needsSolar
      ? page === 'devices'
        ? tuyaError
          ? 'Connection issue'
          : tuyaLoading && !tuyaDevices.length
            ? 'Loading your devices…'
            : tuyaDevices.some((d) => d.stale)
              ? 'Saved device data · update delayed'
              : 'Devices synced'
        : 'Online'
      : !live
        ? liveError
          ? 'Energy unavailable'
          : 'Loading energy readings…'
        : liveError || !fresh
          ? `Saved readings · ${freshnessLabel(live.updatedAt).toLowerCase()}`
          : freshnessLabel(live.updatedAt);
  const attention = [
    battery !== null && settingsLoaded && battery < settings.threshold
      ? `Battery below your ${settings.threshold}% dashboard reserve`
      : null,
    !tuyaLoading && tuyaDevices.some((d) => !d.online)
      ? `${tuyaDevices.filter((d) => !d.online).length} devices unavailable`
      : null,
  ].filter(Boolean);
  return (
    <AppShell
      page={page}
      status={
        <>
          <span className={`status-dot ${fresh ? 'live' : ''}`} />
          {status}
        </>
      }
    >
      {(liveError || tuyaError) && !offline && (
        <div className="connection-alert" role="status">
          <span>{liveError || tuyaError}</span>
          <Link href="/settings?category=connections">Check connections</Link>
        </div>
      )}
      {(favorites.error || settingsError) && (
        <div className="device-notice" role="alert">
          {favorites.error || settingsError}
        </div>
      )}
      {page === 'overview' && (
        <>
          <div className="home-heading">
            <div>
              <h2>
                {homeCondition({
                  solar,
                  home,
                  grid,
                  charge: value('battery_charge_current'),
                  discharge: value('battery_discharge_current'),
                })}
              </h2>
              <p>
                {live
                  ? `${fresh ? 'Latest measurement' : 'Last reading'} · ${new Date(live.updatedAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', ...(fresh ? {} : { day: 'numeric', month: 'short' }), hour: '2-digit', minute: '2-digit' })}`
                  : 'Your home’s energy and favorite controls'}
              </p>
            </div>
          </div>
          {Boolean(attention.length) && (
            <div className="home-attention" role="status">
              <TriangleAlert />
              <span>{attention.join(' · ')}</span>
            </div>
          )}
          <section className="overview-grid">
            <Card className="hero-card">
              <EnergyScene snapshot={snapshot} capacity={settings.capacity} />
            </Card>
            <div className="metrics-grid">
              <SolarCard solarToday={solarToday} fresh={fresh} today={live?.today} snapshot={snapshot} />
              <BatteryCard
                snapshot={snapshot}
                capacity={settings.capacity}
                reserve={settings.threshold}
                today={live?.today}
              />
            </div>
          </section>
          {Boolean(pinnedDevices.length) && (
            <DevicesDashboard
              compact
              devices={pinnedDevices}
              error={tuyaError}
              loading={tuyaLoading}
              onRefresh={refreshTuya}
              favorites={deviceFavorites}
            />
          )}{' '}
          {Boolean(pinnedCharts.length) && (
            <section className="favorite-chart-summaries">
              <div className="section-heading">
                <h2>Favorite insights</h2>
                <Link href="/solar">See all</Link>
              </div>
              {pinnedCharts.map((id) => (
                <Link
                  className="insight-row"
                  key={id}
                  href={`/solar?section=${id === 'power-history' || id === 'soc-history' ? 'history' : 'overview'}&chart=${id}`}
                >
                  <span>
                    {
                      {
                        'power-history': 'Production & demand',
                        'energy-totals': 'Solar production & grid use',
                        'soc-history': 'State of charge',
                        'battery-window': 'Battery energy window',
                      }[id]
                    }
                  </span>
                  <strong>
                    {id === 'power-history'
                      ? home === null
                        ? '—'
                        : (home / 1000).toFixed(2) + ' kW load'
                      : id === 'energy-totals'
                        ? solarToday === null
                          ? '—'
                          : solarToday.toFixed(2) + ' kWh today'
                        : battery === null
                          ? '—'
                          : battery.toFixed(0) + '% charge'}
                  </strong>
                  <span aria-hidden="true">›</span>
                </Link>
              ))}
            </section>
          )}
          {(!favorites.loaded || (tuyaLoading && !tuyaDevices.length)) && (
            <LoadingCards label="Loading favorite controls" />
          )}
          {favorites.loaded &&
            !favorites.error &&
            !tuyaError &&
            !tuyaLoading &&
            !pinnedDevices.length &&
            !pinnedCharts.length && (
              <section className="favorites-empty">
                <h2>Make this dashboard yours</h2>
                <p>Star devices in Devices and charts in Energy to keep your favorites here.</p>
                <div>
                  <Link href="/devices">Choose devices</Link>
                  <Link href="/solar">Choose charts</Link>
                </div>
              </section>
            )}
        </>
      )}
      {page === 'solar' && (
        <Suspense
          fallback={
            <div className="screen-loading" role="status">
              Loading Energy…
            </div>
          }
        >
          <SolarDashboard live={live} settings={settings} pin={pin} showReports />
        </Suspense>
      )}
      {page === 'devices' && (
        <>
          <DevicesDashboard
            devices={tuyaDevices}
            error={tuyaError}
            loading={tuyaLoading}
            onRefresh={refreshTuya}
            favorites={deviceFavorites}
          />
          {syncNote && (
            <details className="report-diagnostics">
              <summary>Update information</summary>
              <p>{syncNote}</p>
            </details>
          )}
        </>
      )}
      {page === 'settings' && !settingsLoaded && (
        <div className="screen-loading" role="status">
          {settingsError ? 'Settings unavailable. Reconnect to load your saved settings.' : 'Loading your settings…'}
        </div>
      )}
      {page === 'settings' && settingsLoaded && (
        <SettingsScreen
          settings={settings}
          onChange={setSettings}
          devices={tuyaDevices}
          viewerName={viewerName}
          connections={<ConnectionsPanel embedded />}
          onConnections={() => setConnection('providers', true)}
        />
      )}
      <Sheet
        open={Boolean(connection)}
        onOpenChange={(open) => {
          if (!open) closeConnection();
        }}
      >
        {connection && <ConnectionsPanel />}
      </Sheet>
    </AppShell>
  );
}
