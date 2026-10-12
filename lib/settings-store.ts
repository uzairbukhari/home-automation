import { env } from 'cloudflare:workers';
import { defaults, type Settings } from './settings';
import { parseTariffSettings } from './tariff';
export async function savedSettings(userId:string):Promise<Settings>{
 if(!env.DB)throw new Error('Settings storage is unavailable');
 const row=await env.DB.prepare('SELECT * FROM user_settings WHERE user_id=?').bind(userId).first<Record<string,unknown>>();if(!row)return defaults;
 const keys:Record<keyof Omit<Settings,'tariffSettings'>,string>={unitRate:'unit_rate',referenceRate:'reference_rate',fixedCharges:'fixed_charges',adjustments:'adjustments',billingDay:'billing_day',capacity:'battery_capacity',threshold:'battery_threshold',timeOfUse:'time_of_use',peakRate:'peak_rate',offPeakRate:'off_peak_rate',peakStart:'peak_start',peakEnd:'peak_end'};
 return{...defaults,...Object.fromEntries(Object.entries(keys).map(([key,column])=>[key,key==='timeOfUse'?Boolean(row[column]):row[column]??defaults[key as keyof Settings]])),tariffSettings:parseTariffSettings(row.tariff_settings)};
}
