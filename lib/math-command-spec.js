//#region src/math-command-spec.ts
var e = {
	source: "tex",
	confidence: "exact"
}, t = {
	source: "latex-kernel",
	confidence: "exact"
}, n = {
	source: "amsmath",
	package: "amsmath",
	confidence: "curated"
}, r = {
	source: "package",
	package: "amsfonts",
	confidence: "curated"
}, i = {
	source: "mathtools",
	package: "mathtools",
	confidence: "curated"
}, a = {
	source: "unicode-math",
	package: "unicode-math",
	confidence: "curated"
}, o = (e, t = "atom") => ({
	syntax: "required",
	role: e,
	...t === "atom" ? {} : { consumption: t }
}), s = (e) => ({
	syntax: "optional",
	role: e
});
function c(e, t, n, r = [], i = { expansion: "structural" }) {
	return e.map((e) => ({
		name: e,
		behavior: t,
		arguments: r,
		provenance: n,
		expansion: i.expansion,
		...i.acceptsStar === void 0 ? {} : { acceptsStar: i.acceptsStar },
		...i.mathClass === void 0 ? {} : { mathClass: i.mathClass }
	}));
}
var l = [
	...c([
		"acute",
		"bar",
		"breve",
		"check",
		"ddot",
		"dot",
		"grave",
		"hat",
		"mathring",
		"tilde",
		"vec",
		"widehat",
		"widetilde"
	], "modifier", t, [o("nucleus")]),
	...c([
		"overbrace",
		"overline",
		"underline",
		"underbrace"
	], "modifier", e, [o("nucleus")]),
	...c([
		"overset",
		"stackrel",
		"underset"
	], "modifier", n, [o("annotation"), o("nucleus")]),
	...c(["accentset", "underaccent"], "modifier", i, [o("annotation"), o("nucleus")]),
	...c([
		"mathbf",
		"mathcal",
		"mathit",
		"mathrm",
		"mathsf",
		"mathtt",
		"mathnormal"
	], "style", t, [o("body")]),
	...c(["mathbb", "mathfrak"], "style", r, [o("body")]),
	...c(["boldsymbol", "pmb"], "style", n, [o("body")]),
	...c([
		"symbf",
		"symbfit",
		"symcal",
		"symfrak",
		"symit",
		"symnormal",
		"symrm",
		"symsf",
		"symsfit",
		"symtt",
		"symbb"
	], "style", a, [o("body")]),
	...c(["operatorname"], "named-surface", n, [o("name")], {
		expansion: "structural",
		acceptsStar: !0,
		mathClass: "operator"
	}),
	...c(/* @__PURE__ */ "arccos.arcsin.arctan.arg.cos.cosh.cot.coth.csc.deg.det.dim.exp.gcd.hom.inf.ker.lg.lim.liminf.limsup.ln.log.max.min.Pr.sec.sin.sinh.sup.tan.tanh".split("."), "named-surface", e, [], {
		expansion: "structural",
		mathClass: "operator"
	}),
	...c(["frac"], "fraction", t, [o("numerator"), o("denominator")]),
	...c([
		"dfrac",
		"tfrac",
		"binom",
		"dbinom",
		"tbinom"
	], "fraction", n, [o("numerator"), o("denominator")]),
	...c(["cfrac"], "fraction", n, [
		s("options"),
		o("numerator"),
		o("denominator")
	]),
	...c(["sqrt"], "root", t, [s("degree"), o("radicand")]),
	...c([
		"sum",
		"prod",
		"coprod",
		"int",
		"oint",
		"bigcap",
		"bigcup",
		"bigsqcup",
		"bigvee",
		"bigwedge",
		"bigodot",
		"bigoplus",
		"bigotimes",
		"biguplus"
	], "atom", e, [], {
		expansion: "structural",
		mathClass: "operator"
	}),
	...c([
		"iint",
		"iiint",
		"iiiint"
	], "atom", n, [], {
		expansion: "structural",
		mathClass: "operator"
	}),
	...c(["mathord"], "atom", e, [o("nucleus")], {
		expansion: "structural",
		mathClass: "ordinary"
	}),
	...c(["mathop"], "atom", e, [o("nucleus")], {
		expansion: "structural",
		mathClass: "operator"
	}),
	...c(["mathbin"], "atom", e, [o("nucleus")], {
		expansion: "structural",
		mathClass: "binary"
	}),
	...c(["mathrel"], "atom", e, [o("nucleus")], {
		expansion: "structural",
		mathClass: "relation"
	}),
	...c(["mathopen"], "delimiter", e, [o("nucleus")], {
		expansion: "structural",
		mathClass: "opening"
	}),
	...c(["mathclose"], "delimiter", e, [o("nucleus")], {
		expansion: "structural",
		mathClass: "closing"
	}),
	...c(["mathinner"], "atom", e, [o("nucleus")], {
		expansion: "structural",
		mathClass: "inner"
	}),
	...c([
		"left",
		"right",
		"middle",
		"big",
		"Big",
		"bigg",
		"Bigg"
	], "delimiter", e, [o("delimiter", "token")]),
	...c([
		"langle",
		"lbrace",
		"lceil",
		"lfloor",
		"lgroup",
		"lmoustache",
		"lvert",
		"lVert"
	], "atom", e, [], {
		expansion: "structural",
		mathClass: "opening"
	}),
	...c([
		"rangle",
		"rbrace",
		"rceil",
		"rfloor",
		"rgroup",
		"rmoustache",
		"rvert",
		"rVert"
	], "atom", e, [], {
		expansion: "structural",
		mathClass: "closing"
	}),
	...c([
		"prime",
		"top",
		"bot",
		"dagger",
		"ddagger",
		"ast",
		"star"
	], "atom", e),
	...c(["prescript"], "atom", i, [
		o("superscript"),
		o("subscript"),
		o("base")
	]),
	...c(["sideset"], "atom", n, [
		o("left"),
		o("right"),
		o("base")
	]),
	...c(["mathchoice"], "style", e, [
		o("choice-display"),
		o("choice-text"),
		o("choice-script"),
		o("choice-scriptscript")
	]),
	...c([
		"phantom",
		"hphantom",
		"vphantom"
	], "style", t, [o("body")]),
	...c(["smash"], "style", n, [s("options"), o("body")]),
	...c(["text"], "text", n, [o("content")]),
	...c([
		"mbox",
		"textrm",
		"textsf",
		"texttt",
		"textnormal"
	], "text", t, [o("content")]),
	...c([
		"!",
		",",
		":",
		";",
		"enspace",
		"enskip",
		"quad",
		"qquad",
		"thinspace",
		"medspace",
		"thickspace"
	], "spacing", t, [], { expansion: "ignore" }),
	...c([
		"limits",
		"nolimits",
		"displaylimits"
	], "no-op", e, [], { expansion: "ignore" }),
	...c(["\\", "cr"], "alignment", e),
	...c(["substack"], "alignment", n, [o("body")]),
	...c(["tensor"], "opaque", {
		source: "package",
		package: "tensor",
		confidence: "curated"
	}, [o("base"), o("index")], { expansion: "opaque" }),
	...c(["qty", "SI"], "opaque", {
		source: "package",
		package: "siunitx",
		confidence: "curated"
	}, [
		s("options"),
		o("value"),
		o("unit")
	], { expansion: "opaque" }),
	...c(["si", "unit"], "opaque", {
		source: "package",
		package: "siunitx",
		confidence: "curated"
	}, [s("options"), o("unit")], { expansion: "opaque" }),
	...c(["ce", "ch"], "opaque", {
		source: "package",
		package: "mhchem",
		confidence: "curated"
	}, [o("content")], { expansion: "opaque" }),
	...c([
		"bra",
		"ket",
		"braket",
		"Bra",
		"Ket"
	], "opaque", {
		source: "package",
		package: "braket",
		confidence: "curated"
	}, [o("content")], { expansion: "opaque" })
].sort((e, t) => e.name.localeCompare(t.name)), u = Object.freeze(l.map((e) => Object.freeze({
	...e,
	arguments: Object.freeze([...e.arguments]),
	provenance: Object.freeze({ ...e.provenance })
}))), d = /* @__PURE__ */ new Map();
for (let e of u) {
	if (d.has(e.name)) throw Error(`Duplicate MathCommandSpec: ${e.name}`);
	d.set(e.name, e);
}
function f(e) {
	return d.get(e);
}
//#endregion
export { u as MATH_COMMAND_SPECS, f as getMathCommandSpec };
