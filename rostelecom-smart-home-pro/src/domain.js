import { randomUUID } from 'node:crypto';

export const initialState = () => ({
  devices: [
    { id:'cam-living', name:'Камера · Гостиная', type:'camera', room:'Гостиная', status:'online', enabled:true, value:'LIVE', unit:'', meta:{resolution:'2K', motion:true}, updatedAt:new Date().toISOString() },
    { id:'cam-entry', name:'Камера · Прихожая', type:'camera', room:'Прихожая', status:'online', enabled:true, value:'LIVE', unit:'', meta:{resolution:'1080p', motion:false}, updatedAt:new Date().toISOString() },
    { id:'motion-hall', name:'Датчик движения', type:'motion', room:'Прихожая', status:'online', enabled:true, value:false, unit:'', updatedAt:new Date().toISOString() },
    { id:'door-main', name:'Датчик открытия', type:'contact', room:'Входная дверь', status:'online', enabled:true, value:false, unit:'', updatedAt:new Date().toISOString() },
    { id:'light-living', name:'Основной свет', type:'light', room:'Гостиная', status:'online', enabled:true, value:72, unit:'%', updatedAt:new Date().toISOString() },
    { id:'light-hall', name:'Свет в прихожей', type:'light', room:'Прихожая', status:'online', enabled:true, value:0, unit:'%', updatedAt:new Date().toISOString() },
    { id:'climate-living', name:'Климат-контроль', type:'climate', room:'Гостиная', status:'online', enabled:true, value:22, unit:'°C', meta:{target:22, mode:'auto'}, updatedAt:new Date().toISOString() },
    { id:'plug-tv', name:'Розетка · ТВ', type:'plug', room:'Гостиная', status:'online', enabled:true, value:true, unit:'', meta:{power:84}, updatedAt:new Date().toISOString() },
    { id:'alarm-home', name:'Охранная система', type:'alarm', room:'Дом', status:'online', enabled:true, value:'armed', unit:'', updatedAt:new Date().toISOString() }
  ],
  rules: [
    {id:'rule-night-motion',name:'Ночной свет',description:'При движении в прихожей включить свет',trigger:'motion',enabled:true,actions:[{deviceId:'light-hall',value:65}],lastRun:null},
    {id:'rule-door-alert',name:'Контроль входа',description:'При открытии двери в режиме охраны создать тревогу',trigger:'door_open',enabled:true,actions:[{deviceId:'alarm-home',value:'alert'}],lastRun:null},
    {id:'rule-away',name:'Режим «Никого нет»',description:'Выключить свет и розетки при активации охраны',trigger:'arm',enabled:false,actions:[{deviceId:'light-living',value:0},{deviceId:'light-hall',value:0},{deviceId:'plug-tv',value:false}],lastRun:null}
  ],
  events: [],
  settings: {homeName:'Мой дом', simulation:true, notifications:true, energyBudget:120},
  metrics: {energyToday:3.84, energyMonth:86.2, savedToday:1.26, uptime:99.9}
});

