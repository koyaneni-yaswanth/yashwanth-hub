/**
 * Wind Turbine & Robotics Bench Telemetry CSV Parser + WebSerial DAQ Bridge.
 *
 * Computes P = V * I, validates >= 1 Hz continuous sample rate for V3F compliance,
 * detects cut-in wind speed, estimates tip-speed ratio (TSR), bins empirical P-v curves,
 * and bridges WebSerial USB DAQ streams cleanly without fabricating sensor frames.
 */

export interface TelemetrySample {
  timeSec: number | null;
  windSpeedMs: number;
  voltageV: number;
  currentA: number;
  powerW: number;
  rpm?: number;
}

export interface PvCurveBin {
  windBinMs: number;
  avgPowerW: number;
  peakPowerW: number;
  avgRpm: number | null;
  samples: number;
}

export interface TelemetryAnalysisResult {
  sampleCount: number;
  durationSec: number;
  sampleRateHz: number | null;
  meetsV3f1HzRequirement: boolean;
  cutInWindSpeedMs: number | null;
  peakPowerW: number;
  peakPowerWindMs: number | null;
  avgRpm: number | null;
  maxRpm: number | null;
  tipSpeedRatioAtPeak: number | null;
  pvCurveBins: PvCurveBin[];
  warnings: string[];
  samples: TelemetrySample[];
}

export interface StoredPvTelemetrySummary {
  capturedAt: string;
  fileName: string;
  sampleCount: number;
  durationSec: number;
  sampleRateHz: number | null;
  meetsV3f1HzRequirement: boolean;
  cutInWindSpeedMs: number | null;
  peakPowerW: number;
  peakPowerWindMs: number | null;
  tipSpeedRatioAtPeak: number | null;
  pvCurveBins: PvCurveBin[];
}

export const SYNTHETIC_DEMO_CSV = [
  'time_s,wind_speed_ms,voltage_v,current_a,rpm',
  '0.0,1.6,0.2,0.00,12',
  '1.0,2.2,1.8,0.18,54',
  '2.0,2.6,3.4,0.42,88',
  '3.0,3.1,5.6,0.85,132',
  '4.0,3.6,7.8,1.35,174',
  '5.0,4.2,10.4,2.10,218',
  '6.0,4.8,13.2,2.95,260',
  '7.0,5.5,16.1,4.05,312',
  '8.0,6.1,18.9,5.15,355',
  '9.0,6.6,21.2,6.05,388',
  '10.0,7.0,22.8,6.75,412',
].join('\n');

function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  for (const cand of candidates) {
    const exact = headers.indexOf(cand);
    if (exact !== -1) return exact;
  }
  for (const cand of candidates) {
    const partial = headers.findIndex((h) => h.includes(cand));
    if (partial !== -1) return partial;
  }
  return -1;
}

function parseTimeSeconds(raw: string, baseMsRef: { value: number | null }): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return numeric;
  const parsedMs = Date.parse(trimmed);
  if (Number.isFinite(parsedMs)) {
    if (baseMsRef.value === null) baseMsRef.value = parsedMs;
    return (parsedMs - baseMsRef.value) / 1000;
  }
  return null;
}

