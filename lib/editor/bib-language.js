//#region src/editor/bib-language.ts
var e = {
	defaultToken: "",
	tokenPostfix: ".bib",
	tokenizer: {
		root: [
			[/@\w+/, {
				token: "keyword",
				next: "@entry"
			}],
			[/%.*$/, "comment"],
			[/[^{},]+/, "string"]
		],
		entry: [
			[/[ \t\r\n]+/, "white"],
			[/{/, {
				token: "delimiter.curly",
				next: "@body"
			}],
			[/[^a-zA-Z0-9]/, {
				token: "",
				next: "@pop"
			}]
		],
		body: [
			[/[a-zA-Z0-9_-]+(?=\s*=)/, "attribute.name"],
			[/=/, "delimiter"],
			[/{/, {
				token: "delimiter.curly",
				next: "@curlyString"
			}],
			[/"/, {
				token: "string",
				next: "@doubleQuoteString"
			}],
			[/,/, "delimiter"],
			[/}/, {
				token: "delimiter.curly",
				next: "@popall"
			}],
			[/[ \t\r\n]+/, "white"]
		],
		curlyString: [
			[/[^{}]+/, "string"],
			[/{/, {
				token: "delimiter.curly",
				next: "@curlyString"
			}],
			[/}/, {
				token: "delimiter.curly",
				next: "@pop"
			}]
		],
		doubleQuoteString: [[/[^"]+/, "string"], [/"/, {
			token: "string",
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
			open: "\"",
			close: "\""
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
			open: "\"",
			close: "\""
		}
	]
};
//#endregion
export { e as bibLanguage, t as bibLanguageConfig };
