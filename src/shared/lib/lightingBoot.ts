// The farm's day / night light, decided before the first paint (pure, unit-tested in garden's
// dayNight tests). The server has no clock, so the farm is server-rendered in daylight; without this
// a player opening it at night would see a flash of day until React hydrates. The root layout puts
// LIGHTING_BOOT_SCRIPT in the document: it runs as the HTML is parsed and marks <html> with the light
// the farm will have (the pinned choice from localStorage, else the local hour). globals.css draws the
// not-yet-hydrated farm from that mark; once the farm is live its own state takes over.
// Shared, not in the garden feature: the root layout must not pull a feature's client code in.

// Day runs from 06:00 up to (not including) 18:00, local time; the rest is night.
export const DAY_START_HOUR = 6
export const NIGHT_START_HOUR = 18

// localStorage key of the pinned light: 'day' | 'night' | 'auto' (follow the clock).
export const LIGHTING_KEY = 'mindgarden:lighting'

// Attribute on <html> set by the boot script: data-mg-light="day" | "night".
export const LIGHTING_BOOT_ATTRIBUTE = 'data-mg-light'

// Runs once, synchronously, before anything is painted. It must never throw (blocked storage, an
// old browser): then the farm simply starts in daylight, as before.
export const LIGHTING_BOOT_SCRIPT = `(function(){try{var p=null;try{p=window.localStorage.getItem(${JSON.stringify(LIGHTING_KEY)})}catch(e){}var h=new Date().getHours();var n=p==="night"||(p!=="day"&&(h<${DAY_START_HOUR}||h>=${NIGHT_START_HOUR}));document.documentElement.setAttribute(${JSON.stringify(LIGHTING_BOOT_ATTRIBUTE)},n?"night":"day")}catch(e){}})()`