const event = (type,title,description,deviceId=null,severity='info') => ({id:randomUUID(),type,title,description,deviceId,severity,at:new Date().toISOString()});
export class SmartHome {
  constructor(state=initialState(), persist=()=>{}) { this.state=state; this.persist=persist; }
  snapshot(){ return structuredClone(this.state); }
  addEvent(e){ this.state.events.unshift(e); this.state.events=this.state.events.slice(0,150); }
  updateDevice(id, patch, source='user') {
    const d=this.state.devices.find(x=>x.id===id); if(!d) throw Object.assign(new Error('Устройство не найдено'),{status:404});
    if(d.status!=='online') throw Object.assign(new Error('Устройство не в сети'),{status:409});
    if(d.type==='light' && (!Number.isFinite(patch.value)||patch.value<0||patch.value>100)) throw Object.assign(new Error('Яркость должна быть от 0 до 100'),{status:400});
    if(d.type==='climate' && (!Number.isFinite(patch.value)||patch.value<16||patch.value>30)) throw Object.assign(new Error('Температура должна быть от 16 до 30 °C'),{status:400});
    if(d.type==='plug' && typeof patch.value!=='boolean') throw Object.assign(new Error('Для розетки ожидается true/false'),{status:400});
    if(d.type==='alarm' && !['armed','disarmed','alert'].includes(patch.value)) throw Object.assign(new Error('Недопустимый режим охраны'),{status:400});
    const old=d.value; d.value=patch.value; d.updatedAt=new Date().toISOString();
    if(d.type==='climate') d.meta.target=patch.value;
    if(d.type==='plug') d.meta.power=patch.value?84:0;
    this.addEvent(event('device.updated',`${d.name}: ${String(old)} → ${String(d.value)}`,`Изменение ${source==='user'?'пользователем':'сценарием'}`,id));
    if(d.id==='alarm-home' && patch.value==='armed') this.runRules('arm');
    this.persist(); return structuredClone(d);
  }
  runRules(trigger, context={}) {
    const fired=[];
    for(const rule of this.state.rules.filter(r=>r.enabled&&r.trigger===trigger)){
      for(const action of rule.actions){ const target=this.state.devices.find(d=>d.id===action.deviceId); if(!target||target.status!=='online') continue;
        // Safety: a door alert only escalates while the alarm is armed.
        if(trigger==='door_open' && target.type==='alarm' && target.value!=='armed') continue;
        target.value=action.value; target.updatedAt=new Date().toISOString(); if(target.type==='plug')target.meta.power=action.value?84:0;
        this.addEvent(event('automation.action',`Сценарий: ${rule.name}`,`${target.name} → ${String(action.value)}`,target.id,'success'));
      }
      rule.lastRun=new Date().toISOString(); fired.push(rule.id);
    }
    if(fired.length) this.persist(); return fired;
  }
  simulate(kind) {
    if(kind==='motion'){
      const d=this.state.devices.find(x=>x.id==='motion-hall'); d.value=true; d.updatedAt=new Date().toISOString();
      this.addEvent(event('sensor.motion','Обнаружено движение','Датчик движения: прихожая','motion-hall','warning'));
      const rules=this.runRules('motion');
      return {message:'Смоделировано движение в прихожей',firedRules:rules};
    }
    if(kind==='door_open'){
      const d=this.state.devices.find(x=>x.id==='door-main'); d.value=true; d.updatedAt=new Date().toISOString();
      this.addEvent(event('sensor.door','Входная дверь открыта','Сработал датчик открытия','door-main','warning'));
      const armed=this.state.devices.find(x=>x.id==='alarm-home').value==='armed';
      const rules=armed?this.runRules('door_open'):[];
      if(armed)this.addEvent(event('security.alert','Тревога безопасности','Дверь открыта при включённой охране','alarm-home','danger'));
      this.persist(); return {message:armed?'Дверь открыта: тревога активирована':'Дверь открыта: охрана выключена',firedRules:rules};
    }
    if(kind==='door_close'||kind==='motion_clear'){
      const id=kind==='door_close'?'door-main':'motion-hall'; const d=this.state.devices.find(x=>x.id===id); d.value=false; d.updatedAt=new Date().toISOString();
      this.addEvent(event('sensor.reset',kind==='door_close'?'Входная дверь закрыта':'Движение завершено',d.name,id)); this.persist(); return {message:'Состояние датчика сброшено',firedRules:[]};
    }
    if(kind==='energy'){
      this.state.metrics.energyToday=+(this.state.metrics.energyToday+0.12).toFixed(2); this.state.metrics.energyMonth=+(this.state.metrics.energyMonth+0.12).toFixed(2);
      this.addEvent(event('energy.sample','Обновлён энергомониторинг','Получено новое значение потребления')); this.persist(); return {message:'Показания энергопотребления обновлены',firedRules:[]};
    }
    throw Object.assign(new Error('Неизвестный тип симуляции'),{status:400});
  }
  setRule(id,enabled){const r=this.state.rules.find(x=>x.id===id);if(!r)throw Object.assign(new Error('Сценарий не найден'),{status:404});r.enabled=!!enabled;this.addEvent(event('automation.config',`${r.name}: ${r.enabled?'включён':'выключен'}`,'Изменена настройка сценария'));this.persist();return structuredClone(r);}
  clearEvents(){this.state.events=[];this.persist();}
}
