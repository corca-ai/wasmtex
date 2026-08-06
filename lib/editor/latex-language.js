//#region src/editor/latex-language.ts
var e = {
	defaultToken: "",
	tokenPostfix: ".latex",
	brackets: [
		{
			open: "{",
			close: "}",
			token: "delimiter.curly"
		},
		{
			open: "[",
			close: "]",
			token: "delimiter.bracket"
		},
		{
			open: "(",
			close: ")",
			token: "delimiter.parenthesis"
		}
	],
	tokenizer: {
		root: [
			[/%.*$/, "comment"],
			[/\$\$/, {
				token: "string.math",
				next: "@mathDouble"
			}],
			[/\$/, {
				token: "string.math",
				next: "@mathInline"
			}],
			[/\\begin\{/, {
				token: "keyword",
				next: "@envName"
			}],
			[/\\end\{/, {
				token: "keyword",
				next: "@envName"
			}],
			[/\\[a-zA-Z@]+\*?/, "keyword"],
			[/\\[^a-zA-Z]/, "keyword"],
			[/[{}]/, "delimiter.curly"],
			[/[[\]]/, "delimiter.bracket"],
			[/[&~^_]/, "keyword.operator"]
		],
		mathInline: [
			[/[^$\\]+/, "string.math"],
			[/\\[a-zA-Z]+/, "string.math.keyword"],
			[/\\[^a-zA-Z]/, "string.math.keyword"],
			[/\$/, {
				token: "string.math",
				next: "@pop"
			}]
		],
		mathDouble: [
			[/[^$\\]+/, "string.math"],
			[/\\[a-zA-Z]+/, "string.math.keyword"],
			[/\\[^a-zA-Z]/, "string.math.keyword"],
			[/\$\$/, {
				token: "string.math",
				next: "@pop"
			}]
		],
		envName: [[/[a-zA-Z*]+/, "type"], [/\}/, {
			token: "keyword",
			next: "@pop"
		}]]
	}
}, t = {
	comments: { lineComment: "%" },
	brackets: [
		["{", "}"],
		["[", "]"],
		["(", ")"]
	],
	autoClosingPairs: [
		{
			open: "{",
			close: "}"
		},
		{
			open: "[",
			close: "]"
		},
		{
			open: "(",
			close: ")"
		},
		{
			open: "$",
			close: "$"
		}
	],
	surroundingPairs: [
		{
			open: "{",
			close: "}"
		},
		{
			open: "[",
			close: "]"
		},
		{
			open: "(",
			close: ")"
		},
		{
			open: "$",
			close: "$"
		}
	]
};
//#endregion
export { e as latexLanguage, t as latexLanguageConfig };
