import { finiteNumber,normalizeMeasurement } from './measurements';
import type { TuyaCapability, TuyaValue } from './providers/tuya';

const labels: Record<string, string> = {
  switch: 'Power', switch_led: 'Light power', cur_power: 'Power consumption', cur_voltage: 'Voltage', cur_current: 'Current',
  add_ele: 'Energy used', total_forward_energy: 'Total energy used', forward_energy_total: 'Total energy used',
  bright_value: 'Brightness', bright_value_v2: 'Brightness', temp_value: 'Colour temperature', temp_value_v2: 'Colour temperature',
  colour_data: 'Light colour', colour_data_v2: 'Light colour', work_mode: 'Lighting mode', countdown: 'Auto-off timer', countdown_1: 'Auto-off timer',
  relay_status: 'Power after restart', child_lock: 'Child lock', light_mode: 'Indicator light', indicator_status: 'Indicator light',
  temp_set: 'Target temperature', temp_current: 'Temperature', humidity_value: 'Humidity', fan_speed_percent: 'Fan speed',
  mode: 'Operating mode', fault: 'Device alerts', overcharge_switch: 'Overload protection', cycle_time: 'Repeat timer', random_time: 'Random timer',
  switch_inching: 'Momentary switch', power_on_state: 'Power after restart', led_type: 'Indicator mode', switch_backlight: 'Backlight',
};
const options: Record<string, string> = { white: 'White light', colour: 'Colour light', scene: 'Scene', music: 'Music sync',
  memory: 'Restore previous state', last: 'Restore previous state', off: 'Off', on: 'On', forward: 'Forward', reverse: 'Reverse',
  relay: 'Follow power state', pos: 'On when powered', none: 'Disabled', auto: 'Automatic', manual: 'Manual' };
export function friendlyLabel(code: string, providerName?: string) {
  if (labels[code]) return labels[code];
  const channel = /^switch_(\d+)$/.exec(code);
  if (channel) return `Power · channel ${channel[1]}`;
  const timer = /^countdown_(\d+)$/.exec(code);
  if (timer) return `Auto-off timer · channel ${timer[1]}`;
  const text = providerName && /^[\x20-\x7E°]+$/.test(providerName) ? providerName : code;
  return text.replaceAll('_', ' ').replace(/\s+/g, ' ').replace(/^./, c => c.toUpperCase());
}
export function friendlyOption(option: string) { return options[option] ?? friendlyLabel(option); }

export function decodeTuya(value: TuyaValue, cap?: TuyaCapability) {
  if (typeof value === 'number') {
    if (!cap?.metadataVerified) return { numericValue: null, unit: '', formatted: 'Unit unavailable', available: false };
    let numericValue = finiteNumber(value / 10 ** cap.scale);
    let unit = ({'秒':'s','分钟':'min','小时':'h','℃':'°C','kW·h':'kWh','kW.h':'kWh'} as Record<string,string>)[cap.unit]??cap.unit;
    const target=cap.code==='cur_power'?'W':cap.code==='cur_voltage'?'V':cap.code==='cur_current'?'A':/^(add_ele|total_forward_energy|forward_energy_total)$/.test(cap.code)?'kWh':null;
    if(target){const normalized=normalizeMeasurement(numericValue,unit,target);if(normalized!==null){numericValue=normalized;unit=target;}}

    const formatted = numericValue === null ? 'Unavailable' : `${new Intl.NumberFormat('en', { maximumFractionDigits: 3 }).format(numericValue)}${unit ? ` ${unit}` : ' · unit not supplied'}`;
    return { numericValue, unit, formatted, available: numericValue !== null };
  }
  return { numericValue: null, unit: cap?.unit ?? '', available: value !== null,
    formatted: typeof value === 'boolean' ? value ? 'On' : 'Off' : value === null ? 'Unavailable' : typeof value === 'object' ? 'Device configuration' : friendlyOption(String(value)) };
}
