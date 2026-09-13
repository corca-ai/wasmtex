import { VERBATIM_ENVIRONMENTS as e } from "./latex-tokenizer.js";
import { rangeFromOffsets as t } from "./source-position.js";
//#region src/lsp/environment-pairs.ts
var n = "[A-Za-z0-9@:_*\\-]+";
function r(n, r, i, o) {
	let s = [], c = [];
	for (let l of i) {
		if (!a(l) || r[l.start] !== "\\") continue;
		let i = /^\s*\{([A-Za-z0-9@:_*-]+)\}/.exec(n.slice(l.end));
		if (!i) {
			c.length = 0;
			continue;
		}
		let u = i[1], d = l.end + i[0].length - 1, f = t(o, d - u.length, d);
		if (l.value === "begin") {
			c.push({
				name: u,
				range: f
			});
			continue;
		}
		let p = c.pop();
		if (!p || p.name !== u) {
			c.length = 0;
			continue;
		}
		e.has(u) || s.push({
			begin: p.range,
			end: f
		});
	}
	return s;
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