export function parseTelemetryCsv(
  csvText: string,
  options: { rotorRadiusM?: number; cutInMinWatts?: number } = {},
): TelemetryAnalysisResult {
  const rotorRadiusM = Number(options.rotorRadiusM ?? 0.45);
  const cutInMinWatts = Number(options.cutInMinWatts ?? 0.5);

  const lines = String(csvText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length < 2) {
    return {
      sampleCount: 0,
      durationSec: 0,
      sampleRateHz: null,
      meetsV3f1HzRequirement: false,
      cutInWindSpeedMs: null,
      peakPowerW: 0,
      peakPowerWindMs: null,
      avgRpm: null,
      maxRpm: null,
      tipSpeedRatioAtPeak: null,
      pvCurveBins: [],
      warnings: ['Provide a CSV header row plus at least 1 telemetry sample row.'],
      samples: [],
    };
  }

  const delimiter = lines[0].includes('\t') && !lines[0].includes(',') ? '\t' : ',';
  const headers = lines[0].split(delimiter).map(normalizeHeader);

  const timeIdx = findColumnIndex(headers, ['time_s', 'time_sec', 'timestamp', 'time', 't_s', 'elapsed_s']);
  const windIdx = findColumnIndex(headers, ['wind_speed_ms', 'wind_ms', 'wind_speed', 'wind', 'v_wind']);
  const voltIdx = findColumnIndex(headers, ['voltage_v', 'voltage', 'volts', 'v_bus', 'v']);
  const currIdx = findColumnIndex(headers, ['current_a', 'current', 'amps', 'i_load', 'i']);
  const powerIdx = findColumnIndex(headers, ['power_w', 'power', 'watts', 'p_w']);
  const rpmIdx = findColumnIndex(headers, ['rpm', 'rotor_rpm', 'speed_rpm']);

  const warnings: string[] = [];
  if (windIdx === -1) warnings.push('Missing wind speed column (expected wind_speed_ms or wind).');
  if (powerIdx === -1 && (voltIdx === -1 || currIdx === -1)) {
    warnings.push('Missing electrical power column (expected power_w or both voltage_v & current_a).');
  }
  if (timeIdx === -1) {
    warnings.push('No timestamp column found; sample rate >= 1 Hz cannot be verified.');
  }

  const samples: TelemetrySample[] = [];
  const baseMsRef: { value: number | null } = { value: null };

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map((c) => c.trim());
    const windSpeedMs = windIdx !== -1 ? Number(cols[windIdx]) : NaN;
    const voltageV = voltIdx !== -1 ? Number(cols[voltIdx]) : 0;
    const currentA = currIdx !== -1 ? Number(cols[currIdx]) : 0;
    const explicitPower = powerIdx !== -1 ? Number(cols[powerIdx]) : NaN;
    const powerW = Number.isFinite(explicitPower)
      ? explicitPower
      : Number((voltageV * currentA).toFixed(4));
    const rpmVal = rpmIdx !== -1 ? Number(cols[rpmIdx]) : NaN;
    const timeSec = timeIdx !== -1 ? parseTimeSeconds(cols[timeIdx] || '', baseMsRef) : null;

    if (!Number.isFinite(windSpeedMs) || !Number.isFinite(powerW)) continue;

    samples.push({
      timeSec,
      windSpeedMs: Number(windSpeedMs.toFixed(3)),
      voltageV: Number.isFinite(voltageV) ? voltageV : 0,
      currentA: Number.isFinite(currentA) ? currentA : 0,
      powerW: Number(powerW.toFixed(3)),
      rpm: Number.isFinite(rpmVal) ? rpmVal : undefined,
    });
  }

  const timed = samples.filter((s): s is TelemetrySample & { timeSec: number } => s.timeSec !== null);
  let durationSec = 0;
  let sampleRateHz: number | null = null;
  if (timed.length >= 2) {
    const sortedTimes = timed.map((s) => s.timeSec).sort((a, b) => a - b);
    durationSec = Number((sortedTimes[sortedTimes.length - 1] - sortedTimes[0]).toFixed(2));
    const deltas: number[] = [];
    for (let i = 1; i < sortedTimes.length; i++) {
      const dt = sortedTimes[i] - sortedTimes[i - 1];
      if (dt > 0) deltas.push(dt);
    }
    if (deltas.length > 0) {
      deltas.sort((a, b) => a - b);
      const medianDt = deltas[Math.floor(deltas.length / 2)];
      sampleRateHz = Number((1 / medianDt).toFixed(2));
    }
  }

  const meetsV3f1HzRequirement =
    samples.length >= 10 && sampleRateHz !== null && sampleRateHz >= 0.98;

  if (samples.length > 0 && sampleRateHz !== null && sampleRateHz < 0.98) {
    warnings.push(`Measured ${sampleRateHz} Hz sample rate is below the >= 1 Hz V3F evidence threshold.`);
  }
  if (samples.length > 0 && samples.length < 10) {
    warnings.push(`Captured ${samples.length} samples; capture at least 10 continuous samples for curve validation.`);
  }

  let peakSample: TelemetrySample | null = null;
  for (const s of samples) {
    if (!peakSample || s.powerW > peakSample.powerW) peakSample = s;
  }

  const positiveByWind = [...samples]
    .filter((s) => s.powerW >= cutInMinWatts)
    .sort((a, b) => a.windSpeedMs - b.windSpeedMs);
  const cutInWindSpeedMs = positiveByWind[0]?.windSpeedMs ?? null;

  const rpms = samples.map((s) => s.rpm).filter((v): v is number => typeof v === 'number');
  const avgRpm = rpms.length > 0 ? Number((rpms.reduce((a, b) => a + b, 0) / rpms.length).toFixed(1)) : null;
  const maxRpm = rpms.length > 0 ? Math.max(...rpms) : null;

  let tipSpeedRatioAtPeak: number | null = null;
  if (
    peakSample &&
    typeof peakSample.rpm === 'number' &&
    peakSample.windSpeedMs > 0.1 &&
    rotorRadiusM > 0
  ) {
    const omega = (2 * Math.PI * peakSample.rpm) / 60;
    tipSpeedRatioAtPeak = Number(((omega * rotorRadiusM) / peakSample.windSpeedMs).toFixed(2));
  }

  // Group into 0.5 m/s bins
  const binMap = new Map<number, TelemetrySample[]>();
  for (const s of samples) {
    const bin = Number((Math.round(s.windSpeedMs * 2) / 2).toFixed(1));
    const arr = binMap.get(bin) || [];
    arr.push(s);
    binMap.set(bin, arr);
  }

  const pvCurveBins: PvCurveBin[] = Array.from(binMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([windBinMs, list]) => {
      const avgPowerW = Number(
        (list.reduce((sum, x) => sum + x.powerW, 0) / list.length).toFixed(2),
      );
      const peakPowerW = Number(Math.max(...list.map((x) => x.powerW)).toFixed(2));
      const binRpms = list.map((x) => x.rpm).filter((v): v is number => typeof v === 'number');
      const binAvgRpm =
        binRpms.length > 0
          ? Number((binRpms.reduce((sum, x) => sum + x, 0) / binRpms.length).toFixed(1))
          : null;
      return {
        windBinMs,
        avgPowerW,
        peakPowerW,
        avgRpm: binAvgRpm,
        samples: list.length,
      };
    });

  return {
    sampleCount: samples.length,
    durationSec,
    sampleRateHz,
    meetsV3f1HzRequirement,
    cutInWindSpeedMs,
    peakPowerW: peakSample?.powerW ?? 0,
    peakPowerWindMs: peakSample?.windSpeedMs ?? null,
    avgRpm,
    maxRpm,
    tipSpeedRatioAtPeak,
    pvCurveBins,
    warnings,
    samples,
  };
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export async function connectBenchWebSerial(options: {
  baudRate?: number;
  onLine: (line: string) => void;
  onError?: (err: Error) => void;
}): Promise<{ disconnect: () => Promise<void> }> {
  if (!isWebSerialSupported()) {
    throw new Error('WebSerial is not supported in this browser. Use Desktop Chrome or Microsoft Edge over HTTPS/localhost.');
  }

  const serialApi = (navigator as any).serial;
  const port = await serialApi.requestPort();
  await port.open({ baudRate: options.baudRate ?? 115200 });

  const decoder = new TextDecoderStream();
  const readableClosed = port.readable.pipeTo(decoder.writable).catch(() => {});
  const reader = decoder.readable.getReader();

  let active = true;
  let buffer = '';

  const readLoop = (async () => {
    try {
      while (active) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const parts = buffer.split(/\r?\n/);
        buffer = parts.pop() || '';
        for (const rawLine of parts) {
          const trimmed = rawLine.trim();
          if (trimmed) options.onLine(trimmed);
        }
      }
    } catch (err) {
      if (active && options.onError) {
        options.onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  })();

  return {
    disconnect: async () => {
      active = false;
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      await readLoop.catch(() => {});
      await readableClosed;
      try {
        await port.close();
      } catch {
        /* ignore */
      }
    },
  };
}
