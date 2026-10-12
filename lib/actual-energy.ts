import type { EnergyReport } from './solar-energy';
import type { DailySummary } from './telemetry';
export function actualSummary(data:DailySummary,calculationVersion=3):DailySummary {
  return calculationVersion>=3&&data.energySource==='counter'?data:{...data,energyKwh:null,energySource:'missing',energyHours:0,partial:true};
}
export function actualSolarReport(data:EnergyReport):EnergyReport {
  return {...data,solarKwh:data.solarSource==='counter'?data.solarKwh:null,
    solarSource:data.solarSource==='counter'?'counter':'missing',homeKwh:null,gridKwh:null,
    directSolarKwh:null,batteryChargeKwh:null,batteryDischargeKwh:null,partial:true};
}
