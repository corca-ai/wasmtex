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
function r(e) {
	let t = /\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/.exec(n(e));
	return t ? t[1].trim() : null;
}
function i(e) {
	let r = n(e), i = /pdflang\s*=\s*\{?\s*([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)/.exec(r);
	if (i || (i = /\\DocumentMetadata\s*\{[^}]*\blang\s*=\s*([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)/.exec(r), i)) return i[1];
	if (i = /\\usepackage\s*\[([^\]]*)\]\s*\{babel\}/.exec(r), i) {
		let e = i[1].split(",").map((e) => e.trim()), n = e.find((e) => e.startsWith("main="))?.slice(5), r = n ? [n] : [...e].reverse();
		for (let e of r) {
			let n = t[e];
			if (n) return n;
		}
	}
	return i = /\\setmainlanguage\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/.exec(r), i ? t[i[1].trim()] ?? null : /\\usepackage\s*(?:\[[^\]]*\])?\s*\{(?:kotex|xetexko|luatexko)\}/.test(r) ? "ko-KR" : (/\\usepackage\s*(?:\[[^\]]*\])?\s*\{(?:xeCJK|luatexja|luatexja-fontspec)\}/.test(r), null);
}
function a(e) {
	return /\\DocumentMetadata\s*\{/.test(n(e));
}
function o(e, t = {}) {
	let n = t.lang ?? i(e) ?? "en-US", r = t.standard ?? "ua-2";
	return a(e) ? {
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
function s(e) {
	return /key 'document\/metadata\/tagging' is unknown|Undefined document metadata key 'tagging'/.test(e);
}
async function c(e) {
	if (typeof DecompressionStream > "u") return null;
	try {
		let t = new Blob([e]).stream().pipeThrough(new DecompressionStream("deflate"));
		return new Uint8Array(await new Response(t).arrayBuffer());
	} catch {
		return null;
	}
}
async function l(e) {
	let t = (e) => {
		let t = "";
		for (let n = 0; n < e.length; n += 8192) t += String.fromCharCode(...e.subarray(n, n + 8192));
		return t;
	}, n = t(e), r = [n];
	for (let i of n.matchAll(/\/FlateDecode[^>]*>>\s*stream\r?\n/g)) {
		let a = (i.index ?? 0) + i[0].length, o = n.indexOf("endstream", a);
		if (o < 0) continue;
		for (; o > a && (e[o - 1] === 10 || e[o - 1] === 13);) o--;
		let s = await c(e.subarray(a, o));
		s && r.push(t(s));
	}
	return r.join("\n");
}
function u(e) {
	let t = [], n = [...e.matchAll(/\/Type\s*\/StructElem/g)].map((e) => e.index ?? 0);
	for (let r = 0; r < n.length; r++) {
		let i = n[r], a = n[r + 1] ?? e.length, o = e.indexOf("endobj", i), s = o >= 0 && o < a ? o : a;
		t.push(e.slice(i, s));
	}
	return t;
}
function d(e) {
	let t = /\/Alt\s*<([0-9A-Fa-f\s]*)>/.exec(e);
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
	let n = /\/Alt\s*\(((?:[^()\\]|\\.)*)\)/.exec(e);
	return n ? n[1].replace(/\\(.)/g, "$1") : null;
}
function f(e) {
	return /^[\w./-]+\.(?:png|jpe?g|pdf|eps|svg|gif|tiff?|bmp|jbig2|jp2)$/i.test(e.trim());
}
function p(e) {
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
			let e = d(n);
			e && !f(e) && t.figuresWithAlt++;
		} else e && /^(?:H[1-6]?|Title)$/.test(e) ? t.headings++ : e === "Table" && t.tables++;
	}
	return t;
}
async function m(e) {
	let t = await l(e), n = /\/StructTreeRoot\b/.test(t), r = /\/Marked\s+true\b/.test(t), i = /\/Lang\s*\(([^)]*)\)/.exec(t)?.[1] ?? null, a = /pdfuaid:part\s*=\s*"(\d)"|<pdfuaid:part>\s*(\d)/.exec(t), o = a ? Number(a[1] ?? a[2]) : null, s = /<dc:title>.*?<rdf:li[^>]*>([^<]*)<\/rdf:li>/s.exec(t)?.[1]?.trim() || (/\/Title\s*\(([^)]*)\)/.exec(t)?.[1] ?? null);
	return {
		tagged: n && r,
		lang: i,
		uaPart: o,
		...p(u(t)),
		title: s || null
	};
}
//#endregion
export { e as CLASS_SUPPORT, i as detectDocumentLanguage, r as documentClassOf, a as hasDocumentMetadata, o as injectDocumentMetadata, m as inspectPdfTagging, s as kernelLacksTagging };
