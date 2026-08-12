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
	source: "package",
	package: "physics",
	confidence: "curated"
}, o = {
	source: "unicode-math",
	package: "unicode-math",
	confidence: "curated"
}, s = (e, t = "atom") => ({
	syntax: "required",
	role: e,
	...t === "atom" ? {} : { consumption: t }
}), c = (e) => ({
	syntax: "optional",
	role: e
});
function l(e, t, n, r = [], i = { expansion: "structural" }) {
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
var u = [
	...l([
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
	], "modifier", t, [s("nucleus")]),
	...l([
		"overbrace",
		"overline",
		"underline",
		"underbrace"
	], "modifier", e, [s("nucleus")]),
	...l([
		"overset",
		"stackrel",
		"underset"
	], "modifier", n, [s("annotation"), s("nucleus")]),
	...l(["accentset", "underaccent"], "modifier", i, [s("annotation"), s("nucleus")]),
	...l([
		"mathbf",
		"mathcal",
		"mathit",
		"mathrm",
		"mathsf",
		"mathtt",
		"mathnormal"
	], "style", t, [s("body")]),
	...l(["mathbb", "mathfrak"], "style", r, [s("body")]),
	...l(["boldsymbol", "pmb"], "style", n, [s("body")]),
	...l([
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
	], "style", o, [s("body")]),
	...l(["operatorname"], "named-surface", n, [s("name")], {
		expansion: "structural",
		acceptsStar: !0,
		mathClass: "operator"
	}),
	...l(/* @__PURE__ */ "arccos.arcsin.arctan.arg.cos.cosh.cot.coth.csc.deg.det.dim.exp.gcd.hom.inf.ker.lg.lim.liminf.limsup.ln.log.max.min.Pr.sec.sin.sinh.sup.tan.tanh".split("."), "named-surface", e, [], {
		expansion: "structural",
		mathClass: "operator"
	}),
	...l(["frac"], "fraction", t, [s("numerator"), s("denominator")]),
	...l([
		"dfrac",
		"tfrac",
		"binom",
		"dbinom",
		"tbinom"
	], "fraction", n, [s("numerator"), s("denominator")]),
	...l(["cfrac"], "fraction", n, [
		c("options"),
		s("numerator"),
		s("denominator")
	]),
	...l(["sqrt"], "root", t, [c("degree"), s("radicand")]),
	...l([
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
	...l([
		"iint",
		"iiint",
		"iiiint"
	], "atom", n, [], {
		expansion: "structural",
		mathClass: "operator"
	}),
	...l([
		"cap",
		"cdot",
		"circ",
		"cup",
		"otimes",
		"oplus",
		"setminus",
		"times",
		"vee",
		"wedge"
	], "atom", e, [], {
		expansion: "structural",
		mathClass: "binary"
	}),
	...l(["mathord"], "atom", e, [s("nucleus")], {
		expansion: "structural",
		mathClass: "ordinary"
	}),
	...l(["mathop"], "atom", e, [s("nucleus")], {
		expansion: "structural",
		mathClass: "operator"
	}),
	...l(["mathbin"], "atom", e, [s("nucleus")], {
		expansion: "structural",
		mathClass: "binary"
	}),
	...l(["mathrel"], "atom", e, [s("nucleus")], {
		expansion: "structural",
		mathClass: "relation"
	}),
	...l([
		"ge",
		"geq",
		"in",
		"le",
		"leq",
		"mid",
		"ne",
		"neq",
		"notin",
		"subset",
		"subseteq",
		"supset",
		"supseteq"
	], "atom", e, [], {
		expansion: "structural",
		mathClass: "relation"
	}),
	...l(["mathopen"], "delimiter", e, [s("nucleus")], {
		expansion: "structural",
		mathClass: "opening"
	}),
	...l(["mathclose"], "delimiter", e, [s("nucleus")], {
		expansion: "structural",
		mathClass: "closing"
	}),
	...l(["mathinner"], "atom", e, [s("nucleus")], {
		expansion: "structural",
		mathClass: "inner"
	}),
	...l([
		"left",
		"right",
		"middle",
		"big",
		"Big",
		"bigg",
		"Bigg"
	], "delimiter", e, [s("delimiter", "token")]),
	...l([
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
	...l([
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
	...l([
		"prime",
		"top",
		"bot",
		"dagger",
		"ddagger",
		"ast",
		"star"
	], "atom", e),
	...l(["prescript"], "atom", i, [
		s("superscript"),
		s("subscript"),
		s("base")
	]),
	...l(["sideset"], "atom", n, [
		s("left"),
		s("right"),
		s("base")
	]),
	...l(["mathchoice"], "style", e, [
		s("choice-display"),
		s("choice-text"),
		s("choice-script"),
		s("choice-scriptscript")
	]),
	...l([
		"phantom",
		"hphantom",
		"vphantom"
	], "style", t, [s("body")]),
	...l(["smash"], "style", n, [c("options"), s("body")]),
	...l(["text"], "text", n, [s("content")]),
	...l([
		"mbox",
		"textrm",
		"textsf",
		"texttt",
		"textnormal"
	], "text", t, [s("content")]),
	...l([
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
	...l([
		"limits",
		"nolimits",
		"displaylimits"
	], "no-op", e, [], { expansion: "ignore" }),
	...l(["\\", "cr"], "alignment", e),
	...l(["substack"], "alignment", n, [s("body")]),
	...l([
		"abs",
		"norm",
		"eval"
	], "modifier", a, [s("nucleus")]),
	...l(["dv", "pdv"], "atom", a, [
		c("degree"),
		s("body"),
		s("index")
	]),
	...l(["tensor"], "opaque", {
		source: "package",
		package: "tensor",
		confidence: "curated"
	}, [s("base"), s("index")], { expansion: "opaque" }),
	...l(["qty", "SI"], "opaque", {
		source: "package",
		package: "siunitx",
		confidence: "curated"
	}, [
		c("options"),
		s("value"),
		s("unit")
	], { expansion: "opaque" }),
	...l(["si", "unit"], "opaque", {
		source: "package",
		package: "siunitx",
		confidence: "curated"
	}, [c("options"), s("unit")], { expansion: "opaque" }),
	...l(["ce", "ch"], "opaque", {
		source: "package",
		package: "mhchem",
		confidence: "curated"
	}, [s("content")], { expansion: "opaque" }),
	...l([
		"bra",
		"ket",
		"braket",
		"Bra",
		"Ket"
	], "opaque", {
		source: "package",
		package: "braket",
		confidence: "curated"
	}, [s("content")], { expansion: "opaque" })
].sort((e, t) => e.name.localeCompare(t.name)), d = Object.freeze(u.map((e) => Object.freeze({
	...e,
	arguments: Object.freeze([...e.arguments]),
	provenance: Object.freeze({ ...e.provenance })
}))), f = /* @__PURE__ */ new Map();
for (let e of d) {
	if (f.has(e.name)) throw Error(`Duplicate MathCommandSpec: ${e.name}`);
	f.set(e.name, e);
}
function p(e) {
	return f.get(e);
}
//#endregion
export { d as MATH_COMMAND_SPECS, p as getMathCommandSpec };
