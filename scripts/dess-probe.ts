// Run with: npm run dess:probe
// Dumps the raw plant/device list and last-data points for this DessMonitor
// account so we can confirm field ids in lib/dess/normalize.ts match the
// real inverter's output before trusting any dashboard numbers.
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

// Dynamic import: must happen after dotenv.config() above actually runs.
// A static top-level `import` here would be hoisted by esbuild/tsx ahead of
// the dotenv calls (even though it's written below them), which is exactly
// what broke this before — db/client.ts would read process.env before the
// .env.local values were loaded.
async function main() {
  const { queryPlants, queryCollectorsInPlant, queryDevicesInCollector, queryDeviceLastData, queryDeviceDataOneDayPaging } =
    await import("../lib/dess/client");

  const historyDate = process.argv.find((a) => a.startsWith("--history="))?.split("=")[1];

  console.log("Fetching plants...");
  const plants = await queryPlants();
  console.log(JSON.stringify(plants, null, 2));

  for (const plant of plants) {
    console.log(`\nFetching collectors for plant ${plant.pid} (${plant.name})...`);
    const collectors = await queryCollectorsInPlant(plant.pid);
    console.log(JSON.stringify(collectors, null, 2));

    for (const collector of collectors) {
      console.log(`\nFetching devices behind collector ${collector.pn}...`);
      const devices = await queryDevicesInCollector(collector.pn);
      console.log(JSON.stringify(devices, null, 2));

      for (const device of devices) {
        console.log(`\nFetching last data for device ${device.sn}...`);
        const points = await queryDeviceLastData(device);
        console.log(JSON.stringify(points, null, 2));

        if (historyDate) {
          console.log(`\nFetching ${historyDate} history for device ${device.sn}...`);
          const rows = await queryDeviceDataOneDayPaging(device, historyDate);
          console.log(`${rows.length} rows`);
          console.log(JSON.stringify(rows.slice(0, 2), null, 2));
        }
      }
    }
  }
}

main().catch((err) => {
  console.error("dess-probe failed:", err);
  // Not process.exit(1) — see the matching comment in tuya-probe.ts.
  process.exitCode = 1;
});
