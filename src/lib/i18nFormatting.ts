import { messagesByLocale, type Locale } from './i18n';

export type Replacements = Record<string,string|number>;
export function interpolateMessage(message:string,replacements:Replacements={}) {
 // A single replacement pass keeps user text containing braces unchanged.
 return message.replace(/\{([^{}]+)\}/g,(match,key:string)=>Object.hasOwn(replacements,key)?String(replacements[key]):match);
}
export function translateTerm(locale:Locale,value:string,replacements?:Replacements) {
 const terms:Record<string,string>=messagesByLocale[locale].terms;
 return interpolateMessage(terms[value]??value,replacements);
}

// Errors may already have been localized when they entered component state.
// Resolve them in either language so switching language updates visible errors too.
const localizedMessages=new Map<string,{en:string;ar:string}>();
function collect(en:unknown,ar:unknown) {
 if(typeof en==='string'&&typeof ar==='string') {localizedMessages.set(en,{en,ar});localizedMessages.set(ar,{en,ar});}
 else if(en&&ar&&typeof en==='object'&&typeof ar==='object')for(const key of Object.keys(en))collect((en as Record<string,unknown>)[key],(ar as Record<string,unknown>)[key]);
}
collect(messagesByLocale.en,messagesByLocale.ar);
export function translateError(locale:Locale,message:string) {
 const known=localizedMessages.get(message);
 if(known)return known[locale];
 const patterns:[RegExp,string][]=[
  [/^Set a catalog price for (.+) before quoting\.$/,'Set a catalog price for {item} before quoting.'],
  [/^Unsupported unit for (.+)\.$/,'Unsupported unit for {item}.'],
  [/^Invalid amount for (.+)\.$/,'Invalid amount for {item}.'],
 ];
 for(const [pattern,key] of patterns){const match=message.match(pattern);if(match)return translateTerm(locale,key,{item:translateTerm(locale,match[1])});}
 if(locale==='en'||/[\u0600-\u06ff]/.test(message))return message;
 return translateTerm(locale,'Unable to complete this action. Please try again or contact the administrator.');
}
export function localizedDateTime(locale:Locale,value:Date|string|number) {
 return new Intl.DateTimeFormat(locale==='ar'?'ar-IQ':'en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Baghdad'}).format(new Date(value));
}
export function localizedNumber(locale:Locale,value:number,maximumFractionDigits=4) {
 return new Intl.NumberFormat(locale==='ar'?'ar-IQ':'en-GB',{maximumFractionDigits}).format(value);
}
export function localizedMoney(locale:Locale,value:number) {
 return localizedNumber(locale,value,0)+(locale==='ar'?' د.ع':' IQD');
}
