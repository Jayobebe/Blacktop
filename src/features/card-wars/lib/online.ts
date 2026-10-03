import { supabase } from '@/integrations/supabase/client';
import { demoBlocked } from '@/lib/demoGuard';
import { tr } from '@/lib/i18n';
export interface OnlineBattle { code?:string;status?:'waiting'|'playing'|'finished'|'cancelled';round?:number;category?:number|null;selected?:number|null;penalty?:boolean;deck?:string[];rivalDeck?:string[];hp?:number[];rivalHp?:number[];used?:number[];submitted?:boolean;rivalSubmitted?:boolean;side?:number;result?:'win'|'loss'|'draw';deadline?:string;balance:number;log?:{round:number;category:number;card1:string;card2:string;damage:number;winner:number|null}[] }
export async function battleAction(action:'status'|'create'|'join'|'play'|'leave',code?:string,deck?:string[],card?:number,tag?:number,round?:number):Promise<OnlineBattle>{
 if(action!=='status'&&demoBlocked())throw new Error(tr('Not available in demo mode'));
 const {data,error}=await supabase.rpc('cw_action' as never,{_action:action,_code:code||null,_deck:deck||null,_card:card??null,_tag:tag??null,_round:round??null} as never);
 if(error)throw new Error(tr(error.message));
 return data as unknown as OnlineBattle;
}
