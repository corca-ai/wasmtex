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
	return e.replace(/(^|[^\\])(\\\\)*%.*$/gm, (e, t, n) => `${t}${n ?? ""}`);
}
function r(e, t) {
	if (e[t] !== "[") return t;
	let n = e.indexOf("]", t + 1);
	return n < 0 ? t : n + 1;
}
function i(e) {
	let t = n(e), i = t.indexOf("\\documentclass");
	if (i < 0) return null;
	let a = r(t, i + 14);
	if (t[a] !== "{") return null;
	a++;
	let o = t.indexOf("}", a);
	return o < 0 ? null : t.slice(a, o).trim() || null;
}
function a(e) {
	let r = n(e), i = /pdflang ?= ?\{? ?([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)/.exec(r);
	if (i || (i = /\\DocumentMetadata\{[^}]*\blang ?= ?([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)/.exec(r), i)) return i[1];
	if (i = /\\usepackage\[([^\]]*)\]\{babel\}/.exec(r), i) {
		let e = i[1].split(",").map((e) => e.trim()), n = e.find((e) => e.startsWith("main="))?.slice(5), r = n ? [n] : [...e].reverse();
		for (let e of r) {
			let n = t[e];
			if (n) return n;
		}
	}
	return i = /\\setmainlanguage(?:\[[^\]]*\])?\{([^}]*)\}/.exec(r), i ? t[i[1].trim()] ?? null : /\\usepackage(?:\[[^\]]*\])?\{(?:kotex|xetexko|luatexko)\}/.test(r) ? "ko-KR" : (/\\usepackage\s*(?:\[[^\]]*\])?\s*\{(?:xeCJK|luatexja|luatexja-fontspec)\}/.test(r), null);
}
function o(e) {
	return /\\DocumentMetadata\{/.test(n(e));
}
function s(e, t = {}) {
	let n = t.lang ?? a(e) ?? "en-US", r = t.standard ?? "ua-2";
	return o(e) ? {
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
function c(e) {
	return /key 'document\/metadata\/tagging' is unknown|Undefined document metadata key 'tagging'/.test(e);
}
async function l(e) {
	if (typeof DecompressionStream > "u") return null;
	try {
		let t = new Blob([e]).stream().pipeThrough(new DecompressionStream("deflate"));
		return new Uint8Array(await new Response(t).arrayBuffer());
	} catch {
		return null;
	}
}
function u(e) {
	let t = "";
	for (let n = 0; n < e.length; n += 8192) t += String.fromCharCode(...e.subarray(n, n + 8192));
	return t;
}
function d(e, t) {
	let n = t + 2;
	for (; n < e.length && " \r\n".includes(e[n]);) n++;
	return e.startsWith("stream", n) ? (n += 6, e[n] === "\r" && n++, e[n] === "\n" && n++, n) : -1;
}
function f(e, t) {
	let n = e.indexOf("endstream", t);
	if (n < 0) return -1;
	for (; n > t && (e[n - 1] === "\n" || e[n - 1] === "\r");) n--;
	return n;
}
function p(e) {
	let t = [], n = 0;
	for (;;) {
		let r = e.indexOf("/FlateDecode", n);
		if (r < 0) break;
		n = r + 12;
		let i = e.indexOf(">>", n);
		if (i < 0) break;
		let a = d(e, i);
		if (a < 0) continue;
		let o = f(e, a);
		o >= 0 && t.push([a, o]);
	}
	return t;
}
async function m(e) {
	let t = u(e), n = [t];
	for (let [r, i] of p(t)) {
		let t = await l(e.subarray(r, i));
		t && n.push(u(t));
	}
	return n.join("\n");
}
function h(e) {
	let t = [], n = [...e.matchAll(/\/Type\s*\/StructElem/g)].map((e) => e.index ?? 0);
	for (let r = 0; r < n.length; r++) {
		let i = n[r], a = n[r + 1] ?? e.length, o = e.indexOf("endobj", i), s = o >= 0 && o < a ? o : a;
		t.push(e.slice(i, s));
	}
	return t;
}
function g(e) {
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
function _(e) {
	return /^[\w./-]+\.(?:png|jpe?g|pdf|eps|svg|gif|tiff?|bmp|jbig2|jp2)$/i.test(e.trim());
}
function v(e) {
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
			let e = g(n);
			e && !_(e) && t.figuresWithAlt++;
		} else e && /^(?:H[1-6]?|Title)$/.test(e) ? t.headings++ : e === "Table" && t.tables++;
	}
	return t;
}
async function y(e) {
	let t = await m(e), n = /\/StructTreeRoot\b/.test(t), r = /\/Marked\s+true\b/.test(t), i = /\/Lang ?\(([^)]*)\)/.exec(t)?.[1] ?? null, a = /pdfuaid:part\s*=\s*"(\d)"|<pdfuaid:part>\s*(\d)/.exec(t), o = a ? Number(a[1] ?? a[2]) : null, s = /<dc:title>[\s\S]{0,400}?<rdf:li[^>]*>([^<]*)<\/rdf:li>/.exec(t)?.[1]?.trim() || (/\/Title ?\(([^)]*)\)/.exec(t)?.[1] ?? null);
	return {
		tagged: n && r,
		lang: i,
		uaPart: o,
		...v(h(t)),
		title: s || null
	};
}
//#endregion
export { e as CLASS_SUPPORT, a as detectDocumentLanguage, i as documentClassOf, o as hasDocumentMetadata, s as injectDocumentMetadata, y as inspectPdfTagging, c as kernelLacksTagging };
