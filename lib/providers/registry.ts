import { cachedDevices } from '../tuya-store';
import { cachedSnapshot } from '../solar-store';
import { executeCommand } from '../commands';
import { deviceEnergy } from '../device-energy';
import type { ProviderId } from '../provider-policy';

// Adapters retain legacy IDs. Provider + ID is the public identity boundary.
export const providerRegistry = {
  tuya: {
    list: async () => (await cachedDevices(true)).map(device => ({...device, provider:'tuya' as const,ref:{provider:'tuya' as const,id:device.id}})),
    energy: (id:string,range:string) => deviceEnergy(id,range,'tuya'),
    command: (id:string,code:string,value:unknown) => executeCommand(id,code,value,{confirm:true}),
  },
  dessmonitor: {
    latest: () => cachedSnapshot(true,false),
    controllable: false,
  },
} satisfies Record<ProviderId,unknown>;
export function controlProvider(provider:string) {
  if(provider!=='tuya')throw new Error('This provider does not support device controls');
  return providerRegistry[provider];
}
