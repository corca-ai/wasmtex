import { VERBATIM_ENVIRONMENTS as e } from "./latex-tokenizer.js";
import { rangeFromOffsets as t } from "./source-position.js";
//#region src/lsp/environment-pairs.ts
var n = "[A-Za-z0-9@:_*\\-]+";
function r(n, r, i, o, s) {
	let c = [], l = [];
	for (let u of i) {
		if (!a(u) || r[u.start] !== "\\") continue;
		let i = /^\s*\{([A-Za-z0-9@:_*-]+)\}/.exec(n.slice(u.end));
		if (!i) {
			l.length = 0;
			continue;
		}
		let d = i[1], f = u.end + i[0].length - 1, p = t(o, f - d.length, f);
		if (u.value === "begin") {
			l.push({
				name: d,
				range: p,
				start: u.start
			});
			continue;
		}
		let m = l.pop();
		if (!m || m.name !== d) {
			l.length = 0;
			continue;
		}
		e.has(d) || (c.push({
			begin: m.range,
			end: p
		}), s?.push([m.start, f + 1]));
	}
	return c;
}
function i(e, t, n) {
	let r = (e) => t === e.startLine && n >= e.startColumn && n <= e.endColumn, i = e.find((e) => r(e.begin) || r(e.end));
	return i ? [{ ...i.begin }, { ...i.end }] : null;
}
function a(e) {
	return e.type === "command" && (e.value === "begin" || e.value === "end");
}
//#endregion
export { n as ENVIRONMENT_NAME_PATTERN, r as environmentNamePairs, i as linkedEnvironmentRanges };
