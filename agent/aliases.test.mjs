import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusinessClient} from './business-client.mjs';
test('mine shorthand retries once and preserves canonical backend identity',async()=>{
 const names=[];
 const query=createBusinessClient({baseUrl:'http://localhost:3000',fetchImpl:async(_,options)=>{
  names.push(JSON.parse(options.body).entity_keyword);
  return names.length===1?Response.json({success:false,error:{code:'ENTITY_NOT_FOUND'}},{status:404}):Response.json({success:true,entity:{name:'察尔汗一号盐湖矿山'},data:{count:2}});
 }});
 const result=await query({entity_type:'mine',entity_keyword:'察尔汗一号矿山'});
 assert.deepEqual(names,['察尔汗一号矿山','察尔汗一号']);
 assert.equal(result.entity.name,'察尔汗一号盐湖矿山');
});
test('ambiguous shortened name requires clarification instead of choosing a match',async()=>{
 let calls=0;
 const query=createBusinessClient({baseUrl:'http://localhost:3000',fetchImpl:async()=>Response.json({success:false,error:{code:++calls===1?'ENTITY_NOT_FOUND':'AMBIGUOUS_ENTITY'}},{status:404})});
 await assert.rejects(query({entity_type:'mine',entity_keyword:'一号矿山'}),/不唯一/);
 assert.equal(calls,2);
});
