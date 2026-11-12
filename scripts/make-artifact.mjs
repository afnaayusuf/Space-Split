// Turns the single-file build into the page fragment a claude.ai artifact expects:
// no doctype/html/head/body wrapper, <title> first, then fonts, styles, markup, scripts.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../dist-artifact/', import.meta.url));
const html = readFileSync(`${dir}index.html`, 'utf8');

let head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? '';

// a real <style> tag only: the bundle itself carries "<styleSheet" (the Excel writer)
const styles = head.match(/<style(?:\s[^>]*)?>[\s\S]*?<\/style>/gi) ?? [];
for (const s of styles) head = head.replace(s, '');
const title = head.match(/<title>[\s\S]*?<\/title>/i)?.[0] ?? '<title>WaveForce Packing Planner</title>';
const fonts = (head.match(/<link[^>]*>/gi) ?? []).filter((l) => /rel="stylesheet"/.test(l) && /fonts\.googleapis\.com/.test(l));
const first = head.indexOf('<script');
const last = head.lastIndexOf('</script>');
const scripts = first >= 0 && last > first ? head.slice(first, last + '</script>'.length) : '';

const out = [title, ...fonts, ...styles, body.trim(), scripts].join('\n');
writeFileSync(`${dir}waveforce.html`, out);
console.log(`dist-artifact/waveforce.html  ${(out.length / 1024).toFixed(0)} kB`);
