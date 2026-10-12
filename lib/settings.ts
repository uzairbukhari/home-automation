import { defaultTariffSettings, type TariffSettings } from './tariff';
export type Settings={unitRate:number;referenceRate:number;fixedCharges:number;adjustments:number;billingDay:number;capacity:number;threshold:number;timeOfUse:boolean;peakRate:number;offPeakRate:number;peakStart:string;peakEnd:string;tariffSettings:TariffSettings};
export const defaults:Settings={unitRate:13.01,referenceRate:10.54,fixedCharges:300,adjustments:0,billingDay:1,capacity:5.2,threshold:39,timeOfUse:false,peakRate:46.85,offPeakRate:34.53,peakStart:'17:00',peakEnd:'22:00',tariffSettings:defaultTariffSettings};
