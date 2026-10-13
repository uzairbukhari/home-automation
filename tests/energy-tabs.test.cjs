/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
require('./helpers.cjs');
const {legacyEnergyTab,energyTabForChart,ENERGY_TABS}=require('../lib/energy-tabs.ts');
const {selfSufficiency,todayVerdict,solarBucketVerdict}=require('../lib/energy-insights.ts');
test('old Energy links land on the matching new tab',()=>{
 assert.equal(legacyEnergyTab('reports',null,null),'trends');
 assert.equal(legacyEnergyTab('reports','performance',null),'trends');
 assert.equal(legacyEnergyTab('reports','appliances',null),'costs');
 assert.equal(legacyEnergyTab('reports','billing',null),'costs');
 assert.equal(legacyEnergyTab('history',null,'soc-history'),'battery');
 assert.equal(legacyEnergyTab('history',null,'power-history'),'today');
 assert.equal(legacyEnergyTab('overview',null,'energy-totals'),'trends');
 assert.equal(legacyEnergyTab('overview',null,'battery-window'),'battery');
 assert.equal(legacyEnergyTab('overview',null,null),'today');
 assert.equal(legacyEnergyTab(null,null,'energy-totals'),'trends');
});
test('current links and links with nothing to map are left alone',()=>{
 for(const tab of ENERGY_TABS)assert.equal(legacyEnergyTab(tab,null,'soc-history'),null);
 assert.equal(legacyEnergyTab(null,null,null),null);
 assert.equal(legacyEnergyTab('nonsense',null,null),null);
 assert.equal(energyTabForChart('nope'),undefined);
});
test('self-sufficiency is the share of home use not drawn from the grid',()=>{
 assert.equal(selfSufficiency(10,2),80);assert.equal(selfSufficiency(10,12),0);assert.equal(selfSufficiency(0,0),null);assert.equal(selfSufficiency(null,1),null);
});
test('today verdict reads the day in plain words',()=>{
 assert.match(todayVerdict({homeKwh:6.4,gridKwh:1.1,solarKwh:2.9}),/covered 83% of today's use; 1\.1 kWh came from the grid\. Solar made 2\.9 kWh\./);
 assert.match(todayVerdict({homeKwh:5,gridKwh:0,solarKwh:null}),/No grid power used today/);
 assert.match(todayVerdict({homeKwh:0.05,gridKwh:0,solarKwh:0}),/Not enough readings/);
 assert.match(todayVerdict(null),/Not enough readings/);
});
test('bucket verdict totals solar and names the best period',()=>{
 const text=solarBucketVerdict([{date:'2026-10-10',solar:3},{date:'2026-10-11',solar:5},{date:'2026-10-12',solar:null}],'day',d=>d.slice(8));
 assert.equal(text,'Solar made 8.0 kWh over 2 days, about 4.0 kWh a day. Best day: 11 with 5.0 kWh.');
 assert.equal(solarBucketVerdict([{date:'2026-10-10',solar:null}],'day',d=>d),null);
});
test('Energy renders the five tabs with a verdict and headline numbers on Today',()=>{
 const Module=require('node:module'),load=Module._load;
 Module._load=function(name,...args){return name==='next/navigation'?{usePathname:()=>'/solar',useRouter:()=>({push(){}})}:load.call(this,name,...args);};
 let html;
 try{
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{SolarDashboard}=require('../components/solar-dashboard.tsx'),{defaults}=require('../lib/settings.ts');
  const live={readings:[],series:[],device:{name:'x',serial:'1',collector:'c',mode:null},updatedAt:'2026-10-13T10:00:00Z',today:{solarKwh:2.9,homeKwh:6.4,gridKwh:1.1}};
  html=renderToStaticMarkup(React.createElement(SolarDashboard,{live,settings:defaults,pin:{has:()=>false,toggle(){},busy:false}}));
 }finally{Module._load=load;}
 for(const label of ['Today','Trends','Battery','Grid','Costs'])assert.ok(html.includes(`>${label}</button>`),label);
 assert.match(html,/covered 83% of today&#x27;s use; 1\.1 kWh came from the grid/);
 assert.match(html,/Self-sufficiency/);assert.match(html,/aria-label="Previous period"/);
});
