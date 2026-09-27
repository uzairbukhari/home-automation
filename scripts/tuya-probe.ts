// Run with: npm run tuya:probe
// Lists every linked Tuya device and its current status/DP codes, so
// components/device-card.tsx can be matched to real DP names per category.
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" }); // never overrides real process.env (e.g. a shell-exported prod DATABASE_URL for a one-off command)

// Dynamic import: see the comment in scripts/dess-probe.ts — a static
// top-level import here would be hoisted ahead of the dotenv calls above.
async function main() {
  const { listDevices, getDeviceStatus } = await import("../lib/tuya/client");

  const devices = await listDevices();
  console.log(JSON.stringify(devices, null, 2));

  for (const device of devices) {
    console.log(`\nStatus for ${device.name} (${device.id}, category ${device.category}):`);
    try {
      const status = await getDeviceStatus(device.id);
      console.log(JSON.stringify(status, null, 2));
    } catch (err) {
      // Some categories (hubs/gateways like "wg2") have no direct DP status
      // and return an error here — expected, not fatal. Keep going so one
      // unsupported device doesn't hide the rest of the probe output.
      console.log(`  (status query not supported for this device: ${err})`);
    }
  }
}

main().catch((err) => {
  console.error("tuya-probe failed:", err);
  // Not process.exit(1): the libsql (sqlite) client from lib/tuya/client's
  // token cache may still have an open native handle at this point, and a
  // hard exit races its cleanup — observed to crash Node on Windows
  // ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"). Setting
  // exitCode and letting the event loop drain naturally avoids that.
  process.exitCode = 1;
});
