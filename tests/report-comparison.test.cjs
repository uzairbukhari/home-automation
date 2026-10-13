/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {database}=require('./helpers.cjs');
const {energyReports}=require('../lib/reports.ts');
const {localDate,shiftDate}=require('../lib/measurements.ts');
test('household totals carry the previous period and the same dates a year earlier',async()=>{
 const {sqlite}=database();
 try{
  const today=localDate(),insert=sqlite.prepare("INSERT INTO solar_energy_periods(entity_id,period_type,period,solar_kwh,grid_kwh,home_kwh,solar_source,grid_source,covered_hours,partial) VALUES ('inv','day',?,?,?,NULL,'provider:ENERGY_TODAY','missing',24,0)");
  insert.run(today,6,null);insert.run(shiftDate(today,-1),5,null);insert.run(shiftDate(today,-365),4,null);
  const report=await energyReports('alice',new URLSearchParams({range:'custom',from:today,to:today}));
  assert.equal(report.household.solarKwh,6);
  assert.equal(report.comparison.previous.solarKwh,5);
  assert.equal(report.comparison.previous.from,shiftDate(today,-1));
  assert.equal(report.comparison.yearAgo.solarKwh,4);
  assert.equal(report.comparison.yearAgo.from,shiftDate(today,-365));
  assert.equal(report.comparison.yearAgo.homeKwh,null); // no inverter readings, so no home estimate
 }finally{sqlite.close();}
});
