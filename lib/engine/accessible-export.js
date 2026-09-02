//#region src/engine/accessible-export.ts
var e = {
	article: "supported",
	report: "supported",
	book: "supported",
	scrartcl: "supported",
	scrreprt: "supported",
	scrbook: "supported",
	amsart: "supported",
	llncs: "partial",
	IEEEtran: "partial",
	elsarticle: "partial",
	memoir: "unsupported",
	acmart: "unsupported",
	"revtex4-2": "unsupported",
	beamer: "unsupported"
}, t = {
	english: "en-US",
	american: "en-US",
	USenglish: "en-US",
	british: "en-GB",
	UKenglish: "en-GB",
	australian: "en-AU",
	german: "de-DE",
	ngerman: "de-DE",
	austrian: "de-AT",
	naustrian: "de-AT",
	french: "fr-FR",
	frenchb: "fr-FR",
	spanish: "es-ES",
	italian: "it-IT",
	portuguese: "pt-PT",
	brazil: "pt-BR",
	brazilian: "pt-BR",
	dutch: "nl-NL",
	swedish: "sv-SE",
	danish: "da-DK",
	norsk: "nb-NO",
	finnish: "fi-FI",
	polish: "pl-PL",
	czech: "cs-CZ",
	russian: "ru-RU",
	greek: "el-GR",
	turkish: "tr-TR",
	japanese: "ja-JP",
	korean: "ko-KR",
	chinese: "zh-CN",
	"chinese-simplified": "zh-CN",
	"chinese-traditional": "zh-TW"
};
function n(e) {
	let t = e.split("\n");
	for (let e = 0; e < t.length; e++) {
		let n = t[e];
		for (let r = 0; r < n.length; r++) {
			if (n[r] === "\\") {
				r++;
				continue;
			}
			if (n[r] === "%") {
				t[e] = n.slice(0, r);
				break;
			}
		}
	}
	return t.join("\n");
}
function r(e, t, n) {
	let r = e.indexOf(t);
	if (r < 0) return null;
	let i = new RegExp(n.source, `${n.flags.replace("y", "")}y`);
	return i.lastIndex = r + t.length, i.exec(e);
}
function i(e, t) {
	if (e[t] !== "[") return t;
	let n = e.indexOf("]", t + 1);
	return n < 0 ? t : n + 1;
}
function a(e) {
	let t = n(e), r = t.indexOf("\\documentclass");
	if (r < 0) return null;
	let a = i(t, r + 14);
	if (t[a] !== "{") return null;
	a++;
	let o = t.indexOf("}", a);
	return o < 0 ? null : t.slice(a, o).trim() || null;
}
function o(e) {
	let r = n(e), i = s(r);
	if (i) return i;
	let a = /\\usepackage\[([^\]]*)\]\{babel\}/.exec(r);
	if (a) {
		let e = a[1].split(",").map((e) => e.trim()), n = e.find((e) => e.startsWith("main="))?.slice(5), r = n ? [n] : [...e].reverse();
		for (let e of r) {
			let n = t[e];
			if (n) return n;
		}
	}
	return a = /\\setmainlanguage(?:\[[^\]]*\])?\{([^}]*)\}/.exec(r), a ? t[a[1].trim()] ?? null : /\\usepackage(?:\[[^\]]*\])?\{(?:kotex|xetexko|luatexko)\}/.test(r) ? "ko-KR" : null;
}
function s(e) {
	let t = /([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)/, n = r(e, "pdflang", / ?= ?\{? ?([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)/);
	if (n) return n[1];
	let i = r(e, "\\DocumentMetadata{", /[^}]*/);
	if (!i) return null;
	let a = r(i[0], "lang=", t);
	return a ? a[1] : null;
}
function c(e) {
	return /\\DocumentMetadata\{/.test(n(e));
}
function l(e, t = {}) {
	let n = t.lang ?? o(e) ?? "en-US", r = t.standard ?? "ua-2";
	return c(e) ? {
		source: e,
		injected: !1,
		lang: n,
		standard: r
	} : {
		source: `${`\\DocumentMetadata{lang=${n}, pdfversion=${r === "ua-2" ? "2.0" : "1.7"}, pdfstandard=${r}, tagging=on}`}${e}`,
		injected: !0,
		lang: n,
		standard: r
	};
}
function u(e) {
	return /key 'document\/metadata\/tagging' is unknown|Undefined document metadata key 'tagging'/.test(e);
}
async function d(e) {
	if (typeof DecompressionStream > "u") return null;
	try {
		let t = new Blob([e]).stream().pipeThrough(new DecompressionStream("deflate"));
		return new Uint8Array(await new Response(t).arrayBuffer());
	} catch {
		return null;
	}
}
function f(e) {
	let t = "";
	for (let n = 0; n < e.length; n += 8192) t += String.fromCharCode(...e.subarray(n, n + 8192));
	return t;
}
function p(e, t) {
	let n = t + 2;
	for (; n < e.length && " \r\n".includes(e[n]);) n++;
	return e.startsWith("stream", n) ? (n += 6, e[n] === "\r" && n++, e[n] === "\n" && n++, n) : -1;
}
function m(e, t) {
	let n = e.indexOf("endstream", t);
	if (n < 0) return -1;
	for (; n > t && (e[n - 1] === "\n" || e[n - 1] === "\r");) n--;
	return n;
}
function h(e) {
	let t = [], n = 0;
	for (;;) {
		let r = e.indexOf("/FlateDecode", n);
		if (r < 0) break;
		n = r + 12;
		let i = e.indexOf(">>", n);
		if (i < 0) break;
		let a = p(e, i);
		if (a < 0) continue;
		let o = m(e, a);
		o >= 0 && t.push([a, o]);
	}
	return t;
}
async function g(e) {
	let t = f(e), n = [t];
	for (let [r, i] of h(t)) {
		let t = await d(e.subarray(r, i));
		t && n.push(f(t));
	}
	return n.join("\n");
}
function _(e) {
	let t = [], n = [...e.matchAll(/\/Type\s*\/StructElem/g)].map((e) => e.index ?? 0);
	for (let r = 0; r < n.length; r++) {
		let i = n[r], a = n[r + 1] ?? e.length, o = e.indexOf("endobj", i), s = o >= 0 && o < a ? o : a;
		t.push(e.slice(i, s));
	}
	return t;
}
function v(e) {
	let t = /\/Alt ?<([0-9A-Fa-f\s]*)>/.exec(e);
	if (t) {
		let e = t[1].replace(/\s+/g, ""), n = [];
		for (let t = 0; t + 1 < e.length; t += 2) n.push(Number.parseInt(e.slice(t, t + 2), 16));
		if (n[0] === 254 && n[1] === 255) {
			let e = "";
			for (let t = 2; t + 1 < n.length; t += 2) e += String.fromCharCode(n[t] << 8 | n[t + 1]);
			return e;
		}
		return String.fromCharCode(...n);
	}
	let n = /\/Alt ?\(((?:[^()\\]|\\.)*)\)/.exec(e);
	return n ? n[1].replace(/\\(.)/g, "$1") : null;
}
function y(e) {
	return /^[\w./-]+\.(?:png|jpe?g|pdf|eps|svg|gif|tiff?|bmp|jbig2|jp2)$/i.test(e.trim());
}
function b(e) {
	let t = {
		figures: 0,
		figuresWithAlt: 0,
		headings: 0,
		tables: 0
	};
	for (let n of e) {
		let e = /\/S\s*\/([A-Za-z0-9_.-]+)/.exec(n)?.[1] ?? null;
		if (e === "Figure") {
			t.figures++;
			let e = v(n);
			e && !y(e) && t.figuresWithAlt++;
		} else e && /^(?:H[1-6]?|Title)$/.test(e) ? t.headings++ : e === "Table" && t.tables++;
	}
	return t;
}
async function x(e) {
	let t = await g(e), n = /\/StructTreeRoot\b/.test(t), i = /\/Marked\s+true\b/.test(t), a = r(t, "/Lang", / ?\(([^)]*)\)/)?.[1] ?? null, o = /pdfuaid:part\s*=\s*"(\d)"|<pdfuaid:part>\s*(\d)/.exec(t), s = o ? Number(o[1] ?? o[2]) : null, c = /<dc:title>[\s\S]{0,400}?<rdf:li[^>]*>([^<]*)<\/rdf:li>/.exec(t)?.[1]?.trim() || (r(t, "/Title", / ?\(([^)]*)\)/)?.[1] ?? null);
	return {
		tagged: n && i,
		lang: a,
		uaPart: s,
		...b(_(t)),
		title: c || null
	};
}
//#endregion
export { e as CLASS_SUPPORT, o as detectDocumentLanguage, a as documentClassOf, c as hasDocumentMetadata, l as injectDocumentMetadata, x as inspectPdfTagging, u as kernelLacksTagging };
