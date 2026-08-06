//#region src/lsp/bib-completion.ts
var e = /* @__PURE__ */ "article.book.mvbook.inbook.bookinbook.suppbook.booklet.collection.mvcollection.incollection.suppcollection.manual.misc.online.patent.periodical.suppperiodical.proceedings.mvproceedings.inproceedings.reference.mvreference.inreference.report.set.thesis.unpublished.xdata.conference.electronic.mastersthesis.phdthesis.techreport.www".split("."), t = /* @__PURE__ */ "author.editor.editora.editorb.editorc.translator.annotator.commentator.introduction.foreword.afterword.holder.title.subtitle.titleaddon.maintitle.mainsubtitle.maintitleaddon.booktitle.booksubtitle.booktitleaddon.journaltitle.journalsubtitle.journal.date.year.month.day.eventdate.origdate.urldate.volume.volumes.number.issue.edition.version.series.chapter.pages.pagetotal.pagination.publisher.institution.organization.location.venue.type.howpublished.note.addendum.doi.eprint.eprinttype.eprintclass.url.isbn.issn.isrn.ismn.iswc.language.langid.keywords.abstract.annotation.crossref.xref.xdata.related.relatedtype.options.shorthand.sortkey.sortname.sorttitle.sortyear".split("."), n = {
	article: [
		"author",
		"title",
		"journaltitle",
		"journal",
		"date",
		"year",
		"volume",
		"number",
		"pages"
	],
	book: [
		"author",
		"editor",
		"title",
		"publisher",
		"location",
		"date",
		"year",
		"edition",
		"volume"
	],
	mvbook: [
		"author",
		"editor",
		"title",
		"publisher",
		"location",
		"date",
		"year",
		"volumes"
	],
	inbook: [
		"author",
		"title",
		"booktitle",
		"editor",
		"publisher",
		"location",
		"date",
		"year",
		"chapter",
		"pages"
	],
	bookinbook: [
		"author",
		"title",
		"booktitle",
		"editor",
		"publisher",
		"date",
		"year",
		"pages"
	],
	collection: [
		"editor",
		"title",
		"publisher",
		"location",
		"date",
		"year",
		"edition"
	],
	mvcollection: [
		"editor",
		"title",
		"publisher",
		"location",
		"date",
		"year",
		"volumes"
	],
	incollection: [
		"author",
		"title",
		"booktitle",
		"editor",
		"publisher",
		"location",
		"date",
		"year",
		"pages"
	],
	proceedings: [
		"editor",
		"title",
		"publisher",
		"location",
		"venue",
		"eventdate",
		"date",
		"year"
	],
	mvproceedings: [
		"editor",
		"title",
		"publisher",
		"location",
		"eventdate",
		"date",
		"year",
		"volumes"
	],
	inproceedings: [
		"author",
		"title",
		"booktitle",
		"editor",
		"venue",
		"eventdate",
		"date",
		"year",
		"pages"
	],
	conference: [
		"author",
		"title",
		"booktitle",
		"editor",
		"venue",
		"date",
		"year",
		"pages"
	],
	thesis: [
		"author",
		"title",
		"type",
		"institution",
		"location",
		"date",
		"year"
	],
	mastersthesis: [
		"author",
		"title",
		"school",
		"institution",
		"address",
		"date",
		"year"
	],
	phdthesis: [
		"author",
		"title",
		"school",
		"institution",
		"address",
		"date",
		"year"
	],
	report: [
		"author",
		"title",
		"type",
		"institution",
		"number",
		"location",
		"date",
		"year"
	],
	techreport: [
		"author",
		"title",
		"institution",
		"type",
		"number",
		"address",
		"date",
		"year"
	],
	manual: [
		"author",
		"editor",
		"title",
		"organization",
		"location",
		"edition",
		"date",
		"year"
	],
	online: [
		"author",
		"editor",
		"title",
		"date",
		"year",
		"url",
		"urldate"
	],
	electronic: [
		"author",
		"title",
		"date",
		"year",
		"url",
		"urldate"
	],
	www: [
		"author",
		"title",
		"date",
		"year",
		"url",
		"urldate"
	],
	patent: [
		"author",
		"holder",
		"title",
		"type",
		"number",
		"location",
		"date",
		"year"
	],
	periodical: [
		"editor",
		"title",
		"issuetitle",
		"volume",
		"number",
		"date",
		"year"
	],
	unpublished: [
		"author",
		"title",
		"date",
		"year",
		"howpublished",
		"note"
	],
	misc: [
		"author",
		"editor",
		"title",
		"date",
		"year",
		"howpublished"
	],
	xdata: []
}, r = [
	"jan",
	"feb",
	"mar",
	"apr",
	"may",
	"jun",
	"jul",
	"aug",
	"sep",
	"oct",
	"nov",
	"dec"
];
function i(t) {
	return e.filter((e) => e.startsWith(t.prefix.toLowerCase())).map((e) => ({
		label: e,
		kind: "module",
		insertText: e,
		detail: "BibTeX/biblatex entry type",
		sortText: `0_${e}`,
		replaceLength: t.prefix.length
	}));
}
function a(e) {
	let r = n[e.entryType ?? ""] ?? [], i = [.../* @__PURE__ */ new Set([...r, ...t])], a = new Set(e.usedFields);
	return i.filter((t) => t.startsWith(e.prefix) && !a.has(t)).map((t) => {
		let n = r.indexOf(t);
		return {
			label: t,
			kind: "variable",
			insertText: t,
			detail: n >= 0 ? `Common for @${e.entryType}` : "BibTeX/biblatex field",
			sortText: `${n >= 0 ? `0_${String(n).padStart(3, "0")}` : "1"}_${t}`,
			replaceLength: e.prefix.length
		};
	});
}
function o(e, t) {
	return t.index.getBibEntries(t.document.path).filter((t) => t.key.startsWith(e.prefix)).map((t) => ({
		label: t.key,
		kind: "reference",
		insertText: t.key,
		detail: `@${t.type} · ${t.location.file}:${t.location.line}`,
		documentation: [
			t.author,
			t.title,
			t.year
		].filter(Boolean).join(" · "),
		replaceLength: e.prefix.length
	}));
}
function s(e, t) {
	let n = new Map(t.index.getBibStrings(t.document.path).map((e) => [e.name, e]));
	return [.../* @__PURE__ */ new Set([...r, ...n.keys()])].filter((t) => t.startsWith(e.prefix.toLowerCase())).sort().map((t) => {
		let r = n.get(t);
		return {
			label: t,
			kind: "variable",
			insertText: t,
			detail: r ? `@string · ${r.location.file}:${r.location.line}` : "BibTeX month string",
			...r?.value ? { documentation: r.value } : {},
			sortText: `${r ? "0" : "1"}_${t}`,
			replaceLength: e.prefix.length
		};
	});
}
function c(e) {
	e.registerResolver("bib-entry-type", (e) => e.type === "bibtex" ? i(e) : []), e.registerResolver("bib-field", (e) => e.type === "bibtex" ? a(e) : []), e.registerResolver("bib-entry-key", (e, t) => e.type === "bibtex" ? o(e, t) : []), e.registerResolver("bib-string", (e, t) => e.type === "bibtex" ? s(e, t) : []);
}
//#endregion
export { c as registerBibCompletionResolvers };
