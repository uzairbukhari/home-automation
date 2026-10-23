import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id").primaryKey(), unitRate: real("unit_rate").notNull().default(13.01), referenceRate: real("reference_rate").notNull().default(10.54),
  fixedCharges: real("fixed_charges").notNull().default(300), adjustments: real("adjustments").notNull().default(0), billingDay: integer("billing_day").notNull().default(1),
  capacity: real("battery_capacity").notNull().default(5.2), threshold: integer("battery_threshold").notNull().default(39), timeOfUse: integer("time_of_use", { mode: "boolean" }).notNull().default(false),
  peakRate: real("peak_rate").notNull().default(46.85), offPeakRate: real("off_peak_rate").notNull().default(34.53), peakStart: text("peak_start").notNull().default("17:00"), peakEnd: text("peak_end").notNull().default("22:00"),
  tariffSettings: text('tariff_settings').notNull().default('{}'),
  effectiveAt: text("effective_at").notNull().default(sql`CURRENT_TIMESTAMP`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const observations = sqliteTable("observations", {
  id: integer("id").primaryKey({ autoIncrement: true }), source: text("source").notNull(), entityId: text("entity_id").notNull(), metric: text("metric").notNull(),
  value: real("value"), unit: text("unit").notNull(), quality: text("quality").notNull().default("good"), sourceTimestamp: text("source_timestamp").notNull(), recordedAt: text("recorded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("idx_observations_dedupe").on(table.source,table.entityId,table.metric,table.sourceTimestamp),index("idx_observations_metric_time").on(table.metric,table.sourceTimestamp)]);

export const deviceCatalog = sqliteTable("device_catalog", {
  id:text("id").primaryKey(), source:text("source").notNull(), name:text("name").notNull(), category:text("category").notNull(), room:text("room"),
  online:integer("online",{mode:"boolean"}).notNull().default(false), capabilities:text("capabilities").notNull().default("[]"), updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tuyaDeviceState = sqliteTable("tuya_device_state", {
  deviceId:text("device_id").notNull(), code:text("code").notNull(), valueJson:text("value_json").notNull(), valueType:text("value_type").notNull(),
  numericValue:real("numeric_value"), unit:text("unit").notNull().default(""), sourceTimestamp:text("source_timestamp").notNull(), recordedAt:text("recorded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [primaryKey({ columns:[table.deviceId,table.code,table.sourceTimestamp] }),index("idx_tuya_state_device_time").on(table.deviceId,table.sourceTimestamp)]);

export const tuyaDevicePreferences = sqliteTable("tuya_device_preferences", {
  deviceId:text("device_id").primaryKey(), roomOverride:text("room_override"), updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tuyaCommandLog = sqliteTable("tuya_command_log", {
  id:integer("id").primaryKey({autoIncrement:true}), deviceId:text("device_id").notNull(), code:text("code").notNull(), requestedValue:text("requested_value").notNull(),
  status:text("status").notNull(), error:text("error"), requestedAt:text("requested_at").notNull().default(sql`CURRENT_TIMESTAMP`), confirmedAt:text("confirmed_at"),
}, table => [index("idx_tuya_commands_device_time").on(table.deviceId,table.requestedAt)]);

export const tuyaCollectionRuns = sqliteTable("tuya_collection_runs", {
  id:integer("id").primaryKey({autoIncrement:true}), startedAt:text("started_at").notNull(), finishedAt:text("finished_at"), status:text("status").notNull(),
  deviceCount:integer("device_count").notNull().default(0), readingCount:integer("reading_count").notNull().default(0), error:text("error"),
});

export const connectionState = sqliteTable("connection_state", {
  provider:text("provider").primaryKey(), status:text("status").notNull().default("not_configured"), lastSuccessAt:text("last_success_at"), lastErrorCode:text("last_error_code"), updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const providerCredentials = sqliteTable("provider_credentials", {
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [primaryKey({ columns:[table.userId,table.provider] })]);

export const dashboardFavorites = sqliteTable('dashboard_favorites', {
  userId: text('user_id').notNull(), kind: text('kind').notNull(), itemId: text('item_id').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [primaryKey({ columns: [table.userId,table.kind,table.itemId] })]);

export const solarSamples = sqliteTable('solar_samples', {
  entityId: text('entity_id').notNull(), sourceTimestamp: text('source_timestamp').notNull(), data: text('data').notNull(),
  recordedAt: text('recorded_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [primaryKey({ columns: [table.entityId,table.sourceTimestamp] }),index('idx_solar_samples_time').on(table.sourceTimestamp)]);

export const solarEnergyPeriods = sqliteTable('solar_energy_periods', {
  entityId: text('entity_id').notNull(), periodType: text('period_type').notNull(), period: text('period').notNull(),
  solar: real('solar_kwh'), grid: real('grid_kwh'), home: real('home_kwh'), source: text('solar_source').notNull(), gridSource: text('grid_source').notNull(),
  coveredHours: real('covered_hours').notNull().default(0), partial: integer('partial',{mode:'boolean'}).notNull().default(true),
  report: text('report_json'), updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [primaryKey({ columns: [table.entityId,table.periodType,table.period] })]);

export const solarCollectionRuns = sqliteTable('solar_collection_runs', {
  id: integer('id').primaryKey({autoIncrement:true}), startedAt: text('started_at').notNull(), finishedAt: text('finished_at'),
  status: text('status').notNull(), samples: integer('samples').notNull().default(0), error: text('error'),
});
export const solarSyncState = sqliteTable('solar_sync_state', {
  entityId: text('entity_id').primaryKey(), nextBackfillDate: text('next_backfill_date'), oldestDate: text('oldest_date'),
  recoveredThrough: text('recovered_through'), leaseUntil: text('lease_until'), leaseToken: text('lease_token'),
});
export const tuyaRooms = sqliteTable('tuya_rooms', {
  name: text('name').primaryKey(), createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const electricityTariffs = sqliteTable('electricity_tariffs', {
  id: text('id').primaryKey(), effectiveAt: text('effective_at').notNull(), source: text('source').notNull(), notification: text('notification').notNull(),
  rates: text('rates_json').notNull(), taxSources: text('tax_sources_json').notNull(), recordedAt: text('recorded_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const notificationRules=sqliteTable('notification_rules',{
  userId:text('user_id').notNull(),id:text('id').notNull(),config:text('config').notNull(),
},table=>[primaryKey({columns:[table.userId,table.id]})]);
export const pushSubscriptions=sqliteTable('push_subscriptions',{
  id:text('id').primaryKey(),userId:text('user_id').notNull(),subscription:text('subscription').notNull(),createdAt:text('created_at').notNull(),
},table=>[index('idx_push_user').on(table.userId)]);
export const notificationState=sqliteTable('notification_state',{
  userId:text('user_id').notNull(),ruleId:text('rule_id').notNull(),state:text('state').notNull(),
},table=>[primaryKey({columns:[table.userId,table.ruleId]})]);
export const notificationDeliveries=sqliteTable('notification_deliveries',{
  eventId:text('event_id').notNull(),subscriptionId:text('subscription_id').notNull(),userId:text('user_id').notNull(),ruleId:text('rule_id').notNull(),payload:text('payload').notNull(),
  attempts:integer('attempts').notNull().default(0),nextAttempt:text('next_attempt').notNull(),createdAt:text('created_at').notNull(),status:text('status').notNull().default('pending'),error:text('error'),
},table=>[primaryKey({columns:[table.eventId,table.subscriptionId]}),index('idx_notifications_pending').on(table.status,table.nextAttempt)]);
export const notificationHealth=sqliteTable('notification_health',{
  id:text('id').primaryKey(),leaseUntil:text('lease_until'),leaseToken:text('lease_token'),evaluatedAt:text('evaluated_at'),deliveredAt:text('delivered_at'),error:text('error'),
});

// Database-first telemetry, durable collection, commands and automation.
export const appJobs = sqliteTable('app_jobs', {
  id: text('id').primaryKey().notNull(),
  lease_token: text('lease_token'),
  lease_until: text('lease_until'),
  next_due: text('next_due'),
  last_success: text('last_success'),
  error: text('error'),
  updated_at: text('updated_at').notNull(),
});
export const providerRequests = sqliteTable('provider_requests', {
  id: integer('id').primaryKey({autoIncrement:true}),
  provider: text('provider').notNull(),
  purpose: text('purpose').notNull(),
  timestamp: text('timestamp').notNull(),
  status: integer('status'),
  error: text('error'),
}, t => [index('idx_provider_requests_time').on(t.timestamp)]);
export const tuyaLatest = sqliteTable('tuya_latest', {
  device_id: text('device_id').notNull(),
  code: text('code').notNull(),
  value_json: text('value_json').notNull(),
  numeric_value: real('numeric_value'),
  unit: text('unit').notNull().default(''),
  source_timestamp: text('source_timestamp').notNull(),
  collected_at: text('collected_at').notNull(),
  quality: text('quality').notNull(),
}, t => [primaryKey({columns:[t.device_id,t.code]})]);
export const deviceDetails = sqliteTable('device_details', {
  device_id: text('device_id').primaryKey().notNull(),
  snapshot: text('snapshot').notNull(),
  collected_at: text('collected_at').notNull(),
  metadata_at: text('metadata_at'),
  alias: text('alias'),
  channel_labels: text('channel_labels').notNull().default('{}'),
  upstream: integer('upstream').notNull().default(0),
});
export const deviceRoomHistory = sqliteTable('device_room_history', {
  device_id: text('device_id').notNull(),
  effective_at: text('effective_at').notNull(),
  room: text('room').notNull(),
}, t => [primaryKey({columns:[t.device_id,t.effective_at]})]);
export const tuyaSync = sqliteTable('tuya_sync', {
  device_id: text('device_id').primaryKey().notNull(),
  from_ms: integer('from_ms'),
  to_ms: integer('to_ms'),
  cursor: text('cursor'),
  covered_through: text('covered_through'),
  error: text('error'),
});
export const telemetrySummaries = sqliteTable('telemetry_summaries', {
  source: text('source').notNull(),
  entity_id: text('entity_id').notNull(),
  granularity: text('granularity').notNull(),
  period: text('period').notNull(),
  room: text('room').notNull().default(''),
  data: text('data').notNull(),
  calculation_version: integer('calculation_version').notNull().default(1),
  updated_at: text('updated_at').notNull(),
}, t => [primaryKey({columns:[t.source,t.entity_id,t.granularity,t.period,t.room]}),index('idx_summaries_period').on(t.source,t.granularity,t.period)]);
export const operationalDaily = sqliteTable('operational_daily', {
  date: text('date').notNull(),
  kind: text('kind').notNull(),
  data: text('data').notNull(),
}, t => [primaryKey({columns:[t.date,t.kind]})]);
export const settingsVersions = sqliteTable('settings_versions', {
  user_id: text('user_id').notNull(),
  effective_at: text('effective_at').notNull(),
  data: text('data').notNull(),
}, t => [primaryKey({columns:[t.user_id,t.effective_at]})]);
export const automationRules = sqliteTable('automation_rules', {
  id: text('id').primaryKey().notNull(),
  user_id: text('user_id').notNull(),
  config: text('config').notNull(),
  updated_at: text('updated_at').notNull(),
});
export const automationState = sqliteTable('automation_state', {
  rule_id: text('rule_id').primaryKey().notNull(),
  data: text('data').notNull(),
});
export const automationRuns = sqliteTable('automation_runs', {
  id: text('id').primaryKey().notNull(),
  rule_id: text('rule_id').notNull(),
  started_at: text('started_at').notNull(),
  status: text('status').notNull(),
  reason: text('reason'),
  inputs: text('inputs').notNull().default('[]'),
}, t => [index('idx_automation_runs_time').on(t.started_at)]);
export const automationActions = sqliteTable('automation_actions', {
  run_id: text('run_id').notNull(),
  action_index: integer('action_index').notNull(),
  command_id: integer('command_id'),
  status: text('status').notNull(),
  error: text('error'),
}, t => [primaryKey({columns:[t.run_id,t.action_index]})]);
export const automationControl = sqliteTable('automation_control', {
  id: text('id').primaryKey().notNull(),
  paused: integer('paused').notNull().default(0),
});
export const channelOverrides = sqliteTable('channel_overrides', {
  device_id: text('device_id').notNull(),
  code: text('code').notNull(),
  until: text('until').notNull(),
}, t => [primaryKey({columns:[t.device_id,t.code]})]);
export const tuyaGroups = sqliteTable('tuya_groups', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  actions: text('actions').notNull(),
});
export const commandContext = sqliteTable('command_context', {
  command_id: integer('command_id').primaryKey().notNull(),
  raw_value: text('raw_value').notNull(),
  origin: text('origin').notNull(),
  run_id: text('run_id'),
  expires_at: text('expires_at').notNull(),
});
export const solarRawFields = sqliteTable('solar_raw_fields', {
  entity_id: text('entity_id').notNull(),
  source_timestamp: text('source_timestamp').notNull(),
  data: text('data').notNull(),
  collected_at: text('collected_at').notNull(),
}, t => [primaryKey({columns:[t.entity_id,t.source_timestamp]})]);
export const tuyaObservations = sqliteTable('tuya_observations', {
  device_id: text('device_id').notNull(),
  code: text('code').notNull(),
  value_json: text('value_json').notNull(),
  source_timestamp: text('source_timestamp').notNull(),
  observed_at: text('observed_at').notNull(),
  quality: text('quality').notNull(),
}, t => [primaryKey({columns:[t.device_id,t.code,t.observed_at]}),index('idx_tuya_observed').on(t.device_id,t.observed_at),index('idx_tuya_obs_time').on(t.observed_at)]);
export const tuyaScenes = sqliteTable('tuya_scenes', {
  home_id: text('home_id').notNull(),
  scene_id: text('scene_id').notNull(),
  name: text('name').notNull(),
  updated_at: text('updated_at').notNull(),
}, t => [primaryKey({columns:[t.home_id,t.scene_id]})]);
export const capabilityVersions = sqliteTable('capability_versions', {
  device_id: text('device_id').notNull(),
  effective_at: text('effective_at').notNull(),
  data: text('data').notNull(),
}, t => [primaryKey({columns:[t.device_id,t.effective_at]})]);
export const historyCoverage = sqliteTable('history_coverage', {
  source: text('source').notNull(),
  entity_id: text('entity_id').notNull(),
  date: text('date').notNull(),
  status: text('status').notNull(),
  recorded_at: text('recorded_at').notNull(),
}, t => [primaryKey({columns:[t.source,t.entity_id,t.date]})]);

export const automationActivity = sqliteTable('automation_activity', {
  id: integer('id').primaryKey({autoIncrement:true}), rule_id: text('rule_id').notNull(),
  run_id: text('run_id'), command_id: integer('command_id'), occurred_at: text('occurred_at').notNull(),
  status: text('status').notNull(), reason: text('reason').notNull().default(''),
  inputs: text('inputs').notNull().default('[]'), previous_inputs: text('previous_inputs').notNull().default('[]'),
  rule_snapshot: text('rule_snapshot').notNull().default('{}'),
}, t=>[index('idx_activity_rule_time').on(t.rule_id,t.occurred_at),index('idx_activity_time').on(t.occurred_at)]);
export const providerBudget = sqliteTable('provider_budget', {
  provider:text('provider').notNull(), period:text('period').notNull(), used:integer('used').notNull().default(0),
}, t=>[primaryKey({columns:[t.provider,t.period]})]);
export const periodCoverage = sqliteTable('period_coverage', {
  provider:text('provider').notNull(), entity_id:text('entity_id').notNull(), period:text('period').notNull(),
  status:text('status').notNull(), updated_at:text('updated_at').notNull(),
},t=>[primaryKey({columns:[t.provider,t.entity_id,t.period]})]);
export const upgradeBackup = sqliteTable('upgrade_backup', {
  kind:text('kind').notNull(), record_key:text('record_key').notNull(), data:text('data').notNull(),
},t=>[primaryKey({columns:[t.kind,t.record_key]})]);
export const providerBackfill = sqliteTable('provider_backfill', {
  provider:text('provider').notNull(), entity_id:text('entity_id').notNull(), dataset:text('dataset').notNull(),
  oldest_covered:text('oldest_covered'), covered_through:text('covered_through'), cursor:text('cursor'),
  status:text('status').notNull().default('pending'), rows_total:integer('rows_total').notNull().default(0),
  error:text('error'), updated_at:text('updated_at').notNull(),
},t=>[primaryKey({columns:[t.provider,t.entity_id,t.dataset]})]);
export const providerDocuments = sqliteTable('provider_documents', {
  provider:text('provider').notNull(), entity_id:text('entity_id').notNull(), dataset:text('dataset').notNull(),
  data:text('data').notNull(), first_seen_at:text('first_seen_at').notNull(), updated_at:text('updated_at').notNull(),
},t=>[primaryKey({columns:[t.provider,t.entity_id,t.dataset]})]);
export const providerEvents = sqliteTable('provider_events', {
  provider:text('provider').notNull(), entity_id:text('entity_id').notNull(), event_time:text('event_time').notNull(),
  kind:text('kind').notNull(), code:text('code').notNull().default(''), data:text('data').notNull(),
},t=>[primaryKey({columns:[t.provider,t.entity_id,t.event_time,t.kind,t.code]})]);
