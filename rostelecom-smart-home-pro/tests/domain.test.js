import test from 'node:test';
import assert from 'node:assert/strict';
import {SmartHome,initialState} from '../src/domain.js';
const make=()=>new SmartHome(initialState(),()=>{});

test('initial state contains the demo device fleet and automation rules',()=>{const h=make();const s=h.snapshot();assert.equal(s.devices.length,9);assert.equal(s.rules.length,3);assert.equal(s.settings.simulation,true)});
test('light accepts values in range and rejects invalid brightness',()=>{const h=make();assert.equal(h.updateDevice('light-hall',{value:55}).value,55);assert.throws(()=>h.updateDevice('light-hall',{value:101}),/Яркость/)});
test('climate setpoint is bounded',()=>{const h=make();assert.equal(h.updateDevice('climate-living',{value:24}).value,24);assert.throws(()=>h.updateDevice('climate-living',{value:35}),/Температура/)});
test('plug only accepts boolean values',()=>{const h=make();assert.equal(h.updateDevice('plug-tv',{value:false}).value,false);assert.throws(()=>h.updateDevice('plug-tv',{value:'off'}),/true\/false/)});
test('motion simulation triggers enabled night-light rule',()=>{const h=make();const result=h.simulate('motion');assert.deepEqual(result.firedRules,['rule-night-motion']);assert.equal(h.snapshot().devices.find(d=>d.id==='light-hall').value,65);assert.ok(h.snapshot().events.some(e=>e.type==='automation.action'))});
test('door opening triggers alarm only when armed',()=>{const h=make();h.simulate('door_open');assert.equal(h.snapshot().devices.find(d=>d.id==='alarm-home').value,'alert');assert.ok(h.snapshot().events.some(e=>e.type==='security.alert'));const h2=make();h2.updateDevice('alarm-home',{value:'disarmed'});h2.simulate('door_open');assert.equal(h2.snapshot().devices.find(d=>d.id==='alarm-home').value,'disarmed');assert.ok(!h2.snapshot().events.some(e=>e.type==='security.alert'))});
test('rule toggle is persisted in domain state',()=>{const h=make();assert.equal(h.setRule('rule-night-motion',false).enabled,false);assert.deepEqual(h.simulate('motion').firedRules,[])});
test('unknown devices and simulation types return 404/400 errors',()=>{const h=make();assert.throws(()=>h.updateDevice('missing',{value:1}),e=>e.status===404);assert.throws(()=>h.simulate('warp'),e=>e.status===400)});
test('door and motion reset simulations clear sensor states',()=>{const h=make();h.simulate('motion');h.simulate('door_open');h.simulate('motion_clear');h.simulate('door_close');const s=h.snapshot();assert.equal(s.devices.find(d=>d.id==='motion-hall').value,false);assert.equal(s.devices.find(d=>d.id==='door-main').value,false)});
test('state changes invoke persistence callback',()=>{let saves=0;const h=new SmartHome(initialState(),()=>saves++);h.updateDevice('light-hall',{value:30});assert.equal(saves,1);h.setRule('rule-night-motion',false);assert.equal(saves,2);h.clearEvents();assert.equal(saves,3)});
test('energy simulation increments day and month metrics',()=>{const h=make();const before=h.snapshot().metrics.energyToday;h.simulate('energy');assert.equal(h.snapshot().metrics.energyToday,+(before+0.12).toFixed(2));assert.ok(h.snapshot().events.some(e=>e.type==='energy.sample'))});
