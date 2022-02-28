import * as moment from 'moment';

/** extra name field from constructor/class */
export function className (obj: { constructor: { name: any; }; }): string { 
  return (obj === undefined) ? 'undefined' : (!!obj && obj.constructor) ? obj.constructor.name : 'no_class'
}

/** timestamp and prefix string from constructor name. */
export function stime (obj?: { constructor: { name: string; }; }, f?: string): string { 
  let stage = !!obj && (obj['stage'] || (!!obj['table'] && obj['table']['stage']))
  let canv = !!stage ? (!!stage.canvas ? " C" : " N") : " -"
  let name = !!obj ? (" "+className(obj)) : ""
  if (!!f) name = name + f
  return moment().format(stime.fmt) + canv + name
}
stime.fmt = "MM-DD kk:mm:ss.SSS"

/** compact string of JSON from object */
export function json(obj: object): string {
  return JSON.stringify(obj).replace(/"/g, '')
}

/** drill down through value of inner fields. */
export function findFieldValue(obj: object, ... names: Array<string|Array<string>> ): any {
  let n = names.shift(), next: any
  if (!n) return obj            // return obj when no more field accessors
  if (typeof(n) == 'string') {
    next = obj[n]
  } else {
    let nn = n.find(n => !!obj[n])
    next = !!nn ? obj[nn] : !!n[0] ? undefined : obj // [null, foo, bar] -> next = obj
  }
  return !!next ? findFieldValue(next, ... names) : undefined
}

/** promise functions */
/**
 * While predicate returns truthy, invoke actionP and then recurse (when Promise is fulfilled)
 * @param pred if true then invoke actionP().then(-recurse-)
 * @param actionP preforms some computation and returns a Promise\<T>
 * @param v value: \<T> returned when actionP promise fulfills
 * @param args context args supplied to pred and actionP (v, ...args)
 */
 export function whileP<T>(pred: (v?: T, ...args: any) => boolean, actionP: (v?: T, ...args: any) => Promise<T>, v?: T, ...args: any) {
  if (pred(v, ...args)) {
    let p = actionP(v, ...args)
    p.then((v: T) => whileP(pred, actionP, v, ...args))
  }
}

/**
 * Invoke actionP and then (when Promise is fulfilled) if (pred is false) recurse 
 * @param pred if false then (-recurse-)
 * @param actionP preforms some computation and returns a Promise\<T>
 * @param v value: \<T> returned when actionP promise fulfills
 * @param args context args supplied to pred and actionP (v, ...args)
 */
export function untilP<T>(pred: (v?: T, ...args: any) => boolean, actionP: (v?: T, ...args: any) => Promise<T>, v?: T, ...args: any) {
  let p = actionP(v, ...args)
  p.then((v: T) => !pred(v, ...args) && untilP(pred, actionP, v, ...args))
}
export function timedPromise<T>(ms: number, v?: T): Promise<T> {
  return new Promise((res, rej) => setTimeout(() => res(v), ms))
}
