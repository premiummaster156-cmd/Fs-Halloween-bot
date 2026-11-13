"use strict";
const MAX_BASE_XP_PER_ACTION=50000,MAX_SINGLE_XP_GAIN=160000,MAX_EARNING_MULTIPLIER=320,MAX_SINGLE_MUTATION_FC=2000000000;
const MUTATION_POLICIES=Object.freeze({
 daily_reward:{direction:"credit",maxBase:10000,multiplied:true},job_work:{direction:"credit",maxBase:100000,multiplied:true},
 crime_success:{direction:"credit",maxBase:50000,multiplied:true},heist_reward:{direction:"credit",maxBase:1500000,multiplied:true},
 chat_activity_reward:{direction:"credit",maxBase:25000,multiplied:true},achievement_reward:{direction:"credit",maxBase:25000,multiplied:true},
 boss_reward:{direction:"credit",maxBase:1000000,multiplied:true},scavenge_reward:{direction:"credit",maxBase:25000,multiplied:true},
 delivery_contract_reward:{direction:"credit",maxBase:50000,multiplied:true},admin_abuse_reward:{direction:"credit",maxBase:1500000},
 casino_payout:{direction:"credit",maxBase:MAX_SINGLE_MUTATION_FC,casino:true},bank_withdrawal:{direction:"credit",maxBase:MAX_SINGLE_MUTATION_FC},
 admin_grant:{direction:"credit",maxBase:10000000,audited:true,noSelfGrant:true},
 bank_deposit:{direction:"debit",maxBase:MAX_SINGLE_MUTATION_FC},casino_bet:{direction:"debit",maxBase:MAX_SINGLE_MUTATION_FC},
 shop_purchase:{direction:"debit",maxBase:MAX_SINGLE_MUTATION_FC},item_upgrade:{direction:"debit",maxBase:MAX_SINGLE_MUTATION_FC},
 crime_failed_fine:{direction:"debit",maxBase:MAX_SINGLE_MUTATION_FC},heist_failed_fine:{direction:"debit",maxBase:MAX_SINGLE_MUTATION_FC},
 admin_remove:{direction:"debit",maxBase:10000000,audited:true,noSelfGrant:true},
 player_trade_in:{direction:"credit",maxBase:MAX_SINGLE_MUTATION_FC},
 player_trade_out:{direction:"debit",maxBase:MAX_SINGLE_MUTATION_FC},
 member_transfer_in:{direction:"credit",maxBase:MAX_SINGLE_MUTATION_FC},
 member_transfer_out:{direction:"debit",maxBase:MAX_SINGLE_MUTATION_FC}
});
function inspectEconomyMutation({userId,delta,reason,metadata={}}){
 const amount=Number(delta);
 if(!Number.isSafeInteger(amount)||amount===0)return{allowed:false,code:"ECONOMY_AMOUNT_INVALID",message:"Currency changes must be non-zero whole numbers."};
 const policy=MUTATION_POLICIES[String(reason||"")];
 if(!policy)return{allowed:false,code:"ECONOMY_REASON_INVALID",message:"That currency operation is not an approved economy action."};
 if((amount>0?"credit":"debit")!==policy.direction)return{allowed:false,code:"ECONOMY_DIRECTION_INVALID",message:"That currency operation used an invalid credit/debit direction."};
 if(Math.abs(amount)>policy.maxBase)return{allowed:false,code:"ECONOMY_AMOUNT_LIMIT",message:"That currency amount exceeds the approved limit for this action."};
 if(policy.audited){
  const actorId=String(metadata.actorId||""),auditReason=String(metadata.reason||"").trim();
  if(!actorId||!auditReason)return{allowed:false,code:"ECONOMY_ADMIN_AUDIT_REQUIRED",message:"Administrator currency changes require an actor and audit reason."};
  if(policy.noSelfGrant&&actorId===String(userId))return{allowed:false,code:"ECONOMY_SELF_GRANT",message:"Administrators cannot grant FC to their own account."};
 }
 if(policy.casino){
  const wager=Math.trunc(Number(metadata.wager)),multiplier=Math.trunc(Number(metadata.multiplier));
  if(!Number.isSafeInteger(wager)||wager<1||!Number.isSafeInteger(multiplier)||multiplier<0)return{allowed:false,code:"ECONOMY_CASINO_METADATA_INVALID",message:"Casino payout metadata is invalid."};
 }
 return{allowed:true,policy};
}
function inspectRewardBurst({recentCount=0,recentBase=0,currentBase=0}={}){
 const count=Math.max(0,Math.floor(Number(recentCount)||0))+1;
 const baseTotal=Math.max(0,Number(recentBase)||0)+Math.max(0,Number(currentBase)||0);
 if(count>=30||baseTotal>=2000000)return{blocked:true,alert:true,score:100,count,baseTotal};
 const score=Math.min(99,Math.round(count*2+baseTotal/5000));
 // Notify owners only for high-confidence bursts; ordinary activity is not an alert.
 const alert=score>=80;
 return{blocked:false,alert,score,count,baseTotal};
}
module.exports={MUTATION_POLICIES,MAX_BASE_XP_PER_ACTION,MAX_SINGLE_XP_GAIN,MAX_EARNING_MULTIPLIER,MAX_SINGLE_MUTATION_FC,inspectEconomyMutation,inspectRewardBurst};
